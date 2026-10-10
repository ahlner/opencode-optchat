import { expect, test } from "bun:test";
import { Engine, evidenceInput } from "../src/core/engine.ts";
import { Store } from "../src/storage/store.ts";
import { ModelSummarizer, FakeSummarizer, validSummary } from "../src/compactor/summarizer.ts";
import { Retrieval } from "../src/core/retrieval.ts";
import { MemoryError, type Node, type SourceRecord, type Publication } from "../src/core/types.ts";

const fact = "Verified evidence. ".repeat(16);
function reply(prompt: string): string {
  return prompt.includes("BATCH_CONTRACT") ? JSON.stringify(JSON.parse(prompt.split("UNTRUSTED_JSON_DATA:\n")[1]!).map((r: any) => ({ id: r.id, text: fact }))) : fact;
}
function append(engine: Engine, session: string, turn: string, index: number, payload = "x".repeat(700)) {
  engine.append({ sessionId: session, generation: 0, eventKey: `${turn}:${index}`, turnId: turn, kind: "assistant", timestamp: "2026-10-10T00:00:00Z", projectId: "p", payload });
}

test("drafting notes and call-only absence claims require a finished retry", async () => {
  const draft = "Need summary <=200 bytes. Need include distinct outcomes. Draft: deployment failed. bytes maybe 258. Need <=200. Final concise.";
  expect(validSummary(draft, "")).toBe(false);
  expect(validSummary("No result recorded", '{"kind":"tool_call"}')).toBe(false);
  expect(validSummary("No requests/proposals/decisions/failures/open questions recorded.", "")).toBe(false);
  expect(validSummary("The recorded grep result had zero matches.", '{"kind":"tool_result"}')).toBe(true);
  const responses = [draft, "No result shown", "Recorded tool call. Its result is a separate original."];
  let calls = 0;
  const result = await new ModelSummarizer(async () => { calls++; return responses.shift()!; }, "fixture").summarize('{"kind":"tool_call"}');
  expect(calls).toBe(3); expect(result.promptVersion).toBe("optchat-5");
  await expect(new ModelSummarizer(async () => draft, "fixture").summarize("data")).rejects.toThrow("512 UTF-8 bytes");
});

test("retention revocation fences every member of an outstanding batch", async () => {
  const store = new Store(":memory:"); let late!: (value: string) => void, prompt = "";
  try {
    const engine = new Engine(store, new ModelSummarizer(async p => { if (p.includes("BATCH_CONTRACT")) { prompt = p; return new Promise<string>(r => late = r); } return fact; }, "fixture"), { maxRunningJobs: 1, parentBatchSize: 8 });
    engine.register("a", "scope", "p"); engine.admit("a", "turn"); for (let i = 0; i < 16; i++) append(engine, "a", "turn", i);
    engine.finish("a", "turn", "completed"); for (let i = 0; i < 16; i++) await engine.workOne();
    const pending = engine.workOne(); await Bun.sleep(10); engine.retire("a", "delete");
    late(reply(prompt)); expect(await pending).toBe(true);
    expect(store.all("publications")).toHaveLength(0);
    expect((store.db.query("SELECT count(*) n FROM sources").get() as { n: number }).n).toBe(0);
    expect((store.db.query("SELECT count(*) n FROM nodes").get() as { n: number }).n).toBe(0);
    expect((store.db.query("SELECT count(*) n FROM jobs WHERE status='running' OR status='failed'").get() as { n: number }).n).toBe(0);
  } finally { store.close(); }
});

test("batch IDs, independent byte limits, and drafting checks reject the entire response", async () => {
  let calls = 0;
  const model = new ModelSummarizer(async () => {
    calls++;
    if (calls === 1) return JSON.stringify([{ id: 0, text: fact }, { id: 0, text: fact }]);
    if (calls === 2) return JSON.stringify([{ id: 0, text: "Need summary <=200 bytes" }, { id: 1, text: fact }]);
    return JSON.stringify([{ id: 1, text: "SECOND" }, { id: 0, text: "FIRST" }]);
  }, "fixture");
  const results = await model.summarizeBatch(["first", "second"]);
  expect(results.map(r => r.text)).toEqual(["FIRST", "SECOND"]); expect(calls).toBe(3);
  await expect(new ModelSummarizer(async () => JSON.stringify([{ id: 0, text: "😀".repeat(129) }, { id: 1, text: "ok" }]), "fixture").summarizeBatch(["a", "b"])).rejects.toThrow("SUMMARY_BATCH_INVALID");
});

test("audit projection preserves originals and substantive errors without routine token overhead", () => {
  const record = { kind: "report", payload: JSON.stringify({ agent: "build", model: { id: "model" }, tokens: { input: 123456 }, cost: 99, finish: "tool-calls", snapshot: { start: "same", end: "same", files: [] } }) } as SourceRecord;
  const before = record.payload, projected = evidenceInput(record);
  expect(record.payload).toBe(before); expect(projected).not.toContain("123456"); expect(projected).not.toContain("same"); expect(projected).toContain('"snapshotChanged":false');
  record.payload = JSON.stringify({ error: { message: "FAILED_SENTINEL" }, snapshot: { start: "old", end: "new", files: ["changed.ts"] } });
  expect(evidenceInput(record)).toContain("FAILED_SENTINEL"); expect(evidenceInput(record)).toContain("changed.ts");
  record.payload = JSON.stringify({ command: "test", output: "23 passed", exit: 0 });
  expect(evidenceInput(record)).toContain("23 passed");
});

