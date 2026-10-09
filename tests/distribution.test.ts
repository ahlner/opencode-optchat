import { expect, test } from "bun:test";

test("Git package exports a compiled plugin and a separate core without install scripts", async () => {
  const metadata = await Bun.file("package.json").json();
  const { default: plugin } = await import(`../${metadata.exports["."].default}`);
  const { Engine, Store } = await import(`../${metadata.exports["./core"].default}`);
  expect(metadata.private).toBe(true);
  expect(metadata.exports["."].default).toBe("./dist/adapters/opencode/plugin.js");
  expect(metadata.exports["./core"].default).toBe("./dist/index.js");
  expect(metadata.exports["./plugin"]).toEqual(metadata.exports["."]);
  for (const entry of Object.values(metadata.exports) as { default: string; types: string }[]) {
    expect(await Bun.file(entry.default).exists()).toBe(true);
    expect(await Bun.file(entry.types).exists()).toBe(true);
  }
  for (const hook of ["prepare", "preinstall", "install", "postinstall"]) expect(metadata.scripts[hook]).toBeUndefined();
  expect(plugin.setup).toBeFunction();
  const store = new Store();
  try {
    const engine = new Engine(store); engine.register("git", "test", "stable");
    expect(engine.admit("git", "turn").snapshot.sessionId).toBe("git");
  } finally { store.close(); }
});
