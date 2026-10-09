import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Engine, Store, sourceKey } from "../src/index.ts";
import { verifyRealHost } from "../scripts/verify-real-host.ts";

test("offline real-host verifier checks exact evidence and read-original citations without model calls", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-real-verifier-"));
  try {
    const store = new Store(join(root, "memory.sqlite")), engine = new Engine(store);
    const fixture = { retry: { name: "RETRY_MS", value: 70007 }, deployment: { outcome: "failed", error: "E_TEST" }, verification: { passed: 23, failed: 0 } };
    engine.register("A", "test", "test"); engine.register("B", "test", "test"); engine.admit("A", "a");
    const user = engine.append({ sessionId: "A", generation: 0, projectId: "test", turnId: "a", eventKey: "u", kind: "user", timestamp: "2026-10-09T00:00:00Z", payload: "D_test selects Bun" });
    const original = engine.append({ sessionId: "A", generation: 0, projectId: "test", turnId: "a", eventKey: "r", kind: "tool_result", timestamp: "2026-10-09T00:00:00Z", payload: JSON.stringify(fixture) }); store.close();
    const answer = { runtime: "bun", ...fixture, proposal: { id: "P_test", implemented: false }, sourceIds: [sourceKey(original)] };
    const write = () => Bun.write(join(root, "b-public.json"), JSON.stringify([{ type: "assistant", content: [{ type: "tool", name: "optchat_search", state: { status: "completed", input: { query: "RETRY_MS" } } }, { type: "tool", name: "optchat_source", state: { status: "completed", input: { id: sourceKey(original) } } }, { type: "text", text: JSON.stringify(answer) }] }]));
    await Bun.write(join(root, "capture.ndjson"), JSON.stringify({ type: "primary", sessionId: "B", system: ["Historical Bun decision"], userMessages: [{ content: "Question" }] })); await write();
    expect((await verifyRealHost(root, "fixture", ["A", "B"], fixture, "D_test", "P_test")).passed).toBe(true);
    answer.retry = { ...fixture.retry, value: 70008 }; await write(); await expect(verifyRealHost(root, "fixture", ["A", "B"], fixture, "D_test", "P_test")).rejects.toThrow();
    answer.retry = fixture.retry; answer.sourceIds = [sourceKey(user)]; await write(); await expect(verifyRealHost(root, "fixture", ["A", "B"], fixture, "D_test", "P_test")).rejects.toThrow("must have been read");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("admin status/retry work; forget requires confirmation and does not delete the database", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-admin-test-")), database = join(root, "memory.sqlite");
  const script = resolve("scripts/admin.ts");
  const run = async (...args: string[]) => {
    const p = Bun.spawn([process.execPath, script, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exit] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]); return { stdout, stderr, exit };
  };
  try {
    const e = new Engine(new Store(database)); e.register("a", "scope", "project"); e.admit("a", "t");
    e.append({ sessionId: "a", generation: 0, projectId: "project", turnId: "t", eventKey: "evt", kind: "user", timestamp: "2026-10-09T00:00:00Z", payload: "test original" });
    e.finish("a", "t", "completed"); await e.drain(); e.store.close();
    const status = await run("status", database); expect(status.exit).toBe(0); expect(JSON.parse(status.stdout).sessions[0].id).toBe("a");
    expect((await run("retry", database)).exit).toBe(0);
    const rejected = await run("forget", database, "a"); expect(rejected.exit).not.toBe(0); expect(rejected.stderr).toContain("CONFIRMATION_REQUIRED");
    const before = new Engine(new Store(database)); expect(before.sources("a", 0)).toHaveLength(1); before.store.close();
    expect((await run("forget", database, "a", "--confirm")).exit).toBe(0);
    const after = new Engine(new Store(database)); expect(after.sources("a", 0)).toHaveLength(0); expect(after.store.get("sessions", "a")).toBeUndefined(); after.store.close();
    expect(await Bun.file(database).exists()).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("evaluation harness compares all modes using only a local fixture, never user credentials", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-eval-test-"));
  const calls: any[] = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    expect(request.headers.get("authorization")).toBeNull();
    const input = await request.json() as any; calls.push(input);
    const summary = JSON.stringify(input.messages).includes("UNTRUSTED_JSON_DATA");
    return Response.json({ choices: [{ message: { role: "assistant", content: summary ? "Historical evidence, inspect sources for exact identifiers." : "Fixture answer, requires human review." } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } });
  } });
  try {
    const proc = Bun.spawn([process.execPath, resolve("scripts/evaluate.ts")], { cwd: root, env: { PATH: process.env.PATH, OPTCHAT_EVAL_URL: `http://127.0.0.1:${server.port}/chat/completions`, OPTCHAT_EVAL_MODEL: "loopback-fixture", OPTCHAT_EVAL_TRIALS: "1", OPTCHAT_EVAL_CONTEXT: "32000" }, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    expect(stderr).toBe(""); expect(exit).toBe(0); expect(stdout).toContain("evaluation-results.json");
    const report = await Bun.file(join(root, "evaluation-results.json")).json();
    expect(report.results).toHaveLength(6); expect(new Set(report.results.map((r: any) => r.mode))).toEqual(new Set(["isolated", "merged", "optchat"]));
    expect(report.results.every((r: any) => r.needsHumanOutcomeReview && r.usage.length > 0)).toBe(true);
    expect(calls.some(c => c.tools?.some((t: any) => t.function.name === "optchat_source"))).toBe(true);
  } finally { server.stop(true); await rm(root, { recursive: true, force: true }); }
}, 30000);