test("completed-turn parent batching reduces requests and keeps wider evidence authorization explicit", async () => {
  async function run(batchSize: number) {
    const store = new Store(":memory:"); let calls = 0, batches = 0;
    try {
      const engine = new Engine(store, new ModelSummarizer(async p => { calls++; if (p.includes("BATCH_CONTRACT")) batches++; return reply(p); }, "fixture"), { maxRunningJobs: 1, parentBatchSize: batchSize });
      engine.register("a", "scope", "p"); engine.admit("a", "turn");
      for (let i = 0; i < 16; i++) append(engine, "a", "turn", i);
      engine.finish("a", "turn", "failed"); await engine.drain();
      const workCalls = calls;
      expect(engine.sources("a", 0)).toHaveLength(16); expect(store.all<Publication>("publications")[0]!.outcome).toBe("failed");
      if (batchSize > 1) {
        const nodes = (store.db.query("SELECT value FROM nodes").all() as { value: string }[]).map(r => JSON.parse(r.value) as Node);
        const peer = nodes.find(n => n.count === 2 && (n.evidenceEnd ?? 0) > n.start + n.count)!;
        expect(peer).toBeDefined(); expect(batches).toBeGreaterThan(0);
        engine.register("b", "scope", "p"); const snapshot = engine.admit("b", "read").snapshot;
        expect(new Retrieval(engine).zoom(snapshot, peer.id).children).toHaveLength(2);
        engine.retire("a", "edit", 2); await engine.drain();
        expect(() => new Retrieval(engine).zoom(snapshot, peer.id)).toThrow("SNAPSHOT_REVOKED");
        const prefix = engine.findNode('["session","a",1]', 0, 2)!;
        expect(prefix.evidenceEnd ?? 2).toBeLessThanOrEqual(2);
        expect(engine.sources("a", 1)).toHaveLength(2);
      }
      return workCalls;
    } finally { store.close(); }
  }
  const baseline = await run(1), batched = await run(8);
  expect(baseline).toBe(32); expect(batched).toBe(21);
});

test("later batches retain the complete evidence range of every supplied child", async () => {
  const store = new Store(":memory:");
  try {
    const engine = new Engine(store, new ModelSummarizer(async p => reply(p), "fixture"), { maxRunningJobs: 1 });
    engine.register("a", "scope", "p"); engine.admit("a", "turn");
    for (let i = 0; i < 16; i++) append(engine, "a", "turn", i);
    engine.finish("a", "turn", "completed");
    for (let i = 0; i < 24; i++) await engine.workOne();
    // Seed an existing parent's disclosure metadata from an earlier wider batch.
    const earlier = engine.findNode('["session","a",0]', 0, 2)!;
    earlier.evidenceStart = 0; earlier.evidenceEnd = 16;
    store.db.query("UPDATE nodes SET value=? WHERE id=?").run(JSON.stringify(earlier), earlier.id);
    engine.options.parentBatchSize = 2;
    await engine.workOne();
    const peer = engine.findNode('["session","a",0]', 4, 4)!;
    expect(peer.evidenceStart).toBe(0); expect(peer.evidenceEnd).toBe(16);
  } finally { store.close(); }
});

test("batch cancellation releases every fence and discards late answers", async () => {
  const store = new Store(":memory:"); let late!: (value: string) => void, held = false;
  try {
    const engine = new Engine(store, new ModelSummarizer(async p => { if (p.includes("BATCH_CONTRACT") && !held) { held = true; return new Promise<string>(r => late = r); } return reply(p); }, "fixture"), { maxRunningJobs: 1, parentBatchSize: 8 });
    engine.register("a", "scope", "p"); engine.admit("a", "turn"); for (let i = 0; i < 16; i++) append(engine, "a", "turn", i);
    engine.finish("a", "turn", "completed"); for (let i = 0; i < 16; i++) await engine.workOne();
    const controller = new AbortController(), pending = engine.workOne(controller.signal);
    await Bun.sleep(10);
    expect((store.db.query("SELECT count(*) n FROM jobs WHERE status='running'").get() as { n: number }).n).toBe(8);
    expect(await new Engine(store, new FakeSummarizer(), { maxRunningJobs: 1 }).workOne()).toBe(false);
    controller.abort(new Error("STOP_BATCH")); await expect(pending).rejects.toThrow("STOP_BATCH");
    expect((store.db.query("SELECT count(*) n FROM jobs WHERE status='running' OR status='failed'").get() as { n: number }).n).toBe(0);
    late("LATE_NOT_COMMITTED"); await Bun.sleep(10); await engine.drain();
    expect(store.all("publications")).toHaveLength(1); expect(engine.sources("a", 0)).toHaveLength(16);
    expect((store.db.query("SELECT count(*) n FROM nodes WHERE value LIKE '%LATE_NOT_COMMITTED%'").get() as { n: number }).n).toBe(0);
  } finally { store.close(); }
});

