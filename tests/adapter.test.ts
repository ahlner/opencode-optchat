import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import plugin from "../src/adapters/opencode/plugin.ts";
import { Store, Engine } from "../src/index.ts";
import { extract } from "../src/adapters/opencode/transcript.ts";

test("server-wide terminal events do not import unrelated Locations into a configured scope", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-event-scope-")); let reads = 0;
  try {
    const database = join(root, "memory.sqlite");
    const cleanup = await plugin.setup({ app: { version: "2.0.26" }, location: { directory: root }, options: { database, scopeId: "event-scope", fakeSummarizer: true }, session: { hook: async () => {}, get: async () => { reads++; throw new Error("Must not read unrelated history"); } }, tool: { transform: async (callback: any) => callback({ add() {} }) }, event: { subscribe: async function* () { yield { type: "session.execution.succeeded", location: { directory: "/unrelated" }, data: { sessionID: "foreign" } }; } } } as any);
    await cleanup?.(); const store = new Store(database);
    try { expect(reads).toBe(0); expect(store.all("sessions")).toEqual([]); expect(store.all("publications")).toEqual([]); } finally { store.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("real-compactor rejection preserves originals and failed jobs instead of retiring history", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-compactor-failure-"));
  try {
    const database = join(root, "memory.sqlite");
    const cleanup = await plugin.setup({ app: { version: "2.0.26" }, location: { directory: root }, options: { database, scopeId: "failure-scope", compactorModel: { id: "fixture", providerID: "fixture" } },
      session: { hook: async () => {}, get: async () => ({ projectID: "stable", location: { directory: root }, agent: "build", permissions: [] }), context: async () => [{ id: "original", type: "user", time: { created: 1 }, text: "RETRYABLE_ORIGINAL" }, { id: "idle", type: "idle", time: { created: 2 }, outcome: "succeeded" }] },
      agent: { get: async () => ({ data: { permissions: [] } }) }, model: { list: async () => ({ data: [{ id: "fixture", providerID: "fixture", limit: { context: 32000, output: 1024 } }] }) }, generate: { text: async () => ({ text: "x".repeat(513) }) }, tool: { transform: async (callback: any) => callback({ add() {} }) }, event: { subscribe: async function* () { yield { type: "session.execution.succeeded", location: { directory: root }, data: { sessionID: "original-session" } }; } },
    } as any);
    await cleanup?.(); const store = new Store(database);
    try {
      const engine = new Engine(store); expect(engine.session("original-session")).toMatchObject({ generation: 0 });
      expect(JSON.stringify(engine.sources("original-session", 0))).toContain("RETRYABLE_ORIGINAL"); expect(store.all("publications")).toEqual([]);
      expect(store.db.query("SELECT status FROM jobs").all()).toEqual([{ status: "failed" }]); expect(store.get("adapterErrors", "original-session")).toBeDefined();
      engine.retryFailed(); await engine.drain(); expect(store.all("publications")).toHaveLength(1); expect(engine.session("original-session").generation).toBe(0);
      engine.retire("original-session", "delete"); expect(store.get("adapterErrors", "original-session")).toBeUndefined();
    } finally { store.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("admission waits for another worker's durable cover and stops within its deadline without changing the request", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-admission-"));
  try {
    for (const ready of [true, false]) {
      const database = join(root, ready ? "ready.sqlite" : "timeout.sqlite"), worker = new Store(database), engine = new Engine(worker);
      engine.register("admitted", "u:p", "stable"); engine.admit("admitted", "past");
      const past = { id: "past", type: "user", time: { created: 1 }, text: "DURABLE_COVER_EVIDENCE" }, extracted = extract(past)[0]!;
      engine.append({ sessionId: "admitted", generation: 0, projectId: "stable", eventKey: extracted.key, turnId: "past", kind: extracted.kind, timestamp: extracted.timestamp, payload: extracted.payload });
      engine.finish("admitted", "past", "completed"); const lease = worker.claim(Date.now(), 1000)!;
      const hooks: Record<string, (event: any) => Promise<void>> = {}; let reconciliations = 0;
      const cleanup = await plugin.setup({ app: { version: "2.0.26" }, options: { database, scopeId: "u:p", fakeSummarizer: true, waitMs: ready ? 500 : 60 },
        session: { hook: async (name: string, callback: any) => { hooks[name] = callback; }, get: async () => ({ projectID: "stable", location: { directory: root }, agent: "build", permissions: [] }), context: async () => { reconciliations++; return [past, { id: "idle", type: "idle", time: { created: 2 }, outcome: "succeeded" }, { id: "current", type: "user", time: { created: 3 }, text: "CURRENT" }]; } },
        agent: { get: async () => ({ data: { permissions: [] } }) }, model: { list: async () => ({ data: [{ id: "fixture", providerID: "fixture", limit: { context: 32000, output: 1024 } }] }) },
        tool: { transform: async (callback: any) => callback({ add() {} }) }, event: { subscribe: async function* () {} },
      } as any);
      const request = { sessionID: "admitted", agent: "build", model: { id: "fixture", providerID: "fixture" }, options: {}, system: [{ type: "text", text: "CURRENT_HOST" }], messages: [{ id: "past", role: "user", content: "old" }, { id: "current", role: "user", content: "CURRENT" }], tools: {} };
      const system = request.system, messages = request.messages, started = performance.now();
      let release: ReturnType<typeof setTimeout> | undefined;
      if (ready) release = setTimeout(() => worker.db.query("UPDATE jobs SET status='pending' WHERE id=? AND fence=?").run(lease.id, lease.fence), 45);
      try {
        if (ready) { await hooks.context!(request); expect(performance.now() - started).toBeGreaterThanOrEqual(35); expect(JSON.stringify(request.system)).toContain("DURABLE_COVER_EVIDENCE"); expect(request.messages).toHaveLength(1); expect(reconciliations).toBeGreaterThan(1); }
        else { await expect(hooks.context!(request)).rejects.toThrow("MEMORY_NOT_READY"); expect(performance.now() - started).toBeLessThan(500); expect(request.system).toBe(system); expect(request.messages).toBe(messages); }
      } finally { if (release) clearTimeout(release); await cleanup?.(); worker.close(); }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("adapter rejects unverified hosts and invalid configuration before creating a database", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-adapter-"));
  try {
    const database = join(root, "memory.sqlite"), options = { database, scopeId: "u:p", fakeSummarizer: true };
    await expect(plugin.setup({ app: { version: "2.0.27" }, options } as any)).rejects.toThrow("UNSUPPORTED_HOST");
    for (const invalid of [{ waitMs: 0 }, { waitMs: 1.5 }, { memoryBytes: -1 }, { safetyTokens: 0 }, { database: "relative.sqlite" }, { fakeSummarizer: false }]) {
      await expect(plugin.setup({ app: { version: "2.0.26" }, options: { ...options, ...invalid } } as any)).rejects.toThrow("CONFIG");
    }
    expect(await Bun.file(database).exists()).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("adapter cannot consume jobs from a database assigned to another trust scope", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-adapter-"));
  try {
    const database = join(root, "memory.sqlite"), store = new Store(database);
    new Engine(store).register("original", "trusted:scope", "stable"); store.close();
    await expect(plugin.setup({ app: { version: "2.0.26" }, options: { database, scopeId: "other:scope", fakeSummarizer: true } } as any)).rejects.toThrow("SCOPE_MISMATCH");
    const inspect = new Store(database);
    try { expect(inspect.get("sessions", "original")).toMatchObject({ scopeId: "trusted:scope" }); expect(inspect.get("settings", "adapterScope")).toBeUndefined(); }
    finally { inspect.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
