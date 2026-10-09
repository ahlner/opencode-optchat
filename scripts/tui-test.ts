import { mkdtemp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { strict as assert } from "node:assert";
import { dlopen, ptr } from "bun:ffi";
import { createReadStream } from "node:fs";

// A private pseudo-terminal exercises the native TUI without submitting a model prompt.
assert.equal(process.platform, "darwin", "The terminal fixture currently requires macOS");
const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-tui-"));
for (const name of ["project", "config", "data", "cache", "state"]) await mkdir(join(root, name));
await mkdir(join(root, "project/plugin"));
await Bun.write(join(root, "project/plugin/package.json"), JSON.stringify({ name: "optchat-tui-fixture", type: "module", exports: { ".": "./index.ts", "./tui": { types: "./tui.ts", default: "./tui.ts" } } }));
await Bun.write(join(root, "project/plugin/index.ts"), `export { default } from ${JSON.stringify(resolve("dist/adapters/opencode/plugin.js"))};`);
await Bun.write(join(root, "project/plugin/tui.ts"), `export { default } from ${JSON.stringify(resolve("dist/adapters/opencode/tui.js"))};`);
await Bun.write(join(root, "project/opencode.json"), JSON.stringify({ plugins: [process.env.OPTCHAT_GIT_PACKAGE ?? join(root, "project/plugin")], providers: {
  fixture: { name: "Offline TUI fixture", package: "@opencode/ai/providers/openai-compatible", settings: { baseURL: "http://127.0.0.1:9/v1", apiKey: "local-fixture" },
    models: { fixture: { limit: { context: 32000, output: 1024 }, capabilities: { tools: true } } } },
}, model: "fixture/fixture" }));
const libc = dlopen("/usr/lib/libSystem.B.dylib", {
  openpty: { args: ["ptr", "ptr", "ptr", "ptr", "ptr"], returns: "i32" },
  write: { args: ["i32", "ptr", "u64"], returns: "i64" },
  close: { args: ["i32"], returns: "i32" },
});
const master = new Int32Array(1), slave = new Int32Array(1), size = new Uint16Array([40, 120, 0, 0]);
assert.equal(libc.symbols.openpty(ptr(master), ptr(slave), null, null, ptr(size)), 0);
const task = Bun.spawn(["opencode", "--standalone", join(root, "project")], {
  cwd: join(root, "project"),
  env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: root, XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state"), TERM: "xterm-256color", COLUMNS: "120", LINES: "40" },
  stdin: slave[0]!, stdout: slave[0]!, stderr: slave[0]!,
});
libc.symbols.close(slave[0]!);
const decoder = new TextDecoder(); let terminal = "";
const output = createReadStream("", { fd: master[0]!, autoClose: false });
output.on("data", bytes => { terminal += decoder.decode(bytes as Buffer, { stream: true }); });
output.on("error", () => {}); // macOS returns EIO when the slave terminal closes.
const write = (text: string) => { const bytes = new TextEncoder().encode(text); libc.symbols.write(master[0]!, ptr(bytes), bytes.length); };
async function waitFor(text: string, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (Bun.stripANSI(terminal).includes(text)) return;
    await Bun.sleep(100);
  }
  throw new Error(`Terminal did not display ${text}. Diagnostics: ${root}`);
}
try {
  await Bun.sleep(process.env.OPTCHAT_GIT_PACKAGE ? 15000 : 7000);
  write("\x10"); await Bun.sleep(800);
  write("OptChat settings"); await Bun.sleep(800);
  write("\r");
  await waitFor("Memory: disabled");
  assert(Bun.stripANSI(terminal).includes("Compactor:"));
  console.log(JSON.stringify({ root, checks: ["automatic TUI package export", "palette command", "native settings dialog", "inactive installation"], modelCalls: 0 }, null, 2));
} finally {
  write("\x1b\x03"); await Bun.sleep(400); write("\x03");
  const timeout = setTimeout(() => task.kill("SIGTERM"), 5000);
  await task.exited; clearTimeout(timeout); await Bun.write(join(root, "terminal.log"), terminal); output.destroy(); libc.symbols.close(master[0]!); libc.close();
}
