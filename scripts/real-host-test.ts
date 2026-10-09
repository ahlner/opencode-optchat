import { mkdtemp, mkdir, chmod } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { strict as assert } from "node:assert";
import { retainedMessage, type RawMessage } from "../src/adapters/opencode/transcript.ts";
import { verifyRealHost } from "./verify-real-host.ts";

// Explicitly opt-in: uses the managed service's configured provider, never reads credentials.
assert.equal(process.env.OPTCHAT_REAL_TEST, "1", "Set OPTCHAT_REAL_TEST=1 only after authorizing real model calls.");
const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-real-host-")); await chmod(root, 0o700);
await mkdir(join(root, "plugin"));
const api = async (method: string, path: string, data?: unknown) => {
  const task = Bun.spawn(["opencode", "api", method.toLowerCase(), path, ...(data === undefined ? [] : ["--data", JSON.stringify(data)])], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([task.exited, new Response(task.stdout).text(), new Response(task.stderr).text()]);
  assert.equal(code, 0, `${method} ${path}: ${stderr}`); const value = stdout.trim() ? JSON.parse(stdout) : undefined;
  return value?.data ?? value;
};
const info = await api("GET", "/api/info"); assert.equal(info.version, "2.0.26");
const selected = await api("GET", "/api/model/default"), model = { providerID: selected.providerID, id: selected.id };
assert(selected.enabled && selected.capabilities.tools, "Default model must be enabled and support tools");
const nonce = crypto.randomUUID().replaceAll("-", "").slice(0, 10), value = 70000 + crypto.getRandomValues(new Uint16Array(1))[0]!;
const fixture = { retry: { name: "OPTCHAT_RETRY_WINDOW_MS", value }, deployment: { outcome: "failed", error: `E_TEST_${nonce}` }, verification: { passed: 23, failed: 0 } };
const decisionId = `D_${nonce}`, proposalId = `P_${nonce}`, database = join(root, "memory.sqlite");
await Bun.write(join(root, "plugin/package.json"), JSON.stringify({ name: "optchat-real-host", type: "module", exports: "./index.ts" }));
// Give each run a distinct module URL: the managed service must not reuse an older bundle from its module cache.
await Bun.write(join(root, "plugin/memory.js"), Bun.file(resolve("dist/adapters/opencode/plugin.js")));
await Bun.write(join(root, "plugin/index.ts"), `
import { Plugin } from "@opencode/plugin";
import { appendFileSync } from "node:fs";
import memory from "./memory.js";
const log = data => appendFileSync(${JSON.stringify(join(root, "capture.ndjson"))}, JSON.stringify(data) + "\\n", { mode: 0o600 });
export default Plugin.define({ id: "optchat.real-host-test", async setup(ctx) {
  let summaries = 0; const steps = new Map();
  await ctx.session.hook("title", event => { event.result = "OptChat real-model test"; });
  await ctx.session.hook("context", event => { event.options.maxTokens = 1024; for (const name of Object.keys(event.tools)) if (!name.startsWith("optchat_") && name !== "fixture_probe") delete event.tools[name]; const n = (steps.get(event.sessionID) ?? 0) + 1; steps.set(event.sessionID, n); if (n > 6) throw new Error("REAL_TEST_STEP_LIMIT"); });
  const proxy = new Proxy(ctx, { get(target, name) { return name === "generate" ? { text: async (...args) => { if (++summaries > 80) throw new Error("REAL_TEST_SUMMARY_LIMIT"); const started = Date.now(); const result = await target.generate.text(...args); log({ type: "summary", elapsedMs: Date.now() - started, textBytes: Buffer.byteLength(result.text, "utf8") }); return result; } } : Reflect.get(target, name); } });
  const cleanup = await memory.setup(proxy);
  await ctx.tool.transform(editor => { for (const t of editor.list()) if (!t.id.startsWith("optchat_")) editor.remove(t.id); editor.add({ name: "fixture_probe", options: { codemode: false }, description: "Return a controlled test measurement and a failed deployment test record. These are fixture evidence, not a real deployment.", input: { type: "object", properties: {}, additionalProperties: false }, execute: async () => ({ content: JSON.stringify(${JSON.stringify(fixture)}) }) }); });
  await ctx.session.hook("context", event => log({ type: "primary", sessionId: event.sessionID, userMessages: event.messages.filter(m => m.role === "user").map(m => ({ id: m.id, content: m.content })), system: event.system.filter(p => p.type === "text").map(p => p.text), tools: Object.keys(event.tools) }));
  return cleanup;
} });`);
await Bun.write(join(root, "opencode.json"), JSON.stringify({ plugins: [{ package: join(root, "plugin"), options: { database, scopeId: `real-test:${nonce}`, compactorModel: model, waitMs: 120000 } }], agents: { optchat_live_test: { mode: "primary", steps: 6, description: "Bounded real-model memory test", system: "Answer only from test evidence. Distinguish proposals from implemented changes and failures from successes. Use available memory tools for exact originals. Do not access files, networks or other sessions. Final answers must be concise." } } }));
const sessions: string[] = []; let db: Database | undefined;
const wait = async (fn: () => Promise<boolean> | boolean, label: string) => { const deadline = Date.now() + 300000; while (Date.now() < deadline) { if (await fn()) return; await Bun.sleep(250); } throw new Error(`Timed out: ${label}`); };
const context = async (id: string) => (await api("GET", `/api/session/${id}/context`)) as RawMessage[];
try {
  const create = async (title: string) => { const s = await api("POST", "/api/session", { title, location: { directory: root }, agent: "optchat_live_test", model, permissions: [{ action: "*", resource: "*", effect: "allow" }] }); sessions.push(s.id); return s.id as string; };
  const a = await create("OptChat real test A"), b = await create("OptChat real test B");
  await Bun.write(join(root, "expected.json"), JSON.stringify({ model, sessions, fixture, decisionId, proposalId }, null, 2));
  console.log(JSON.stringify({ root, model, sessions, status: "running" }));
  await api("POST", `/api/session/${a}/prompt`, { text: `Controlled test evidence: decision ${decisionId} selects Bun, not Node. Migration proposal ${proposalId} is NOT implemented. Call fixture_probe once to obtain the exact retry constant, test counts and failed deployment record. Acknowledge the evidence accurately.` });
  await wait(async () => !!(await api("GET", `/api/session/${a}`)).outcome, "A terminal outcome");
  const rawA = await context(a); await Bun.write(join(root, "a-public.json"), JSON.stringify(rawA.map(retainedMessage), null, 2));
  assert.equal((await api("GET", `/api/session/${a}`)).outcome, "succeeded", "A must succeed");
  await wait(() => Bun.file(database).exists(), "OptChat database"); db = new Database(database, { readonly: true });
  const publications = () => (db!.query("SELECT value FROM entities WHERE bucket='publications'").all() as { value: string }[]).map(r => JSON.parse(r.value));
  await wait(() => { const failed = db!.query("SELECT error FROM jobs WHERE status='failed'").all(); assert.equal(failed.length, 0, `Compaction failed: ${JSON.stringify(failed)}`); return publications().some(p => p.sessionId === a); }, "A publication");
  await api("POST", `/api/session/${b}/prompt`, { text: "What runtime was selected in the other session? Retrieve the exact original fixture_probe tool result with optchat_search and optchat_source before answering. Search for an exact identifier from the injected memory if needed. Read a source whose metadata.kind is tool_result: an assistant's answer is NOT the tool result. State the retry constant's name/value, deployment outcome/error, verification counts and whether the migration proposal was implemented. Do not call fixture_probe: it would create new evidence. Return only JSON with keys runtime, retry {name,value}, deployment {outcome,error}, verification {passed,failed}, proposal {id,implemented}, sourceIds (array of original IDs successfully read with optchat_source, NOT summary IDs). Keep numeric values as JSON numbers, implemented as a boolean, and error as the exact error code without commentary. No text outside the JSON." });
  await wait(async () => !!(await api("GET", `/api/session/${b}`)).outcome, "B terminal outcome");
  const rawB = await context(b); await Bun.write(join(root, "b-public.json"), JSON.stringify(rawB.map(retainedMessage), null, 2));
  assert.equal((await api("GET", `/api/session/${b}`)).outcome, "succeeded", "B must succeed");
  console.log(JSON.stringify(await verifyRealHost(root, model, sessions, fixture, decisionId, proposalId), null, 2));
} catch (error) { await Bun.write(join(root, "failure.json"), JSON.stringify({ root, model, sessions, error: String(error) }, null, 2)); console.error(`Diagnostics: ${root}`); throw error; }
finally { db?.close(); for (const id of sessions) await api("POST", `/api/session/${id}/interrupt`, {}).catch(() => {}); }
