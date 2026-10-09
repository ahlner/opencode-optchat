import { mkdtemp, mkdir, readdir, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { strict as assert } from "node:assert";
import { checkArchivedPaper, checkMarkdown, documentationFiles } from "./docs-check.ts";

// Pack and test only local files. This script never publishes to a registry.
const repository = resolve("."), root = await mkdtemp(join(process.env.TMPDIR ?? "/private/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/opencode", "optchat-package-"));
async function run(args: string[], cwd = repository, extraEnv: Record<string, string> = {}) {
  const task = Bun.spawn(args, { cwd, env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, ...extraEnv }, stdout: "inherit", stderr: "inherit" });
  assert.equal(await task.exited, 0, `Command failed: ${args.join(" ")}`);
}
try {
  await run(["bun", "pm", "pack", "--destination", root]);
  const archives = (await readdir(root)).filter(f => f.endsWith(".tgz")); assert.equal(archives.length, 1);
  await run(["tar", "-xzf", join(root, archives[0]!), "-C", root]);
  const packageDir = join(root, "package"), metadata = await Bun.file(join(packageDir, "package.json")).json();
  assert.equal(metadata.exports["./plugin"].default, "./dist/adapters/opencode/plugin.js");
  assert.equal(metadata.exports["./tui"].default, "./dist/adapters/opencode/tui.js");
  assert(await Bun.file(join(packageDir, metadata.exports["./tui"].default)).exists());
  assert.equal(metadata.license, "MIT");
  assert.equal(metadata.author, "Philipp Ahlner");
  const license = await Bun.file(join(packageDir, "LICENSE")).text();
  assert(license.includes("Copyright (c) 2026 Philipp Ahlner"));
  assert(license.includes("Permission is hereby granted, free of charge"));
  assert(await Bun.file(join(packageDir, "THIRD_PARTY_NOTICES.md")).exists());
  assert(await Bun.file(join(packageDir, "docs/dependency-licenses.json")).exists());
  assert(await Bun.file(join(packageDir, "docs/writing-guide.md")).exists());
  assert(await checkArchivedPaper(packageDir), "The package must retain the unchanged implementation paper");
  const documentation = await documentationFiles(packageDir);
  for (const file of documentation) {
    assert.deepEqual(checkMarkdown(await Bun.file(join(packageDir, file)).text()), [], `Documentation checks failed: ${file}`);
  }
  assert(!(await Bun.file(join(packageDir, "node_modules/@opencode/plugin/package.json")).exists()));
  assert(!(await Bun.file(join(packageDir, "src/index.ts")).exists()), "The package must not depend on unshipped TypeScript source");
  await mkdir(join(root, "node_modules"));
  // Resolve only the already installed, pinned build dependencies. No network install.
  await symlink(join(repository, "node_modules/@opencode"), join(root, "node_modules/@opencode"));
  await symlink(join(repository, "node_modules/@types"), join(root, "node_modules/@types"));
  await symlink(packageDir, join(root, "node_modules/opencode-optchat"));
   await Bun.write(join(root, "consumer.ts"), `import { Store, Engine, type Snapshot } from "opencode-optchat/core";
import plugin from "opencode-optchat";
import explicitPlugin from "opencode-optchat/plugin";
const store = new Store(); const engine = new Engine(store); engine.register("package", "test", "stable");
const snapshot: Snapshot = engine.admit("package", "turn").snapshot;
if (snapshot.sessionId !== "package" || !plugin.setup || plugin !== explicitPlugin) throw new Error("Broken package exports"); store.close();`);
  await run(["bun", join(root, "consumer.ts")], root);
  await run([join(repository, "node_modules/.bin/tsc"), "--noEmit", "--strict", "--skipLibCheck", "--allowImportingTsExtensions", "--module", "Preserve", "--moduleResolution", "bundler", "--target", "ESNext", "--types", "bun", join(root, "consumer.ts")], root);
  await run(["bun", "run", "scripts/integration.ts"], repository, { OPTCHAT_PLUGIN_ENTRY: join(packageDir, metadata.exports["./plugin"].default) });
  await run(["bun", "run", "scripts/integration.ts"], repository, { OPTCHAT_PLUGIN_ENTRY: join(packageDir, metadata.exports["./plugin"].default), OPTCHAT_TUI_SETTINGS: "1" });
  console.log("Packed package: public runtime exports, TypeScript consumer, and private OpenCode integration passed.");
} finally { await rm(root, { recursive: true, force: true }); }
