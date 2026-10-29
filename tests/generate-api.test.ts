import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import plugin from "../src/adapters/opencode/plugin.ts";
import { Engine, Store } from "../src/index.ts";

const shapes = [
  { version: "2.0.26", path: "legacy" },
  { version: "2.1.1", path: "legacy" },
  { version: "2.1.1", path: "empty-experimental" },
  { version: "2.2.0", path: "experimental-only" },
  { version: "2.2.0", path: "both" },
];

for (const shape of shapes) {
  for (const fail of [false, true]) test(`generate API ${shape.version} ${shape.path} preserves ${fail ? "permanent failures" : "summaries"}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "optchat-generate-api-")), database = join(root, "memory.sqlite");
    const model = { providerID: "fixture", id: "fixture" };
    const calls: { input: any; signal: AbortSignal; receiver: unknown }[] = [];
    let fallbackCalls = 0;
    const selected = { async text(this: unknown, input: any, options: { signal: AbortSignal }) {
      calls.push({ input, signal: options.signal, receiver: this });
      if (fail) throw new Error("HTTP 401 Unauthorized");
      return { text: "Retained generation evidence." };
    } };
    const generation = shape.path === "legacy" ? { generate: selected }
      : shape.path === "empty-experimental" ? { experimental: {}, generate: selected }
      : shape.path === "experimental-only" ? { experimental: { generate: selected } }
      : { experimental: { generate: selected }, generate: { text: async () => { fallbackCalls++; throw new Error("Legacy path must not run"); } } };
    let cleanup: (() => Promise<void> | void) | undefined;
    try {
      cleanup = await plugin.setup({
        app: { version: shape.version }, location: { directory: root },
        options: { database, compactorModel: model, waitMs: 1000 },
        session: { hook: async () => {}, get: async () => ({ projectID: "stable", location: { directory: root }, agent: "build", permissions: [] }),
          context: async () => [{ id: "original", type: "user", time: { created: 1 }, text: "RETAINED_GENERATION_EVIDENCE".repeat(40) },
            { id: "idle", type: "idle", time: { created: 2 }, outcome: "succeeded" }] },
        agent: { get: async () => ({ data: { permissions: [] } }) },
        model: { list: async () => ({ data: [{ ...model, enabled: true, limit: { context: 32000, output: 1024 } }] }) },
        ...generation,
        tool: { transform: async (callback: any) => callback({ add() {} }) },
        event: { subscribe: async function* () { yield { type: "session.execution.succeeded", location: { directory: root }, data: { sessionID: "generation-session" } }; } },
      } as any) as typeof cleanup;
      await cleanup?.(); cleanup = undefined;
      expect(calls).toHaveLength(1);
      expect(calls[0]!.receiver).toBe(selected);
      expect(calls[0]!.input.model).toEqual(model);
      expect(calls[0]!.input.prompt).toContain("RETAINED_GENERATION_EVIDENCE");
      expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
      expect(fallbackCalls).toBe(0);
      const store = new Store(database);
      try {
        expect(JSON.stringify(new Engine(store).sources("generation-session", 0))).toContain("RETAINED_GENERATION_EVIDENCE");
        expect(store.all("publications")).toHaveLength(fail ? 0 : 1);
        expect(store.db.query("SELECT DISTINCT status FROM jobs").all()).toEqual([{ status: fail ? "failed" : "done" }]);
        if (!fail) expect(JSON.stringify(store.db.query("SELECT value FROM nodes").all())).toContain("Retained generation evidence.");
      } finally { store.close(); }
    } finally { await cleanup?.(); await rm(root, { recursive: true, force: true }); }
  });
}
