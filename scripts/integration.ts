import { mkdtemp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { strict as assert } from "node:assert";

// Real pinned OpenCode service; only the model is replaced by a loopback test sink.
const root = await mkdtemp(join(process.env.TMPDIR ?? "/private/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/opencode", "optchat-integration-"));
for (const dir of ["config", "data", "cache", "state", "project", "project/plugin"]) await mkdir(join(root, dir));
const requests: any[] = [];
let holdSummaries = false;
const heldSummaries = new Set<() => void>();
const plain = (text: string) => ({ content: text });
const call = (id: string, name: string, input: unknown) => ({ tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(input) } }] });
const sink = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
  const body = await req.json() as any; requests.push(body);
  const messages = body.messages as any[], all = JSON.stringify(messages);
  if (holdSummaries && all.includes("UNTRUSTED_JSON_DATA")) await new Promise<void>(resolve => heldSummaries.add(resolve));
  const tools = messages.filter(m => m.role === "tool");
  if (body.tools && messages.some(m => m.role === "user" && JSON.stringify(m.content).includes("FAIL_CURRENT"))) return Response.json({ error: { message: "Fixture rejects this attempt", type: "invalid_request_error", code: "fixture_failure" } }, { status: 400 });
  if (body.tools && messages.some(m => m.role === "user" && JSON.stringify(m.content).includes("INTERRUPT_CURRENT"))) {
    const chunk = (delta: unknown, finish: string | null) => `data: ${JSON.stringify({ id: "chatcmpl-interrupt", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    let timer: ReturnType<typeof setTimeout>;
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(chunk({ role: "assistant", content: "Partial visible attempt, not verified success." }, null)));
      timer = setTimeout(() => { controller.enqueue(new TextEncoder().encode(chunk({}, "stop") + "data: [DONE]\n\n")); controller.close(); }, 5000);
    }, cancel() { clearTimeout(timer); } }), { headers: { "content-type": "text/event-stream" } });
  }
  let delta: any;
  if (all.includes("UNTRUSTED_JSON_DATA")) delta = plain(all.includes("A_DECISION") ? "Historical evidence: A_DECISION, decision to use Bun; fixture tool returned PAIR_OK, not a universal instruction." : "Historical evidence: completed test exchange; inspect sources for exact data.");
  else if (messages.some(m => m.role === "user" && JSON.stringify(m.content).includes("A_DECISION"))) delta = tools.length ? plain("A verified tool result: PAIR_OK; use Bun decision recorded.") : call("call_fixture", "fixture_echo", { text: "PAIR_OK" });
  else if (messages.some(m => m.role === "user" && JSON.stringify(m.content).includes("B_CURRENT"))) {
    if (!tools.length) delta = call("call_search", "optchat_search", { query: "A_DECISION" });
    else if (tools.length === 1) {
      const result = JSON.parse(tools[0].content); const source = result.hits.find((h: any) => h.type === "source");
      assert(source, "B search must expose A's published original"); delta = call("call_source", "optchat_source", { id: source.id });
    } else if (tools.length === 2) {
      const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n");
      const id = system.match(/^([a-f0-9]{64}) \| /m)?.[1]; assert(id, "Shared memory must contain a structural node ID");
      delta = call("call_zoom", "optchat_zoom", { id });
    } else delta = plain("B_RETRIEVAL_COMPLETED");
  } else delta = plain("Short test response");
  if (!body.stream) return Response.json({ id: "chatcmpl-fixture", object: "chat.completion", created: 1, model: "fixture", choices: [{ index: 0, message: { role: "assistant", ...delta }, finish_reason: delta.tool_calls ? "tool_calls" : "stop" }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } });
  const chunk = (d: unknown, finish: string | null) => `data: ${JSON.stringify({ id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: d, finish_reason: finish }] })}\n\n`;
  return new Response(chunk({ role: "assistant" }, null) + chunk(delta, null) + chunk({}, delta.tool_calls ? "tool_calls" : "stop") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
} });
let dbPath = join(root, "memory.sqlite");
const pluginPath = resolve(process.env.OPTCHAT_PLUGIN_ENTRY ?? "dist/adapters/opencode/plugin.js");
const managedSettings = process.env.OPTCHAT_TUI_SETTINGS === "1";
const gitPackage = process.env.OPTCHAT_GIT_PACKAGE;
if (gitPackage) console.log(`Test Git package: ${gitPackage}`);
await Bun.write(join(root, "project/plugin/index.ts"), `
import { Plugin } from "@opencode/plugin";
${gitPackage ? "" : `import memory from ${JSON.stringify(pluginPath)};`}
export default Plugin.define({ id: "optchat.integration", async setup(ctx) {
  ${gitPackage ? "const cleanup = undefined;" : "const cleanup = await memory.setup(ctx);"}
  await ctx.tool.transform(editor => editor.add({ name: "fixture_echo", options: { codemode: false }, description: "Protocol fixture", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false }, execute: async i => ({ content: i.text }) }));
  return cleanup;
} });`);
await Bun.write(join(root, "project/plugin/package.json"), JSON.stringify({ name: "optchat-integration", type: "module", exports: "./index.ts" }));
await Bun.write(join(root, "project/opencode.json"), JSON.stringify({
  plugins: [{ package: gitPackage ?? join(root, "project/plugin"), ...(managedSettings ? {} : { options: { database: dbPath, scopeId: "fixture-user:stable-project", compactorModel: { providerID: "fixture", id: "fixture" }, waitMs: 30000 } }) }, ...(gitPackage ? [{ package: join(root, "project/plugin") }] : [])], model: "fixture/fixture",
  agents: { memory_denied: { description: "Native agent memory-denial fixture", mode: "primary", permissions: [{ action: "optchat.read", resource: "*", effect: "deny" }] } },
  providers: { fixture: { name: "Loopback fixture", package: "@opencode/ai/providers/openai-compatible", settings: { baseURL: `http://127.0.0.1:${sink.port}/v1`, apiKey: "local-fixture" }, models: { fixture: { capabilities: { tools: true }, limit: { context: 131072, output: 1024 } } } } },
}));
const git = async (args: string[]) => {
  const task = Bun.spawn(["git", ...args], { cwd: join(root, "project"), stdout: "pipe", stderr: "pipe" });
  const [exit, error] = await Promise.all([task.exited, new Response(task.stderr).text()]); assert.equal(exit, 0, error);
};
await git(["-c", "init.defaultBranch=main", "init"]);
await Bun.write(join(root, "project/fixture.txt"), "Private integration fixture.\n");
await git(["add", "fixture.txt"]);
await git(["-c", "user.name=OptChat Fixture", "-c", "user.email=fixture@invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Private test fixture"]);
const worktree = join(root, "worktree");
await git(["worktree", "add", "--detach", worktree]);
await Bun.write(join(worktree, "opencode.json"), await Bun.file(join(root, "project/opencode.json")).text());
const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() }); const port = reservation.port; reservation.stop(true);
const env = { PATH: process.env.PATH, HOME: root, TMPDIR: process.env.TMPDIR, XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state") };
const start = () => Bun.spawn(["opencode", "serve", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: join(root, "project"), env, stdout: Bun.file(join(root, "service.stdout")), stderr: Bun.file(join(root, "service.stderr")) });
let proc = start();
const url = `http://127.0.0.1:${port}`;
let authorization = "";
async function api(method: string, path: string, data?: unknown) {
  const res = await fetch(url + path, { method, headers: { "content-type": "application/json", authorization }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  assert(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`);
  if (res.status === 204) return undefined;
  const result = await res.json() as any; return result.data ?? result;
}
async function until(fn: () => Promise<boolean> | boolean, label: string, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await fn()) return; await Bun.sleep(50); }
  throw new Error(`Timed out: ${label}`);
}
const ready = () => until(async () => { try {
  const output = await Bun.file(join(root, "service.stdout")).text();
  const password = output.match(/server password (\S+)/)?.[1];
  if (!password) return false;
  authorization = "Basic " + Buffer.from(`opencode:${password}`).toString("base64");
  return (await fetch(url + "/api/info", { headers: { authorization } })).ok;
} catch { return false; } }, "private service startup");
let db: Database | undefined;
const publications = () => (db!.query("SELECT value FROM entities WHERE bucket='publications'").all() as { value: string }[]).map(r => JSON.parse(r.value));
try {
  await ready();
  const create = () => api("POST", "/api/session", { location: { directory: join(root, "project") }, model: { providerID: "fixture", id: "fixture" }, permissions: [{ action: "*", resource: "*", effect: "allow" }] });
   const a = await create();
   const settingsCall = async (method: string, input: unknown = {}) => (await api("POST", `/api/rpc/optchat.settings/${method}?location%5Bdirectory%5D=${encodeURIComponent(join(root, "project"))}`, { input })).output;
   if (managedSettings) {
     const settings = await settingsCall("read");
     assert.equal(settings.enabled, false); assert.equal(await Bun.file(settings.database).exists(), false);
     assert(settings.database.startsWith(join(root, "data")), "Automatic database stays in the private server data directory");
      dbPath = settings.database;
      assert.equal((await settingsCall("status")).databaseExists, false, "Status does not create an inactive database");
     await settingsCall("write", { ...settings, enabled: true, compactorModel: { providerID: "fixture", id: "fixture" } });
   }
   if (gitPackage) {
     // Creating a session does not start its Location services. No model call is needed.
     await api("GET", `/api/agent?location%5Bdirectory%5D=${encodeURIComponent(join(root, "project"))}`);
     await until(async () => await Bun.file(dbPath).exists(), "Git plugin installation and setup", 120000);
   }
  await api("POST", `/api/session/${a.id}/prompt`, { text: "A_DECISION: use Bun; run fixture_echo." });
  await until(async () => (await api("GET", `/api/session/${a.id}`)).outcome === "succeeded", "A terminal outcome");
  await until(async () => await Bun.file(dbPath).exists(), "memory database"); db = new Database(dbPath, { readonly: true });
  await until(() => publications().some(p => p.sessionId === a.id), "A atomic publication");
  const rawA = await api("GET", `/api/session/${a.id}/context`); await Bun.write(join(root, "raw-a.json"), JSON.stringify(rawA, null, 2));
  assert.equal(publications().find(p => p.sessionId === a.id).completedAt, new Date(rawA.findLast((m: any) => m.type === "idle").time.created).toISOString(), "Publication preserves the actual host terminal time, not reconciliation time");
  const b = await create(); const beforeB = requests.length;
  await api("POST", `/api/session/${b.id}/prompt`, { text: "B_CURRENT: What did A decide? Retrieve original evidence." });
  await until(async () => (await api("GET", `/api/session/${b.id}`)).outcome === "succeeded", "B terminal outcome");
  const bCalls = requests.slice(beforeB).filter(r => r.tools && r.messages.some((m: any) => m.role === "user" && JSON.stringify(m.content).includes("B_CURRENT")) && !JSON.stringify(r).includes("UNTRUSTED_JSON_DATA"));
  assert(bCalls.length >= 4, "B must perform search/source/zoom with continuations");
  for (const request of bCalls) {
    assert(request.messages.some((m: any) => m.role === "system" && JSON.stringify(m.content).includes("A_DECISION")), "A substantive memory must be injected before B's request");
    assert(!request.messages.some((m: any) => m.role === "user" && JSON.stringify(m.content).includes("A_DECISION")), "A is never a user message in B");
    const known = new Set<string>();
    for (const message of request.messages) {
      for (const tool of message.tool_calls ?? []) known.add(tool.id);
      if (message.role === "tool") assert(known.has(message.tool_call_id), "Every tool result has its own call in the active transcript");
    }
  }
  assert(JSON.stringify(bCalls).includes("PAIR_OK"), "Original tool evidence is retrievable");
  await until(() => publications().some(p => p.sessionId === b.id), "B publication");
  const priorCount = publications().length;
  proc.kill("SIGKILL"); await proc.exited; proc = start(); await ready();
  if (managedSettings) assert.equal((await settingsCall("read")).enabled, true, "Settings survive a server crash");
  const c = await create(); const beforeC = requests.length;
  await api("POST", `/api/session/${c.id}/prompt`, { text: "C_CURRENT after restart" });
  await until(async () => (await api("GET", `/api/session/${c.id}`)).outcome === "succeeded", "restart session C");
  assert(requests.slice(beforeC).some(r => r.messages.some((m: any) => m.role === "system" && JSON.stringify(m.content).includes("A_DECISION"))), "Shared memory survives service restart");
  assert(publications().filter(p => p.sessionId === a.id).length === 1, "Restart never republishes A");
  if (managedSettings) {
    await until(() => publications().some(p => p.sessionId === c.id), "C publication before settings change");
     const settings = await settingsCall("read"), count = publications().length;
     const health = await settingsCall("status");
     assert(health.originals > 0 && health.summaries > 0 && health.sessions >= 3);
     assert.equal(health.publications, count); assert.equal(health.jobs.failed, 0);
     assert.equal((await settingsCall("retry")).publications, count, "Retry does not delete memory or create duplicate publications");
    await settingsCall("write", { ...settings, enabled: false });
    assert.equal((await settingsCall("read")).enabled, false);
    assert.equal(publications().length, count, "Disabling does not delete retained originals or publications");
     await settingsCall("write", { ...settings, memoryBytes: 12000 });
     assert.equal((await settingsCall("read")).memoryBytes, 12000);
     await settingsCall("write", { ...settings, memoryBytes: 12000, waitMs: 500 });
     holdSummaries = true;
     await api("POST", `/api/session/${a.id}/prompt`, { text: "SLOW_HISTORY_SEED" });
     await until(() => heldSummaries.size > 0, "slow terminal compaction begins");
     const started = performance.now(), beforeBlocked = requests.length;
     await api("POST", `/api/session/${b.id}/prompt`, { text: "BLOCKED_BY_SLOW_HISTORY" });
     await until(async () => ["failed", "interrupted"].includes((await api("GET", `/api/session/${b.id}`)).outcome), "bounded slow-history stop", 5000);
     assert(performance.now() - started < 5000, "Slow preparation stops rather than retaining the primary hook indefinitely");
     assert(!requests.slice(beforeBlocked).some(r => r.tools && r.messages.some((m: any) => m.role === "user" && JSON.stringify(m.content).includes("BLOCKED_BY_SLOW_HISTORY"))), "No primary request with incomplete history is dispatched");
     await until(async () => (await settingsCall("status")).jobs.running === 0, "cancelled jobs release their claims", 5000);
     const stoppedHealth = await settingsCall("status");
     assert(stoppedHealth.jobs.pending > 0); assert.equal(stoppedHealth.jobs.failed, 0);
     assert.equal((await settingsCall("retry")).originals, stoppedHealth.originals, "Settings RPC is available after the timeout without deleting originals");
     holdSummaries = false; for (const release of heldSummaries) release(); heldSummaries.clear();
     await api("POST", `/api/session/${c.id}/prompt`, { text: "RESUME_AFTER_SLOW_HISTORY" });
     await until(async () => (await api("GET", `/api/session/${c.id}`)).outcome === "succeeded", "primary admission resumes after cancellation");
     assert.equal((db!.query("SELECT count(*) AS n FROM entities WHERE bucket='sessions' AND json_extract(value,'$.disabled') IS NOT NULL").get() as { n: number }).n, 0);
      console.log(JSON.stringify({ root, checks: ["inactive installation", "server-side defaults", "model selection", "activation", "context injection", "source retrieval", "crash recovery", "persistent settings", "disable without deletion", "budget change", "memory status", "safe retry RPC", "slow-history deadline", "cancelled claims and available settings", "admission resumes without retirement"], modelRequests: requests.length }, null, 2));
  } else {
  const interrupted = await create();
  await api("POST", `/api/session/${interrupted.id}/prompt`, { text: "INTERRUPT_CURRENT: begin an attempt." });
  await until(() => requests.some(r => r.tools && r.messages.some((m: any) => m.role === "user" && JSON.stringify(m.content).includes("INTERRUPT_CURRENT"))), "streamed interrupted request");
  await api("POST", `/api/session/${interrupted.id}/interrupt`, {});
  await until(async () => (await api("GET", `/api/session/${interrupted.id}`)).outcome === "interrupted", "interruption terminal state");
  await until(() => publications().some(p => p.sessionId === interrupted.id && p.outcome === "interrupted"), "truthful interrupted publication");
  const failed = await create();
  await api("POST", `/api/session/${failed.id}/prompt`, { text: "FAIL_CURRENT: this attempt must fail." });
  await until(async () => (await api("GET", `/api/session/${failed.id}`)).outcome === "failed", "provider failure terminal state");
  await until(() => publications().some(p => p.sessionId === failed.id && p.outcome === "failed"), "truthful failed publication");
  await api("POST", `/api/session/${c.id}/compact`, {});
  await until(async () => (await api("GET", `/api/session/${c.id}`)).outcome !== undefined, "compaction outcome");
  await Bun.write(join(root, "raw-compacted.json"), JSON.stringify(await api("GET", `/api/session/${c.id}/context`), null, 2));
  await until(async () => (await api("GET", `/api/session/${c.id}/context`)).some((m: any) => m.type === "compaction" && m.status === "completed"), "native compaction checkpoint");
  assert(db.query("SELECT id FROM sources WHERE session=?").all(c.id).length > 0, "Compaction preserves original history");
  const beforeCompacted = requests.length;
  await api("POST", `/api/session/${c.id}/prompt`, { text: "COMPACTED_CURRENT" });
  await until(async () => (await api("GET", `/api/session/${c.id}`)).outcome === "succeeded", "compacted session continues");
  assert(requests.slice(beforeCompacted).some(r => r.tools && r.messages.some((m: any) => m.role === "user" && JSON.stringify(m.content).includes("COMPACTED_CURRENT"))), "Compacted session reaches primary model with preserved memory");
  await until(() => publications().filter(p => p.sessionId === c.id).length === 2, "post-compaction publication");
  await api("POST", `/api/session/${c.id}/compact`, {});
  await until(async () => (await api("GET", `/api/session/${c.id}/context`)).some((m: any) => m.type === "compaction" && m.status === "completed"), "second checkpoint");
  proc.kill("SIGKILL"); await proc.exited; proc = start(); await ready();
  await api("POST", `/api/session/${c.id}/prompt`, { text: "CHECKPOINT_RESTART_CURRENT" });
  await until(async () => (await api("GET", `/api/session/${c.id}`)).outcome === "succeeded", "checkpoint restart resumes originals");
  await until(() => publications().filter(p => p.sessionId === c.id).length === 3, "checkpoint restart dedup");
  const fork = await api("POST", `/api/session/${a.id}/fork`, {});
  await Bun.write(join(root, "raw-fork.json"), JSON.stringify({ info: await api("GET", `/api/session/${fork.id}`), context: await api("GET", `/api/session/${fork.id}/context`) }, null, 2));
  const beforeFork = requests.length; await api("POST", `/api/session/${fork.id}/prompt`, { text: "FORK_CURRENT" });
  await until(async () => (await api("GET", `/api/session/${fork.id}`)).outcome === "succeeded", "fork continues with inherited prefix");
  assert(requests.slice(beforeFork).some(r => r.tools && r.messages.some((m: any) => m.role === "user" && JSON.stringify(m.content).includes("FORK_CURRENT"))), "Verified fork reaches primary model");
  await until(() => publications().some(p => p.sessionId === fork.id), "fork new turn publication");
  assert(publications().filter(p => p.sessionId === fork.id).length === 1, "Inherited prefix is never republished");
  const compactFork = await api("POST", `/api/session/${c.id}/fork`, {});
  await api("POST", `/api/session/${compactFork.id}/prompt`, { text: "COMPACT_FORK_CURRENT" });
  await until(async () => (await api("GET", `/api/session/${compactFork.id}`)).outcome === "succeeded", "fork of compacted parent");
  await until(() => publications().filter(p => p.sessionId === compactFork.id).length === 1, "compacted inheritance is not republished");
  assert((db.query("SELECT value FROM sources WHERE session=?").all(compactFork.id) as { value: string }[]).some(r => r.value.includes("C_CURRENT")), "Compacted fork inherits archived originals");
  const child = await api("POST", "/api/session", { location: { directory: join(root, "project") }, parentID: b.id, model: { providerID: "fixture", id: "fixture" } });
  await api("POST", `/api/session/${child.id}/prompt`, { text: "PRIVATE_CHILD_CURRENT" });
  await until(async () => (await api("GET", `/api/session/${child.id}`)).outcome === "succeeded", "private child session executes");
  await until(() => (db!.query("SELECT value FROM entities WHERE bucket='turns'").all() as { value: string }[]).some(r => r.value.includes(child.id) && r.value.includes('"outcome":"completed"')), "child sealing");
  assert(!publications().some(p => p.sessionId === child.id), "Child does not broadcast by default");
  const restricted = await create();
  await api("POST", `/api/session/${restricted.id}/prompt`, { text: "REVOKE_SHARE_CURRENT" });
  await until(() => publications().some(p => p.sessionId === restricted.id), "permission test publication");
  await api("PATCH", `/api/session/${restricted.id}`, { permissions: [{ action: "optchat.share", resource: "fixture-user:stable-project", effect: "deny" }] });
  await until(() => !publications().some(p => p.sessionId === restricted.id), "native permission revokes publication");
  assert(db.query("SELECT id FROM sources WHERE session=?").all(restricted.id).length > 0, "Share denial keeps authorized own originals");
  await api("POST", `/api/session/${restricted.id}/prompt`, { text: "PRIVATE_PERMISSION_CURRENT" });
  await until(async () => (await api("GET", `/api/session/${restricted.id}`)).outcome === "succeeded", "private session continues without broadcast");
  assert(!publications().some(p => p.sessionId === restricted.id), "Denied turns are not broadcast");
  await api("PATCH", `/api/session/${restricted.id}`, { permissions: [{ action: "optchat.read", resource: "fixture-user:stable-project", effect: "deny" }] });
  await until(() => !db!.query("SELECT id FROM sources WHERE session=?").all(restricted.id).length, "read revocation purges originals");
  const beforeDenied = requests.length;
  await api("POST", `/api/session/${restricted.id}/prompt`, { text: "DENIED_MEMORY_CURRENT" });
  await until(async () => ["failed", "interrupted"].includes((await api("GET", `/api/session/${restricted.id}`)).outcome), "denied read stops primary admission");
  assert(!requests.slice(beforeDenied).some(r => r.tools && r.messages.some((m: any) => m.role === "user" && JSON.stringify(m.content).includes("DENIED_MEMORY_CURRENT"))), "No model sees denied memory");
  const rewind = await create();
  await api("POST", `/api/session/${rewind.id}/prompt`, { text: "REWIND_KEEP" });
  await until(() => publications().some(p => p.sessionId === rewind.id), "rewind first publication");
  const firstRewindPub = publications().find(p => p.sessionId === rewind.id)!;
  await api("POST", `/api/session/${rewind.id}/prompt`, { text: "REWIND_REMOVE" });
  await until(() => publications().filter(p => p.sessionId === rewind.id).length === 2, "rewind second publication");
  const rewindRaw = await api("GET", `/api/session/${rewind.id}/context`);
  const removedMessage = rewindRaw.find((m: any) => m.type === "user" && m.text === "REWIND_REMOVE");
  await api("POST", `/api/session/${rewind.id}/revert/stage`, { messageID: removedMessage.id, files: false });
  await api("POST", `/api/session/${rewind.id}/revert/commit`, {});
  await until(() => publications().filter(p => p.sessionId === rewind.id).length === 1, "partial rewind retirement");
  assert(publications().find(p => p.sessionId === rewind.id)!.publicationSeq === firstRewindPub.publicationSeq, "Unchanged publication keeps its order");
  const rewindSources = db.query("SELECT value FROM sources WHERE session=?").all(rewind.id) as { value: string }[];
  assert(rewindSources.some(r => r.value.includes("REWIND_KEEP")) && !rewindSources.some(r => r.value.includes("REWIND_REMOVE")), "Rewind preserves prefix only");
  await api("POST", `/api/session/${rewind.id}/prompt`, { text: "REWIND_NEW_CURRENT" });
  await until(async () => (await api("GET", `/api/session/${rewind.id}`)).outcome === "succeeded", "rewound session resumes");
  const moving = await create();
  await api("POST", `/api/session/${moving.id}/prompt`, { text: "WORKTREE_BEFORE_MOVE" });
  await until(() => publications().some(p => p.sessionId === moving.id), "move first publication");
  const oldProject = (await api("GET", `/api/session/${moving.id}`)).projectID;
  await api("POST", `/api/session/${moving.id}/move`, { directory: worktree });
  await until(async () => (await api("GET", `/api/session/${moving.id}`)).location.directory === worktree, "native worktree move");
  assert.equal((await api("GET", `/api/session/${moving.id}`)).projectID, oldProject, "Worktrees retain stable host project identity");
  await api("POST", `/api/session/${moving.id}/prompt`, { text: "WORKTREE_AFTER_MOVE" });
  await until(async () => (await api("GET", `/api/session/${moving.id}`)).outcome === "succeeded", "moved session continues");
  await until(() => publications().filter(p => p.sessionId === moving.id).length === 2, "move does not republish earlier turns");
  const movedSources = (db.query("SELECT value FROM sources WHERE session=?").all(moving.id) as { value: string }[]).map(r => JSON.parse(r.value));
  const movedFork = await api("POST", `/api/session/${moving.id}/fork`, {});
  await api("POST", `/api/session/${movedFork.id}/prompt`, { text: "WORKTREE_FORK_CURRENT" });
  await until(async () => (await api("GET", `/api/session/${movedFork.id}`)).outcome === "succeeded", "fork after worktree move");
  await until(() => publications().filter(p => p.sessionId === movedFork.id).length === 1, "moved fork publishes only its new turn");
  const inheritedSources = (db.query("SELECT value FROM sources WHERE session=?").all(movedFork.id) as { value: string }[]).map(r => JSON.parse(r.value)).filter(r => r.inheritedFrom);
  assert.equal(inheritedSources.length, movedSources.length);
  for (const copy of inheritedSources) {
    const origin = movedSources.find(r => r.seq === copy.inheritedFrom.seq && r.generation === copy.inheritedFrom.generation)!;
    assert.equal(copy.inheritedFrom.sessionId, moving.id); assert.equal(copy.worktreeId, origin.worktreeId); assert.equal(copy.payload, origin.payload); assert.equal(copy.payloadHash, origin.payloadHash);
  }
  assert(movedSources.some(r => r.worktreeId === worktree) && movedSources.some(r => r.worktreeId === join(root, "project")), "Records retain their actual worktree provenance");
  const activeRevocation = await create();
  await api("POST", `/api/session/${activeRevocation.id}/prompt`, { text: "INTERRUPT_CURRENT: permission will change during streaming" });
  await until(() => requests.some(r => r.tools && r.messages.some((m: any) => m.role === "user" && JSON.stringify(m.content).includes("permission will change"))), "active request reaches fixture");
  const policyBefore = JSON.parse((db.query("SELECT value FROM entities WHERE bucket='scopes'").get() as { value: string }).value).policy;
  await api("PATCH", `/api/session/${activeRevocation.id}`, { permissions: [{ action: "*", resource: "*", effect: "allow" }, { action: "optchat.read", resource: "fixture-user:stable-project", effect: "deny" }] });
  await until(async () => (await api("GET", `/api/session/${activeRevocation.id}`)).outcome === "interrupted", "permission change interrupts admitted request");
  assert.equal(db.query("SELECT id FROM sources WHERE session=?").all(activeRevocation.id).length, 0, "Revoked active data cannot be imported on interruption");
  assert(JSON.parse((db.query("SELECT value FROM entities WHERE bucket='scopes'").get() as { value: string }).value).policy > policyBefore, "Native policy changes advance the pinned policy revision");
  const oversized = await create(), beforeOversized = requests.length;
  await api("POST", `/api/session/${oversized.id}/prompt`, { text: "OVERSIZED_ACTIVE_SENTINEL " + "x".repeat(160000) });
  await until(async () => ["failed", "interrupted"].includes((await api("GET", `/api/session/${oversized.id}`)).outcome), "oversized active request stops explicitly");
  assert(!requests.slice(beforeOversized).some(r => r.tools && r.messages.some((m: any) => m.role === "user" && JSON.stringify(m.content).includes("OVERSIZED_ACTIVE_SENTINEL"))), "No oversized primary request reaches the provider");
  const deniedAgent = await create();
  await api("PATCH", `/api/session/${deniedAgent.id}`, { permissions: [] });
  await api("POST", `/api/session/${deniedAgent.id}/agent`, { agent: "memory_denied" });
  const beforeAgentDenied = requests.length;
  await api("POST", `/api/session/${deniedAgent.id}/prompt`, { text: "AGENT_POLICY_DENIED_CURRENT" });
  await until(async () => ["failed", "interrupted"].includes((await api("GET", `/api/session/${deniedAgent.id}`)).outcome), "native agent rule blocks admission");
  assert(!requests.slice(beforeAgentDenied).some(r => r.tools && r.messages.some((m: any) => m.role === "user" && JSON.stringify(m.content).includes("AGENT_POLICY_DENIED_CURRENT"))), "Agent Memory denial cannot be bypassed by context injection");
  await api("DELETE", `/api/session/${a.id}`);
  await until(() => !publications().some(p => p.sessionId === a.id), "retention deletion");
  const sourceRows = db.query("SELECT value FROM sources WHERE session=?").all(a.id); assert(sourceRows.length === 0, "Deleted originals are purged");
  await api("POST", `/api/session/${fork.id}/prompt`, { text: "FORK_AFTER_PARENT_DELETE" });
  await until(async () => (await api("GET", `/api/session/${fork.id}`)).outcome === "succeeded", "independent fork survives parent deletion");
  assert((db.query("SELECT value FROM sources WHERE session=?").all(fork.id) as { value: string }[]).some(r => r.value.includes("A_DECISION")), "Fork copies are independently retained");
  await api("DELETE", `/api/session/${c.id}`);
  await until(() => (db!.query("SELECT value FROM entities WHERE bucket='checkpoints'").all() as { value: string }[]).every(r => !r.value.includes(c.id)), "checkpoint deletion purges archived originals");
  await api("POST", `/api/session/${compactFork.id}/prompt`, { text: "COMPACT_FORK_AFTER_PARENT_DELETE" });
  await until(async () => (await api("GET", `/api/session/${compactFork.id}`)).outcome === "succeeded", "fork checkpoint survives parent deletion");
  let installedEntrypoint: string | undefined;
  if (gitPackage) {
    const log = await Bun.file(join(root, "data/opencode/log/opencode.log")).text();
    installedEntrypoint = log.split("\n").find(line => line.includes(`id=${gitPackage} `) && line.includes("entrypoint="))?.match(/entrypoint=(\S+)/)?.[1];
    assert(installedEntrypoint, "The host must load the Git package, not the local source");
    assert(installedEntrypoint.includes("/cache/opencode/"), "The host must use its isolated package cache");
    assert(installedEntrypoint.endsWith("/dist/adapters/opencode/plugin.js"), "The Git root export must resolve to the compiled plugin");
  }
  console.log(JSON.stringify({ root, pluginPath: gitPackage ? undefined : pluginPath, gitPackage, installedEntrypoint, checks: ["actual context injection", "foreign transcript isolation", "tool protocol pairs", "search/source/zoom", "terminal publication", "service restart", "deduplication", "interrupted outcome", "failed outcome", "native compaction", "repeated checkpoint restart", "fork inheritance without republishing", "compacted fork inheritance", "independent fork retention", "private child execution", "native permission revocation", "active permission revocation", "native agent memory rule", "partial rewind", "stable-project worktree move", "fork original worktree provenance", "oversized active turn stop", "deletion including checkpoints"], priorCount, modelRequests: requests.length }, null, 2));
  }
} catch (error) {
  console.error(`Integration artifacts: ${root}`); throw error;
} finally {
  for (const release of heldSummaries) release();
  await Bun.write(join(root, "requests.json"), JSON.stringify(requests, null, 2));
  db?.close(); proc.kill("SIGTERM"); await proc.exited; sink.stop(true);
}
