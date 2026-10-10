import { expect, test } from "bun:test";
import { Engine } from "../src/core/engine.ts";
import { Store } from "../src/storage/store.ts";
import { ModelSummarizer } from "../src/compactor/summarizer.ts";
import { Retrieval } from "../src/core/retrieval.ts";
import { sessionTree, type Node, type Publication } from "../src/core/types.ts";

const fact = "Verified evidence. ".repeat(16);
function reply(prompt: string) {
  return prompt.includes("BATCH_CONTRACT") ? JSON.stringify(JSON.parse(prompt.split("UNTRUSTED_JSON_DATA:\n")[1]!).map((r: any) => ({ id: r.id, text: fact }))) : fact;
}
function seed(engine: Engine, session: string, turn: string, count: number, size = 700) {
  engine.register(session, "scope", "p"); engine.admit(session, turn);
  for (let i = 0; i < count; i++) engine.append({ sessionId: session, generation: 0, eventKey: `${turn}:${i}`, turnId: turn, kind: "assistant", timestamp: "2026-10-10T00:00:00Z", projectId: "p", payload: `LEAF_${i} ${"x".repeat(size)}` });
  engine.finish(session, turn, "completed");
}

test("leaf batches reduce calls without changing originals, byte limits, or retention authorization", async () => {
  async function run(leafBatchSize: number) {
    const store = new Store(); let calls = 0; const batchKinds: string[] = [];
    try {
      const engine = new Engine(store, new ModelSummarizer(async p => { calls++; return reply(p); }, "fixture"), { maxRunningJobs: 1, parentBatchSize: 8, leafBatchSize, jobEvent: (event, d) => { if (event === "job.batch") batchKinds.push(d.kind); } });
      seed(engine, "a", "turn", 16); const before = engine.sources("a", 0); await engine.drain(); const workCalls = calls;
      expect(engine.sources("a", 0)).toEqual(before); expect(store.all<Publication>("publications")).toHaveLength(1);
      if (leafBatchSize > 1) {
        expect(batchKinds).toContain("leaf");
        const leaf = engine.findNode(sessionTree("a", 0), 0, 1)!;
        expect(leaf.evidenceStart).toBe(0); expect(leaf.evidenceEnd).toBe(8);
        const nodes = (store.db.query("SELECT value FROM nodes").all() as { value: string }[]).map(r => JSON.parse(r.value) as Node);
        expect(nodes.every(n => n.bytes <= 512)).toBe(true);
        engine.register("b", "scope", "p"); const snapshot = engine.admit("b", "read").snapshot;
        expect(new Retrieval(engine).zoom(snapshot, leaf.id).sourceId).toBe(leaf.source!);
        engine.retire("a", "edit", 2); await engine.drain();
        expect(() => new Retrieval(engine).zoom(snapshot, leaf.id)).toThrow("SNAPSHOT_REVOKED");
        expect(engine.sources("a", 1).map(s => s.payload)).toEqual(before.slice(0, 2).map(s => s.payload));
        expect(engine.findNode(sessionTree("a", 1), 0, 1)!.evidenceEnd).toBeLessThanOrEqual(2);
      }
      return workCalls;
    } finally { store.close(); }
  }
  const baseline = await run(1), batched = await run(8);
  expect(baseline).toBe(21); expect(batched).toBe(7);
});

test("an unpublished batch cannot expose any sibling evidence through search or zoom", async () => {
  const store = new Store();
  try {
    const engine = new Engine(store, new ModelSummarizer(async p => reply(p), "fixture"), { leafBatchSize: 8, maxRunningJobs: 1 });
    engine.register("reader", "scope", "p"); const pinned = engine.admit("reader", "read").snapshot;
    seed(engine, "a", "turn", 8); await engine.workOne();
    const leaf = engine.findNode(sessionTree("a", 0), 0, 1)!;
    expect(leaf.evidenceEnd).toBe(8);
    expect(() => new Retrieval(engine).zoom(pinned, leaf.id)).toThrow("NOT_VISIBLE");
    expect(new Retrieval(engine).search(pinned, "Verified evidence").hits).toHaveLength(0);
  } finally { store.close(); }
});

