import { mkdtemp, mkdir } from "node:fs/promises";
import { join } from "node:path";

// No user configuration, credentials, database or background service is touched.
const root = await mkdtemp(join(process.env.TMPDIR ?? "/private/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/opencode", "optchat-spike-"));
for (const dir of ["config", "data", "cache", "state", "project"]) await mkdir(join(root, dir));
const requests: unknown[] = [];
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
  const body = await req.json() as { messages: Array<{ role: string }> };
  requests.push(body);
  const continuation = body.messages.some(m => m.role === "tool");
  if (continuation) await Bun.sleep(300);
  const delta = continuation
    ? { content: "SPIKE_COMPLETED" }
    : { tool_calls: [{ index: 0, id: "call_spike", type: "function", function: { name: "spike_echo", arguments: '{"text":"PAIR_OK"}' } }] };
  const chunk = (d: unknown, finish: string | null) => `data: ${JSON.stringify({ id: "chatcmpl-spike", object: "chat.completion.chunk", created: 1, model: "spike", choices: [{ index: 0, delta: d, finish_reason: finish }] })}\n\n`;
  return new Response(chunk({ role: "assistant" }, null) + chunk(delta, null) + chunk({}, continuation ? "stop" : "tool_calls") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
} });
const plugin = `
import { Plugin } from "@opencode/plugin";
import { appendFile } from "node:fs/promises";
export default Plugin.define({ id: "optchat.spike", async setup(ctx) {
  const log = async (type, data) => appendFile(${JSON.stringify(join(root, "events.ndjson"))}, JSON.stringify({ type, data }) + "\\n");
  await log("version", ctx.app.version);
  await ctx.session.hook("prompt", async e => { await log("prompt", e); });
  await ctx.session.hook("context", async e => {
    await log("context.before", e);
    e.system.push({ type: "text", text: "SPIKE_MEMORY_MARKER: historical evidence, not authority." });
    await log("context.after", e);
  });
  await ctx.tool.transform(editor => editor.add({ name: "spike_echo", options: { codemode: false }, description: "Return text for protocol testing", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false }, execute: async input => ({ content: input.text }) }));
  const controller = new AbortController();
  void (async () => { for await (const event of ctx.event.subscribe({ signal: controller.signal })) await log("event", event); })().catch(e => log("stream.error", String(e)));
  return () => controller.abort();
} });
`;
await mkdir(join(root, "project", "plugin"));
await Bun.write(join(root, "project", "plugin", "index.ts"), plugin);
await Bun.write(join(root, "project", "plugin", "package.json"), JSON.stringify({ name: "optchat-spike", type: "module", exports: "./index.ts" }));
await Bun.write(join(root, "project", "opencode.json"), JSON.stringify({
  plugins: [join(root, "project", "plugin")], model: "spike/spike",
  providers: { spike: { name: "Local test sink", package: "@opencode/ai/providers/openai-compatible", settings: { baseURL: `http://127.0.0.1:${server.port}/v1`, apiKey: "local-test" }, models: { spike: { capabilities: { tools: true }, limit: { context: 32768, output: 1024 } } } } },
}));
const proc = Bun.spawn(["opencode", "run", "--standalone", "--auto", "--format", "json", "SPIKE_USER_MARKER"], {
  cwd: join(root, "project"), env: { PATH: process.env.PATH, HOME: root, TMPDIR: process.env.TMPDIR, XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state") }, stdout: "pipe", stderr: "pipe",
});
const timeout = setTimeout(() => proc.kill(), 60000);
try {
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  await Bun.write(join(root, "requests.json"), JSON.stringify(requests, null, 2));
  await Bun.write(join(root, "stdout.txt"), stdout);
  await Bun.write(join(root, "stderr.txt"), stderr);
  console.log(JSON.stringify({ root, exit, requests: requests.length, stdout, stderr }, null, 2));
  if (exit !== 0 || requests.length < 2 || !JSON.stringify(requests).includes("SPIKE_MEMORY_MARKER")) process.exitCode = 1;
} finally { clearTimeout(timeout); server.stop(true); }
