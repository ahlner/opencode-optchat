import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Engine, Store, Retrieval, MemoryError, ModelSummarizer, FakeSummarizer, assembleContext, bytes, key, sessionTree, sourceKey, type SourceInput, type Publication, type Node, type Summarizer, type Summary } from "../src/index.ts";
import { rangeCover, validateCover } from "../src/core/tree.ts";
import { mergeView, project, renderNode, renderedBytes } from "../src/core/views.ts";
import { chunks } from "../src/compactor/summarizer.ts";
import { extract, liveSuffix, retainedMessage, contentFingerprint } from "../src/adapters/opencode/transcript.ts";
import { memoryPolicy } from "../src/adapters/opencode/policy.ts";

const stores: Store[] = [];
const make = (summarizer?: Summarizer, options = {}) => { const s = new Store(); stores.push(s); return new Engine(s, summarizer, options); };
afterEach(() => { for (const s of stores.splice(0)) s.close(); });
const register = (e: Engine, id: string, scope = "user:project") => e.register(id, scope, "stable-project");
const input = (sessionId: string, turnId: string, eventKey: string, payload: string): SourceInput => ({ sessionId, generation: 0, turnId, eventKey, payload, kind: "user", timestamp: "2026-10-09T00:00:00.000Z", projectId: "stable-project" });
async function complete(e: Engine, sessionId: string, id: string, payloads: string[], outcome: "completed" | "failed" | "interrupted" = "completed") {
  e.admit(sessionId, id);
  const records = payloads.map((p, i) => e.append(input(sessionId, id, `${id}:${i}`, p)));
  e.finish(sessionId, id, outcome); await e.drain(); return records;
}
const pubs = (e: Engine) => e.store.all<Publication>("publications");
test("schema migration preserves ownerless leases and close releases only this store's claims", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-schema-test-")), path = join(root, "memory.sqlite");
  const { Database } = await import("bun:sqlite");
  const legacy = new Database(path);
  legacy.exec("CREATE TABLE jobs(id TEXT PRIMARY KEY,input TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',fence INTEGER NOT NULL DEFAULT 0,leaseUntil INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,error TEXT); PRAGMA user_version=1");
  legacy.query("INSERT INTO jobs VALUES(?,?,?,?,?,?,?)").run("legacy", JSON.stringify({ type: "leaf", tree: "old", sourceId: "old", start: 0 }), "running", 7, Date.now() + 300000, 1, null);
  legacy.close();
  const first = new Store(path), second = new Store(path);
  try {
    expect(first.claim(Date.now(), 300000, 1)).toBeUndefined();
    expect((first.db.query("PRAGMA user_version").get() as any).user_version).toBe(2);
    first.db.query("UPDATE jobs SET leaseUntil=0 WHERE id='legacy'").run();
    const claim = first.claim(Date.now(), 300000, 1)!;
    expect(claim.fence).toBe(8); second.close(); expect(first.owns(claim)).toBe(true);
    first.close();
    const reopened = new Store(path);
    expect(reopened.claim(Date.now(), 300000, 1)!.fence).toBe(10);
    reopened.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("dead process claims recover before expiry without stealing live peer claims", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-owner-test-")), path = join(root, "memory.sqlite");
  const storePath = new URL("../src/storage/store.ts", import.meta.url).pathname;
  const child = Bun.spawn([process.execPath, "-e", `import { Store } from ${JSON.stringify(storePath)}; const s = new Store(${JSON.stringify(path)}); s.enqueue({type:'leaf',tree:'test',sourceId:'test',start:0}); s.claim(Date.now(),300000,1); console.log('claimed'); await new Promise(()=>{});`], { stdout: "pipe", stderr: "pipe" });
  const reader = child.stdout.getReader(); await reader.read(); reader.releaseLock();
  const peer = new Store(path);
  try {
    expect(peer.claim(Date.now(), 300000, 1)).toBeUndefined();
    child.kill("SIGKILL"); await child.exited;
    const replacement = peer.claim(Date.now(), 300000, 1)!;
    expect(replacement).toBeDefined(); expect(replacement.fence).toBe(3);
    const other = new Store(path);
    expect(other.claim(Date.now(), 300000, 1)).toBeUndefined();
    other.close(); expect(peer.owns(replacement)).toBe(true);
  } finally { child.kill(); await child.exited; peer.close(); await rm(root, { recursive: true, force: true }); }
});
describe("lifecycle prefix preservation", () => {
  test("an archive larger than ten contexts stays bounded and retains exact searchable originals", async () => {
    const e = make(); register(e, "a"); register(e, "b");
    let totalBytes = 0;
    for (let i = 0; i < 64; i++) {
      const payload = `STRESS_SENTINEL_${i}_73919 ` + "😀 boundary-safe historical evidence ".repeat(180);
      totalBytes += bytes(payload); await complete(e, "a", `archive-${i}`, [payload]);
    }
    const snapshot = e.admit("b", "current").snapshot, live = [{ role: "user", content: "CURRENT_ONLY" }];
    const context = assembleContext(e, { snapshot, live, system: [{ type: "text", text: "CURRENT_HOST_INSTRUCTIONS" }], tools: { example: { description: "Native current tool", input: { type: "object" } } }, budget: { contextTokens: 8000, outputTokens: 1000, safetyTokens: 1000, memoryBytes: 16000 } });
    expect(totalBytes).toBeGreaterThan(10 * 8000); expect(context.tokenUpperBound).toBeLessThanOrEqual(6000);
    expect(context.messages).toBe(live); expect(context.memory).not.toContain("CURRENT_ONLY");
    const retrieval = new Retrieval(e), hit = retrieval.search(snapshot, "STRESS_SENTINEL_37_73919").hits.find(h => h.type === "source")!;
    expect(hit).toBeDefined(); expect(retrieval.source(snapshot, hit.id).text).toStartWith("STRESS_SENTINEL_37_73919");
    expect(retrieval.search(snapshot, "boundary", 0, 3).hits).toHaveLength(3);
    expect(retrieval.search(snapshot, "boundary", 3, 3).hits).toHaveLength(3);
    const root = e.findNode(snapshot.view.tree, 0, 64)!; expect(retrieval.zoom(snapshot, root.id).children).toHaveLength(2);
  });
  test("public audit metadata survives checkpointing without private provider state", () => {
    const raw = { id: "audit", type: "assistant", time: { created: 1, completed: 2 }, agent: "build", model: { id: "fixture", providerID: "fixture" }, finish: "error", error: { type: "fixture_error", message: "ERROR_84" }, tokens: { input: 42 }, providerState: "PRIVATE_STATE", content: [{ type: "tool", id: "call", name: "fixture", executed: false, time: { created: 1, completed: 2 }, providerResultState: "PRIVATE_RESULT", state: { status: "error", input: { text: "attempt" }, error: { message: "FAILED_PUBLIC" }, content: [{ type: "text", text: "partial" }] } }] };
    const retained = retainedMessage(raw), records = extract(retained);
    expect(JSON.stringify(records)).toContain("ERROR_84"); expect(JSON.parse(records[0]!.payload).executed).toBe(false);
    expect(JSON.stringify(retained)).not.toContain("PRIVATE_"); expect(retained.time.completed).toBe(2);
    expect(contentFingerprint(retained)).toBe(contentFingerprint({ ...retained, id: "fork-copy" }));
    const truncated = extract({ id: "truncated", type: "assistant", time: { created: 1 }, content: [{ type: "tool", id: "limited", name: "fixture", state: { status: "completed", input: {}, content: [{ type: "text", text: "HOST-LIMITED" }], metadata: { truncated: true } } }] });
    expect(truncated.find(r => r.kind === "tool_result")!.truncated).toBe(true);
  });
  test("ordered native memory rules revoke read/share and fail closed on ask", () => {
    expect(memoryPolicy([], "u:p")).toMatchObject({ read: true, share: true });
    expect(memoryPolicy([{ action: "*", resource: "*", effect: "deny" }, { action: "optchat.read", resource: "u:*", effect: "allow" }], "u:p")).toMatchObject({ read: true, share: false });
    expect(memoryPolicy([{ action: "optchat.*", resource: "u:p", effect: "ask" }], "u:p")).toMatchObject({ read: false, share: false });
    expect(memoryPolicy([{ action: "optchat.*", resource: "other:*", effect: "deny" }], "u:p")).toMatchObject({ read: true, share: true });
    expect(memoryPolicy([{ action: "optchat.re?d", resource: "u:?", effect: "deny" }], "u:p")).toMatchObject({ read: false, share: true });
  });
  test("child turns remain private and permission retirement preserves own originals only", async () => {
    const e = make(); register(e, "a"); register(e, "foreign"); e.register("child", "user:project", "stable-project", "a");
    await complete(e, "child", "child-turn", ["PRIVATE_CHILD"]); expect(pubs(e)).toHaveLength(0);
    await complete(e, "a", "root", ["REVOKED_SHARED"]);
    e.retire("a", "edit", 1, false); await e.drain();
    expect(pubs(e)).toHaveLength(0);
    expect(new Retrieval(e).search(e.admit("a", "own").snapshot, "REVOKED_SHARED").hits.length).toBeGreaterThan(0);
    const foreign = e.admit("foreign", "new").snapshot;
    expect(new Retrieval(e).search(foreign, "REVOKED_SHARED").hits).toHaveLength(0);
    expect(new Retrieval(e).search(foreign, "PRIVATE_CHILD").hits).toHaveLength(0);
  });
  test("partial retirement migrates exact prefix and its publication without republishing", async () => {
    const e = make(); register(e, "a"); register(e, "b");
    const first = await complete(e, "a", "first", ["KEEP_FIRST", "KEEP_SECOND"]);
    await complete(e, "a", "removed", ["REMOVE_SECRET", "REMOVE_RESULT"]);
    await complete(e, "b", "other", ["OTHER_SESSION"]);
    const before = pubs(e).find(p => p.turnId === "first")!;
    const snapshot = e.admit("b", "pinned").snapshot;
    e.retire("a", "edit", 2); await e.drain();
    expect(e.session("a").generation).toBe(1);
    expect(e.sources("a", 1).map(r => r.payload)).toEqual(["KEEP_FIRST", "KEEP_SECOND"]);
    expect(() => e.source(sourceKey(first[0]))).toThrow("NOT_FOUND");
    expect(() => e.validateSnapshot(snapshot)).toThrow("SNAPSHOT_REVOKED");
    const after = pubs(e).find(p => p.turnId === "first")!;
    expect(after.generation).toBe(1); expect(after.publicationSeq).toBe(before.publicationSeq);
    expect(pubs(e)).toHaveLength(2); expect(pubs(e).some(p => p.turnId === "removed")).toBe(false);
    validateCover(after.sourceCover.map(id => e.node(id)), 0, 2);
    const next = e.admit("a", "next"); expect(next.snapshot.ownBoundary).toBe(2);
    const search = new Retrieval(e).search(next.snapshot, "REMOVE_SECRET"); expect(search.hits).toHaveLength(0);
    expect(new Retrieval(e).search(next.snapshot, "KEEP_FIRST").hits.length).toBeGreaterThan(0);
  });
  test("inherited originals are own memory only, with independent deletion retention", async () => {
    const e = make(); register(e, "parent"); register(e, "fork"); register(e, "foreign");
    await complete(e, "parent", "root", ["INHERITED_SECRET"]);
    e.admit("fork", "prefix"); e.markInherited("fork", "prefix");
    e.append(input("fork", "prefix", "copied", "INHERITED_SECRET")); e.finish("fork", "prefix", "interrupted"); await e.drain();
    expect(pubs(e).filter(p => p.sessionId === "fork")).toHaveLength(0);
    e.retire("parent", "delete"); await e.drain();
    const own = e.admit("fork", "new").snapshot, foreign = e.admit("foreign", "new").snapshot;
    expect(new Retrieval(e).search(own, "INHERITED_SECRET").hits.length).toBeGreaterThan(0);
    expect(new Retrieval(e).search(foreign, "INHERITED_SECRET").hits).toHaveLength(0);
  });
  test("checkpoint records exclude hidden reasoning and private provider state", () => {
    const raw = { id: "old", type: "assistant", time: { created: 1 }, providerState: { private: "PRIVATE_SENTINEL" }, content: [{ type: "reasoning", text: "HIDDEN_SENTINEL" }, { type: "text", text: "PUBLIC_TEXT" }] };
    const retained = retainedMessage(raw);
    expect(JSON.stringify(retained)).not.toContain("SENTINEL"); expect(JSON.stringify(retained)).toContain("PUBLIC_TEXT");
    expect(contentFingerprint(raw)).toBe(contentFingerprint({ ...raw, id: "fork-copy" }));
  });
});
describe("records and durable tree construction", () => {
  test("events deduplicate, conflicts stop, staging cannot publish", async () => {
    const e = make(); register(e, "a"); e.admit("a", "t");
    const data = input("a", "t", "evt:revision1", "Original 🙂");
    e.stage(data); expect(e.sources("a", 0)).toHaveLength(0);
    expect(() => e.finish("a", "t", "completed")).toThrow("UNSEALED_RECORDS");
    const r = e.sealStaged("a", 0, data.eventKey);
    expect(e.append(data)).toEqual(r);
    expect(() => e.append({ ...data, payload: "different" })).toThrow("EVENT_CONFLICT");
    expect(pubs(e)).toHaveLength(0);
    e.finish("a", "t", "interrupted"); e.finish("a", "t", "interrupted");
    expect(() => e.finish("a", "t", "completed")).toThrow("OUTCOME_CONFLICT");
    await e.drain(); expect(pubs(e)).toHaveLength(1); expect(pubs(e)[0].outcome).toBe("interrupted");
    expect(e.source(sourceKey(r)).payload).toBe(data.payload);
  });
  test("all arbitrary covers are aligned, complete and never include adjacent turns", () => {
    for (let start = 0; start < 100; start++) for (let end = start; end < 160; end++) {
      const cover = rangeCover(start, end); validateCover(cover, start, end);
      expect(cover.reduce((n, x) => n + x.count, 0)).toBe(end - start);
    }
    expect(() => rangeCover(-1, 5)).toThrow("INVALID_RANGE");
    expect(() => validateCover([{ start: 1, count: 2 }], 1, 3)).toThrow("INTEGRITY");
  });
  test("binary parents persist; publications have exact turn cover and truthful terminal outcome", async () => {
    const e = make(); register(e, "a");
    await complete(e, "a", "first", ["one", "two", "three"]);
    const records = await complete(e, "a", "second", ["four", "five", "six", "seven", "eight"], "failed");
    const p = pubs(e).find(p => p.turnId === "second")!;
    const cover = p.sourceCover.map(id => e.node(id)); validateCover(cover, 3, 8);
    expect(cover.map(n => [n.start, n.count])).toEqual([[3, 1], [4, 4]]);
    expect(p.outcome).toBe("failed");
    expect(e.findNode(sessionTree("a", 0), 0, 8)?.children).toHaveLength(2);
    expect(e.view(sessionTree("a", 0)).prefix).toBe(8);
    expect(records.map(r => r.seq)).toEqual([3, 4, 5, 6, 7]);
    for (const row of e.store.db.query("SELECT value FROM nodes").all() as { value: string }[]) {
      const n: Node = JSON.parse(row.value); expect(bytes(n.text)).toBeLessThanOrEqual(512); expect(n.bytes).toBe(bytes(n.text));
    }
  });
  test("wrong project, scope, generation, parallel own turns and closed appends stop", async () => {
    const e = make(); register(e, "a"); e.admit("a", "t");
    expect(() => e.admit("a", "other")).toThrow("TURN_ACTIVE");
    expect(() => register(e, "a", "other")).toThrow("SCOPE_MISMATCH");
    expect(() => e.append({ ...input("a", "t", "bad", "x"), generation: 1 })).toThrow("GENERATION_MISMATCH");
    expect(() => e.append({ ...input("a", "t", "bad", "x"), projectId: "wrong" })).toThrow("GENERATION_MISMATCH");
    e.append(input("a", "t", "ok", "x")); e.finish("a", "t", "completed");
    expect(() => e.append(input("a", "t", "late", "x"))).toThrow("TURN_CLOSED");
    expect(() => e.admit("a", "next")).toThrow("MEMORY_NOT_READY"); await e.drain(); e.admit("a", "next");
  });
  test("empty interrupted turn has an explicit outcome publication", async () => {
    const e = make(); register(e, "a"); e.admit("a", "empty");
    expect(() => e.finish("a", "empty", "interrupted", "invalid-date")).toThrow("CONFIG");
    e.finish("a", "empty", "interrupted", "2026-01-01T10:11:12.000Z"); await e.drain();
    expect(pubs(e)[0].sourceCover).toEqual([]); expect(pubs(e)[0].outcome).toBe("interrupted");
    expect(pubs(e)[0].completedAt).toBe("2026-01-01T10:11:12.000Z");
  });
});
describe("frontiers and budgets", () => {
  const node = (start: number, count: number, text = "x".repeat(200)): Node => ({ id: `${start}:${count}`, tree: "t", start, count, text, inputs: [], children: [], bytes: bytes(text), model: "test", promptVersion: "1", fallback: false });
  test("hysteresis, durable reduction only, earlier tie and nonmutating projection", () => {
    const nodes = [node(0, 1), node(1, 1), node(2, 1), node(3, 1), node(0, 2, "p"), node(2, 2, "q"), node(0, 4, "root")];
    const get = (id: string) => nodes.find(n => n.id === id)!;
    const find = (s: number, c: number) => nodes.find(n => n.start === s && n.count === c);
    const view = { tree: "t", revision: 4, prefix: 4, nodes: nodes.slice(0, 4).map(n => n.id), shrinking: false };
    const original = structuredClone(view);
    expect(mergeView(view, get, find, 1000, 500).nodes).toEqual(view.nodes);
    const merged = mergeView(view, get, find, 600, 450); expect(merged.nodes[0]).toBe("0:2");
    expect(renderedBytes(merged.nodes.map(get))).toBeLessThanOrEqual(450);
    expect(project(view, get, find, 12).map(n => n.id)).toEqual(["0:4"]);
    expect(view).toEqual(original);
    expect(() => project(view, get, () => undefined, 20)).toThrow("MEMORY_NOT_READY");
    expect(() => mergeView(view, get, find, 100, 100)).toThrow("CONFIG");
  });
  test("rendered size counts escaping, identifiers, UTF-8 and delimiters", () => {
    const n = node(0, 1, '<system>🙂 & "instruction"</system>');
    expect(renderNode(n)).not.toContain("<system>"); expect(renderNode(n)).toContain("&lt;system&gt;");
    expect(renderedBytes([n])).toBe(bytes(renderNode(n))); expect(renderedBytes([n])).toBeGreaterThan(n.bytes);
  });
  test("full request budgets include host/tools/live, output and safety; active turn never silently clips", async () => {
    const e = make(); register(e, "a"); const snapshot = e.admit("a", "t").snapshot;
    const live = [{ role: "user", text: "CURRENT_USER" }, { role: "assistant", text: "LIVE_TOOL_CONTINUATION" }];
    const result = assembleContext(e, { system: [{ text: "HOST" }], tools: { tool: { description: "native" } }, live, snapshot, budget: { contextTokens: 5000, outputTokens: 1000, safetyTokens: 256, memoryBytes: 1000 } });
    expect(result.messages).toBe(live); expect(result.memory).not.toContain("CURRENT_USER");
    expect(result.tokenUpperBound).toBeLessThanOrEqual(3744);
    expect(() => assembleContext(e, { system: ["x".repeat(6000)], tools: {}, live, snapshot, budget: { contextTokens: 5000, outputTokens: 1000, safetyTokens: 256, memoryBytes: 1000 } })).toThrow("ACTIVE_TURN_TOO_LARGE");
  });
});
describe("snapshot isolation, search and retrieval", () => {
  test("cross-session awareness is automatic, never a foreign conversation", async () => {
    const e = make(); register(e, "a"); register(e, "b");
    await complete(e, "a", "decision", ["DECISION: Use Bun."]);
    const turn = e.admit("b", "new");
    const result = assembleContext(e, { system: ["HOST"], tools: {}, live: [{ role: "user", content: "Current B request" }], snapshot: turn.snapshot, budget: { contextTokens: 30000, outputTokens: 1000, safetyTokens: 1000, memoryBytes: 16000 } });
    expect(result.memory).toContain("Use Bun"); expect(result.messages).toEqual([{ role: "user", content: "Current B request" }]);
    expect(turn.snapshot.ownBoundary).toBe(0);
  });
  test("late publications and unpublished tools cannot appear in old snapshot search or zoom", async () => {
    const e = make(); register(e, "a"); register(e, "b"); register(e, "c", "other-scope");
    const old = e.admit("b", "waiting").snapshot;
    const records = await complete(e, "a", "late", ["PRIVATE_LATE output"]);
    await complete(e, "c", "other", ["PRIVATE_LATE other scope"]);
    const retrieval = new Retrieval(e);
    expect(retrieval.search(old, "PRIVATE_LATE").hits).toEqual([]);
    expect(() => retrieval.source(old, sourceKey(records[0]))).toThrow("NOT_VISIBLE");
    expect(() => retrieval.zoom(old, pubs(e).find(p => p.sessionId === "a")!.nodeId)).toThrow("NOT_VISIBLE");
    e.finish("b", "waiting", "completed"); await e.drain();
    const fresh = e.admit("b", "fresh").snapshot;
    expect(retrieval.search(fresh, "PRIVATE_LATE").hits.length).toBeGreaterThan(0);
    expect(retrieval.search(fresh, "PRIVATE_LATE").hits.every(h => !h.text.includes("other scope"))).toBe(true);
    e.admit("a", "active"); const unpublished = e.append(input("a", "active", "secret", "NEVER_PUBLISHED")); await e.drain();
    expect(retrieval.search(fresh, "NEVER_PUBLISHED").hits).toEqual([]);
    expect(() => retrieval.source(fresh, sourceKey(unpublished))).toThrow("NOT_VISIBLE");
    expect(e.admit("b", "fresh").snapshot).toEqual(fresh);
  });
  test("zoom exact source cover and original unicode-safe pagination", async () => {
    const e = make(); register(e, "a"); register(e, "b");
    const payload = "🙂日本語 Original full tool result ".repeat(100);
    const records = await complete(e, "a", "t", [payload]);
    const snapshot = e.admit("b", "read").snapshot, r = new Retrieval(e);
    const pub = pubs(e)[0]; const cover = r.zoom(snapshot, pub.nodeId);
    expect(cover.children[0].id).toBe(pub.sourceCover[0]);
    expect(r.zoom(snapshot, cover.children[0].id).sourceId).toBe(sourceKey(records[0]));
    let offset: number | null = 0, collected = "";
    while (offset !== null) { const page = r.source(snapshot, sourceKey(records[0]), offset, 17); expect(bytes(page.text)).toBeLessThanOrEqual(17); collected += page.text; offset = page.next; }
    expect(collected).toBe(payload);
    expect(() => r.source(snapshot, sourceKey(records[0]), -1)).toThrow("INVALID_PAGE");
    expect(() => r.search(snapshot, "x", 0, 101)).toThrow("INVALID_QUERY");
    expect(() => r.zoom(snapshot, pub.nodeId, 0, 1000)).toThrow("INVALID_PAGE");
  });
  test("FTS treats quotes and SQL-like input as data", async () => {
    const e = make(); register(e, "a"); await complete(e, "a", "t", ['quoted "word" and SELECT']);
    const snapshot = e.admit("a", "next").snapshot;
    expect(() => new Retrieval(e).search(snapshot, '" OR *; DROP TABLE sources; --')).not.toThrow();
    expect(e.sources("a", 0)).toHaveLength(1);
  });
  test("a structural snapshot ID cannot authorize forged bounds or another session", async () => {
    const e = make(); register(e, "a"); register(e, "b");
    const old = e.admit("b", "old").snapshot; await complete(e, "a", "late", ["FORGED_SECRET"]);
    expect(() => new Retrieval(e).search({ ...old, highWater: 999 }, "FORGED_SECRET")).toThrow("SNAPSHOT_REVOKED");
    expect(() => e.validateSnapshot({ ...old, sessionId: "a" })).toThrow("SNAPSHOT_REVOKED");
  });
});
describe("crash, concurrency, retention and compactor failures", () => {
  test("reopen resumes jobs, records, views and pinned snapshots without duplicates", async () => {
    const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-test-")), path = join(root, "memory.sqlite");
    try {
      const first = new Engine(new Store(path)); register(first, "a"); register(first, "b");
      const pinned = first.admit("b", "active").snapshot;
      first.admit("a", "t"); first.append(input("a", "t", "event", "RESTART_DATA")); first.finish("a", "t", "completed"); first.store.close();
      const next = new Engine(new Store(path)); await next.drain();
      expect(next.sources("a", 0)).toHaveLength(1); expect(pubs(next)).toHaveLength(1);
      expect(next.admit("b", "active").snapshot).toEqual(pinned);
      expect(new Retrieval(next).search(pinned, "RESTART_DATA").hits).toEqual([]);
      await next.drain(); expect(pubs(next)).toHaveLength(1); next.store.close();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  test("expired lease cannot commit after another worker claims its job", async () => {
    const e = make(); register(e, "a"); e.admit("a", "t"); e.append(input("a", "t", "evt", "x"));
    const old = e.store.claim(Date.now() - 100, 1)!;
    const fresh = e.store.claim(Date.now(), 10000)!;
    expect(fresh.id).toBe(old.id); expect(fresh.fence).toBeGreaterThan(old.fence);
    expect(e.store.owns(old)).toBe(false); expect(e.store.owns(fresh)).toBe(true);
    expect(e.store.renew(old, 10000)).toBe(false); expect(e.store.renew(fresh, 10000)).toBe(true);
    expect(e.store.recoverLease(old, 10000)).toBe(false);
  });
  test("a suspended worker recovers unchanged fences before chunk and final commits", async () => {
    const fake = new FakeSummarizer();
    const e = make({ summarize: async text => { Bun.sleepSync(70); return fake.summarize(text); } }, { leaseMs: 30, chunkBytes: 2048 });
    register(e, "a"); e.admit("a", "t"); e.append(input("a", "t", "evt", "SUSPENDED_WORKER ".repeat(350)));
    expect(await e.workOne()).toBe(true);
    expect(e.findNode(sessionTree("a", 0), 0, 1)).toBeDefined();
    expect(e.store.db.query("SELECT count(*) AS count FROM jobs WHERE status='failed'").get()).toEqual({ count: 0 });
  });
  test("a superseded worker discards its result without failing the replacement job", async () => {
    let resolve!: (value: Summary) => void;
    const e = make({ summarize: () => new Promise(r => { resolve = r; }) });
    register(e, "a"); e.admit("a", "t"); e.append(input("a", "t", "evt", "ORIGINAL")); e.finish("a", "t", "completed");
    const pending = e.workOne();
    e.store.db.query("UPDATE jobs SET leaseUntil=0 WHERE status='running'").run();
    const replacement = new Engine(e.store, new FakeSummarizer()); await replacement.drain();
    resolve({ text: "STALE_RESULT", model: "stale", promptVersion: "1", fallback: false });
    expect(await pending).toBe(true);
    expect(pubs(e)).toHaveLength(1);
    expect(JSON.stringify(e.store.db.query("SELECT value FROM nodes").all())).not.toContain("STALE_RESULT");
    expect(e.store.db.query("SELECT count(*) AS count FROM jobs WHERE status='failed'").get()).toEqual({ count: 0 });
  });
  test("lease renewal protects a model call longer than its original lease", async () => {
    const fake = new FakeSummarizer();
    const e = make({ summarize: async text => { await Bun.sleep(150); return fake.summarize(text); } }, { leaseMs: 90 });
    register(e, "a"); e.admit("a", "t"); e.append(input("a", "t", "evt", "SLOW_SUMMARY"));
    const pending = e.workOne(); await Bun.sleep(115);
    expect(e.store.claim()).toBeUndefined(); await pending;
    expect(e.findNode(sessionTree("a", 0), 0, 1)).toBeDefined();
  });
  test("partial retirement preserves chunk provenance and purges removed intermediates", async () => {
    const e = make(undefined, { chunkBytes: 2048 }); register(e, "a");
    await complete(e, "a", "keep", ["KEEP_CHUNK ".repeat(2000)]);
    await complete(e, "a", "drop", ["DROP_CHUNK ".repeat(2000)]);
    const node = e.findNode(sessionTree("a", 0), 0, 1)!;
    const refs = node.inputs.filter(id => !!e.store.db.query("SELECT id FROM nodes WHERE id=?").get(id));
    expect(refs.length).toBeGreaterThan(0);
    e.retire("a", "edit", 1); await e.drain();
    for (const id of refs) expect(e.node(id)).toBeDefined();
    expect(JSON.stringify(e.store.db.query("SELECT value FROM nodes").all())).not.toContain("DROP_CHUNK");
  });
  test("two SQLite connections allocate contiguous records atomically", async () => {
    const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-writers-")), path = join(root, "memory.sqlite");
    try {
      const a = new Engine(new Store(path)), b = new Engine(new Store(path)); register(a, "a"); a.admit("a", "t");
      for (let i = 0; i < 100; i++) (i % 2 ? a : b).append(input("a", "t", `e${i}`, `${i}`));
      expect(a.sources("a", 0).map(r => r.seq)).toEqual(Array.from({ length: 100 }, (_, i) => i));
      a.finish("a", "t", "completed"); await Promise.all([a.drain(), b.drain()]); expect(pubs(a)).toHaveLength(1);
      a.store.close(); b.store.close();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  test("failed summary is durable, retryable and never produces partial publication", async () => {
    let fail = true; const fake = new FakeSummarizer();
    const e = make({ summarize: async text => { if (fail) throw new Error("model unavailable"); return fake.summarize(text); } });
    register(e, "a"); e.admit("a", "t"); e.append(input("a", "t", "e", "x")); e.finish("a", "t", "completed");
    await expect(e.drain()).rejects.toThrow("model unavailable"); expect(pubs(e)).toHaveLength(0);
    expect(() => e.admit("a", "new")).toThrow("MEMORY_NOT_READY");
    fail = false; e.retryFailed(); await e.drain(); expect(pubs(e)).toHaveLength(1);
  });
  test("invalid summaries fail before visibility", async () => {
    const e = make({ summarize: async () => ({ text: "🙂".repeat(129), model: "bad", promptVersion: "1", fallback: false }) });
    register(e, "a"); e.admit("a", "t"); e.append(input("a", "t", "e", "x")); e.finish("a", "t", "completed");
    await expect(e.drain()).rejects.toThrow("SUMMARY_SIZE"); expect(pubs(e)).toHaveLength(0);
  });
  test("deletion revokes old snapshots, removes originals/search/derived nodes, retains others", async () => {
    const e = make(); register(e, "a"); register(e, "b"); register(e, "c"); register(e, "d", "different-scope");
    const deleted = await complete(e, "a", "secret", ["DELETE_ME"]);
    await complete(e, "b", "keep", ["KEEP_ME"]); await complete(e, "d", "unrelated", ["UNRELATED"]);
    const old = e.admit("c", "before").snapshot; const unrelated = e.admit("d", "next").snapshot;
    const keptSequence = pubs(e).find(p => p.sessionId === "b")!.publicationSeq;
    e.retire("a", "delete"); await e.drain();
    expect(() => e.validateSnapshot(old)).toThrow("SNAPSHOT_REVOKED"); e.validateSnapshot(unrelated);
    expect(() => e.source(sourceKey(deleted[0]))).toThrow("NOT_FOUND");
    expect(pubs(e).some(p => p.sessionId === "a")).toBe(false);
    expect(pubs(e).find(p => p.sessionId === "b")!.publicationSeq).toBe(keptSequence);
    register(e, "fresh"); const snap = e.admit("fresh", "after").snapshot;
    expect(new Retrieval(e).search(snap, "DELETE_ME").hits).toEqual([]);
    expect(new Retrieval(e).search(snap, "KEEP_ME").hits.length).toBeGreaterThan(0);
    expect(JSON.stringify(e.store.db.query("SELECT value FROM nodes").all())).not.toContain("DELETE_ME");
  });
  test("edit starts a generation and fork/subagent defaults never republish an inherited prefix", async () => {
    const e = make(); register(e, "a"); await complete(e, "a", "old", ["OLD_VERSION"]);
    const snap = e.admit("a", "active").snapshot; e.retire("a", "edit");
    expect(e.session("a").generation).toBe(1); expect(() => e.validateSnapshot(snap)).toThrow();
    e.register("child", "user:project", "stable-project", "a"); expect(e.admit("child", "x").snapshot.sessionId).toBe("child"); expect(e.session("child").broadcast).toBe(false);
    expect(pubs(e)).toHaveLength(0);
  });
  test("a worker cannot commit evidence deleted while its model runs", async () => {
    let resolve!: (value: Summary) => void;
    const e = make({ summarize: () => new Promise(r => { resolve = r; }) });
    register(e, "a"); e.admit("a", "t"); e.append(input("a", "t", "e", "secret")); e.finish("a", "t", "completed");
    const pending = e.workOne(); e.retire("a", "delete"); resolve({ text: "secret", model: "late", promptVersion: "1", fallback: false });
    expect(await pending).toBe(true); expect(pubs(e)).toHaveLength(0);
  });
  test("concurrent drain runners summarize independent sessions in parallel", async () => {
    let active = 0, peak = 0;
    const e = make({ summarize: async text => { peak = Math.max(peak, ++active); await Bun.sleep(60); active--; return { text: text.slice(0, 40), model: "slow", promptVersion: "1", fallback: false }; } }, { maxRunningJobs: 3 });
    for (const id of ["a", "b", "c"]) { register(e, id); e.admit(id, "t"); e.append(input(id, "t", "e", `EVIDENCE_${id}`)); e.finish(id, "t", "completed"); }
    await e.drain(100000, undefined, 3);
    expect(pubs(e)).toHaveLength(3);
    // At least two independent summaries must overlap, otherwise the runners ran serially.
    expect(peak).toBeGreaterThan(1);
    expect(e.store.db.query("SELECT count(*) n FROM jobs WHERE status<>'done'").get()).toEqual({ n: 0 });
  });
  test("concurrent drain does not stop while a peer still produces jobs", async () => {
    let calls = 0;
    const summary = { text: "done", model: "fixture", promptVersion: "1", fallback: false };
    const e = make({ summarize: async () => summary, summarizeBatch: async (inputs: string[], _s?: AbortSignal, ids?: string[]) => { if (++calls === 1) throw new Error("temporary"); return ids!.map(() => summary); } } as any, { maxRunningJobs: 2, parentBatchSize: 1, leafBatchSize: 1 });
    register(e, "a"); e.admit("a", "t");
    // Long payload forces chunked summarization, which enqueues a second job after the first completes.
    e.append(input("a", "t", "e", "RETAINED_EVIDENCE ".repeat(40))); e.finish("a", "t", "completed");
    await e.drain(100000, undefined, 2);
    expect(pubs(e)).toHaveLength(1);
    expect(e.store.db.query("SELECT count(*) n FROM jobs WHERE status<>'done'").get()).toEqual({ n: 0 });
  });
});
describe("bounded real summarizer and host transcript mapping", () => {
  test("UTF-8 retry uses measured length, never byte clipping", async () => {
    const prompts: string[] = [];
    const s = new ModelSummarizer(async p => { prompts.push(p); return prompts.length === 1 ? "🙂".repeat(129) : "Verified result: Bun tests passed."; }, "configured/model");
    expect((await s.summarize("historical result")).text).toContain("Verified result");
    expect(prompts[1]).toContain("516 UTF-8 bytes");
    await expect(new ModelSummarizer(async () => "🙂".repeat(129), "bad", 12000, 2).summarize("x")).rejects.toThrow("SUMMARY_SIZE");
  });
  test("oversized original is processed in full, bounded UTF-8 chunks and durable intermediates", async () => {
    const seen: string[] = [];
    const e = make({ summarize: async text => { seen.push(text); return { text: "bounded summary", model: "test", promptVersion: "1", fallback: false }; } }, { chunkBytes: 2048 });
    register(e, "a"); const payload = "🙂".repeat(4000) + "END_SENTINEL";
    const records = await complete(e, "a", "large", [payload]);
    expect(seen.every(s => bytes(s) <= 2048)).toBe(true);
    expect(seen.some(s => s.includes("END_SENTINEL"))).toBe(true);
    expect(e.source(sourceKey(records[0])).payload).toBe(payload);
    expect((e.store.db.query("SELECT count(*) AS n FROM nodes WHERE tree LIKE '[\"chunk\",%'").get() as { n: number }).n).toBeGreaterThan(1);
    expect(chunks(payload, 17).join("")).toBe(payload);
  });
  test("extractor retains structured tool inputs/results/errors, excludes reasoning and synthetic compaction", () => {
    const messages = extract({ id: "msg", type: "assistant", time: { created: 1 }, content: [
      { type: "reasoning", text: "HIDDEN_REASONING" }, { type: "text", text: "User-visible response" },
      { type: "tool", id: "call1", name: "read", providerState: { secret: "PRIVATE_PROVIDER" }, state: { status: "error", input: { file: "x" }, error: { message: "missing" }, content: [{ type: "text", text: "partial" }] } },
    ] });
    const text = JSON.stringify(messages); expect(text).not.toContain("HIDDEN_REASONING"); expect(text).not.toContain("PRIVATE_PROVIDER");
    expect(messages.map(m => m.kind)).toEqual(["assistant", "tool_call", "tool_result"]); expect(text).toContain("missing"); expect(text).toContain("partial");
    expect(extract({ id: "compaction", type: "compaction", time: { created: 1 }, summary: "SYNTHETIC" })).toEqual([]);
  });
  test("active suffix keeps unidentified tool results adjacent and excludes all prior messages", () => {
    const messages = [{ id: "old", role: "user" }, { id: "new", role: "user" }, { id: "call", role: "assistant" }, { role: "tool" }];
    expect(liveSuffix(messages, new Set(["new", "call"]))).toEqual(messages.slice(1));
    expect(() => liveSuffix(messages, new Set(["missing"]))).toThrow("HOST_SHAPE");
  });
});