test("repair revokes bad derived evidence while preserving originals and unaffected publications", async () => {
  const store = new Store(":memory:"); let first = true;
  try {
    const engine = new Engine(store, { summarize: async () => ({ text: first ? (first = false, "Need summary <=200 bytes. Draft: failed. bytes maybe 258. Final concise.") : "Recorded evidence.", model: "legacy-provider", promptVersion: "old", fallback: false }) });
    engine.register("a", "scope", "p"); engine.admit("a", "turn"); for (let i = 0; i < 4; i++) append(engine, "a", "turn", i, `ORIGINAL_${i}`); engine.finish("a", "turn", "failed"); await engine.drain();
    engine.register("b", "scope", "p"); engine.admit("b", "turn"); append(engine, "b", "turn", 0, "GOOD_ORIGINAL"); engine.finish("b", "turn", "completed"); await engine.drain();
    engine.register("c", "scope", "p"); const snapshot = engine.admit("c", "read").snapshot;
    const originals = engine.sources("a", 0), good = store.all<Publication>("publications").find(p => p.sessionId === "b")!;
    expect(engine.repairInvalidSummaries("scope")).toBeGreaterThan(0);
    expect(engine.sources("a", 0)).toEqual(originals); expect(() => engine.validateSnapshot(snapshot)).toThrow("SNAPSHOT_REVOKED");
    expect(store.all<Publication>("publications").find(p => p.sessionId === "b")!.publicationSeq).toBe(good.publicationSeq);
    await new Engine(store, new FakeSummarizer()).drain();
    expect(store.all("publications")).toHaveLength(2); expect(engine.sources("a", 0)).toEqual(originals);
    expect(engine.repairInvalidSummaries("scope")).toBe(0);
    expect((store.db.query("SELECT count(*) n FROM nodes WHERE value LIKE '%Need summary <=200%'").get() as { n: number }).n).toBe(0);
  } finally { store.close(); }
});

test("batch retries explain the exact rejected items without accepting result-absence claims", async () => {
  const prompts: string[] = [];
  const model = new ModelSummarizer(async prompt => {
    prompts.push(prompt);
    return JSON.stringify([{ id: 0, text: prompts.length === 1 ? "Read completed; no result recorded." : "Requested a read of the API declarations." }, { id: 1, text: "Verified test output: 23 passed." }]);
  }, "fixture");
  const result = await model.summarizeBatch(['{"kind":"tool_call","name":"read"}', "Test output"]);
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain('"id":0,"reason":"TOOL_RESULT_ABSENCE"');
  expect(result[0]!.text).not.toContain("no result");
  expect(validSummary("No result text recorded.", "tool_call")).toBe(false);
  expect(validSummary("No contents/result recorded.", "tool_call")).toBe(false);
});

test("legacy lossless call leaves are projected again and rejected batches recover only once", async () => {
  const store = new Store(":memory:"); const prompts: string[] = [];
  try {
    const engine = new Engine(store, new ModelSummarizer(async p => { prompts.push(p); return "Requested a read of declarations."; }, "fixture"), { compactEvidence: true });
    engine.register("a", "scope", "p"); engine.admit("a", "turn");
    engine.append({ sessionId: "a", generation: 0, eventKey: "call", turnId: "turn", kind: "tool_call", timestamp: "2026-10-10T00:00:00Z", projectId: "p", payload: JSON.stringify({ name: "read", input: { path: "api.d.ts" }, executed: false, status: "completed" }) });
    append(engine, "a", "turn", 1);
    engine.finish("a", "turn", "completed");
    await new Engine(store, new ModelSummarizer(async () => fact, "fixture", 12000, 3, true)).workOne();
    await engine.workOne();
    const job = store.claim(); expect(job?.input.type).toBe("parent");
    store.fail(job!, new MemoryError("SUMMARY_BATCH_INVALID", "Invalid batch evidence"));
    store.set("adapterErrors", "a", { code: "COMPACTION_FAILED" });
    expect(engine.preparationStatus("a").failures[0]!.errorCode).toBe("SUMMARY_BATCH_INVALID");
    const originals = engine.sources("a", 0);
    expect(engine.recoverRejectedBatches("other-scope")).toBe(0);
    expect(engine.recoverRejectedBatches("scope")).toBe(1);
    expect(store.get("adapterErrors", "a")).toBeUndefined();
    await engine.workOne();
    const parentPrompt = prompts.at(-1)!;
    expect(parentPrompt).toContain("Separate original tool_result");
    expect(parentPrompt).not.toContain("executed");
    expect(engine.sources("a", 0)).toEqual(originals);
    store.db.query("UPDATE jobs SET status='failed',error=? WHERE id=?").run("MemoryError: SUMMARY_BATCH_INVALID: Still invalid", job!.id);
    expect(engine.recoverRejectedBatches("scope")).toBe(0);
    expect((store.db.query("SELECT status FROM jobs WHERE id=?").get(job!.id) as { status: string }).status).toBe("failed");
  } finally { store.close(); }
});