test("leaf peer selection failure releases every matching claim", async () => {
  const store = new Store();
  try {
    const engine = new Engine(store, new ModelSummarizer(async p => reply(p), "fixture"), { leafBatchSize: 8, maxRunningJobs: 1 });
    seed(engine, "a", "turn", 8); const claim = store.claimLeafPeers.bind(store);
    store.claimLeafPeers = (...args) => {
      const peers = claim(...args), input = peers[0]!.input;
      if (input.type === "leaf") store.db.query("DELETE FROM sources WHERE id=?").run(input.source);
      return peers;
    };
    await expect(engine.workOne()).rejects.toThrow();
    expect((store.db.query("SELECT count(*) n FROM jobs WHERE status='running'").get() as { n: number }).n).toBe(0);
  } finally { store.close(); }
});

test("leaf batches never combine different turns or oversized inputs", async () => {
  const store = new Store(); const groups: any[][] = [];
  try {
    const engine = new Engine(store, new ModelSummarizer(async p => { if (p.includes("BATCH_CONTRACT")) groups.push(JSON.parse(p.split("UNTRUSTED_JSON_DATA:\n")[1]!)); return reply(p); }, "fixture"), { maxRunningJobs: 1, leafBatchSize: 8 });
    seed(engine, "a", "first", 2);
    // Seed another backfill turn without bypassing readiness in ordinary admission.
    store.set("turns", '["a",0,"second"]', { id: "second", sessionId: "a", generation: 0, start: 2 });
    for (let i = 2; i < 4; i++) {
      engine.append({ sessionId: "a", generation: 0, eventKey: `second:${i}`, turnId: "second", kind: "assistant", timestamp: "2026-10-10T00:00:00Z", projectId: "p", payload: "SECOND " + "x".repeat(i === 2 ? 14000 : 700) });
    }
    engine.finish("a", "second", "completed"); await engine.drain();
    expect(groups).toHaveLength(1);
    expect(groups[0]!.every(r => r.data.includes('"turnId":"first"'))).toBe(true);
    expect(engine.sources("a", 0)[2]!.payload).toHaveLength(14007);
    expect(store.all<Publication>("publications")).toHaveLength(2);
  } finally { store.close(); }
});

test("leaf batch cancellation releases all claims and revocation rejects late answers", async () => {
  for (const revoke of [false, true]) {
    const store = new Store(); let late!: (text: string) => void, prompt = "";
    try {
      const engine = new Engine(store, new ModelSummarizer(async p => { prompt = p; return new Promise<string>(resolve => { late = resolve; }); }, "fixture"), { leafBatchSize: 8, maxRunningJobs: 1 });
      seed(engine, "a", "turn", 8); const original = engine.sources("a", 0); const controller = new AbortController();
      const pending = engine.workOne(controller.signal); await Bun.sleep(5);
      expect((store.db.query("SELECT count(*) n FROM jobs WHERE status='running'").get() as { n: number }).n).toBe(8);
      expect(store.claim(Date.now(), 1000, 1)).toBeUndefined();
      if (revoke) engine.retire("a", "delete"); else controller.abort(new Error("cancel"));
      if (!revoke) await expect(pending).rejects.toThrow("cancel");
      late(reply(prompt)); if (revoke) expect(await pending).toBe(true); else await Bun.sleep(5);
      expect(store.all("publications")).toHaveLength(0);
      expect((store.db.query("SELECT count(*) n FROM nodes").get() as { n: number }).n).toBe(0);
      expect((store.db.query("SELECT count(*) n FROM jobs WHERE status IN ('running','failed')").get() as { n: number }).n).toBe(0);
      if (!revoke) expect(engine.sources("a", 0)).toEqual(original);
    } finally { store.close(); }
  }
});

test("one-time provider recovery preserves originals and excludes permanent errors and other scopes", () => {
  const store = new Store();
  try {
    const engine = new Engine(store); seed(engine, "a", "turn", 3);
    for (const error of ["Generate.UnavailableError: model is temporarily unavailable", "HTTP 401 Unauthorized", "Invalid API key"]) store.fail(store.claim()!, error);
    engine.register("other", "other-scope", "p"); engine.admit("other", "turn");
    engine.append({ sessionId: "other", generation: 0, eventKey: "other", turnId: "turn", kind: "assistant", timestamp: "2026-10-10T00:00:00Z", projectId: "p", payload: "other" }); store.fail(store.claim()!, "HTTP 503");
    const original = engine.sources("a", 0);
    expect(engine.recoverProviderFailures("scope")).toBe(1); expect(engine.sources("a", 0)).toEqual(original);
    expect((store.db.query("SELECT count(*) n FROM jobs WHERE status='failed'").get() as { n: number }).n).toBe(3);
    store.fail(store.claim()!, "HTTP 503"); expect(engine.recoverProviderFailures("scope")).toBe(0);
  } finally { store.close(); }
});
