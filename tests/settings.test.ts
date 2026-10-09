import { expect, test } from "bun:test";
import { setupSettings } from "../src/adapters/opencode/settings.ts";
import { Store, Engine } from "../src/index.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { registerSettingsDialog } from "../src/adapters/opencode/tui-dialog.ts";
import { memoryStatus } from "../src/adapters/opencode/settings-status.ts";

async function fixture() {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-settings-"));
  const database = join(root, "memory.sqlite");
  const initial = { enabled: false, database, scopeId: "test-scope", memoryBytes: 16000, safetyTokens: 2048, waitMs: 30000 };
  let saved: any = initial, handlers: any, starts = 0, stops = 0, disposed = 0, failStorage = false;
  const context: any = { app: { version: "2.0.26" }, location: { project: { id: "test-project" } }, options: {},
    storage: { get: async () => saved, set: async (_key: string, value: any) => { if (failStorage) throw new Error("storage failure"); saved = value; } },
    rpc: { register: async (_definition: any, value: any) => { handlers = value; return { dispose: async () => { disposed++; } }; } },
    session: { hook: async () => ({ dispose: async () => { disposed++; } }) },
    tool: { transform: async () => ({ dispose: async () => { disposed++; } }) },
    model: { list: async () => ({ data: [{ id: "model", providerID: "provider", enabled: true, limit: { context: 32000, output: 1024 } }] }) },
  };
  const start = async (ctx: any) => { starts++; await ctx.session.hook("context", () => {}); await ctx.tool.transform(() => {}); return () => { stops++; }; };
  const cleanup = await setupSettings(context, start);
  return { root, database, initial, handlers, context, cleanup, start, enable: { ...initial, enabled: true, compactorModel: { providerID: "provider", id: "model" } },
    counts: () => ({ starts, stops, disposed }), saved: () => saved, failStorage: () => { failStorage = true; } };
}

test("TUI settings start inactive, validate models, activate, persist, and dispose registrations", async () => {
  const f = await fixture();
  try {
    expect(f.counts().starts).toBe(0); expect(await Bun.file(f.database).exists()).toBe(false);
    expect(await f.handlers.read({})).toEqual(f.initial);
    for (const next of [{ ...f.enable, compactorModel: undefined }, { ...f.enable, compactorModel: { providerID: "provider", id: "missing" } }, { ...f.enable, memoryBytes: -1 }, { ...f.enable, waitMs: 0 }, { ...f.enable, safetyTokens: 0 }]) {
      await expect(f.handlers.write(next)).rejects.toThrow("CONFIG");
    }
    await expect(f.handlers.write({ ...f.enable, scopeId: "another" })).rejects.toThrow("SCOPE_LOCKED");
    await expect(f.handlers.write({ ...f.enable, database: join(f.root, "other.sqlite") })).rejects.toThrow("SCOPE_LOCKED");
    expect(await f.handlers.write(f.enable)).toEqual(f.enable); expect(f.saved()).toEqual(f.enable);
    expect(f.counts().starts).toBe(1);
    expect(await f.handlers.write({ ...f.enable, enabled: false })).toMatchObject({ enabled: false });
    expect(f.counts()).toEqual({ starts: 1, stops: 1, disposed: 2 });
    const restored = await setupSettings(f.context, f.start); expect(f.counts().starts).toBe(1); await restored?.();
  } finally { await f.cleanup?.(); await rm(f.root, { recursive: true, force: true }); }
});

test("settings reject active turns, retain memory on disable, and restore runtime after a failed save", async () => {
  const f = await fixture();
  try {
    await f.handlers.write(f.enable);
    const store = new Store(f.database), engine = new Engine(store);
    engine.register("session", "test-scope", "test-project"); engine.admit("session", "turn");
    await expect(f.handlers.write({ ...f.enable, enabled: false })).rejects.toThrow("SETTINGS_BUSY");
    expect(f.counts().stops).toBe(0); engine.finish("session", "turn", "completed"); store.close();
    f.failStorage(); await expect(f.handlers.write({ ...f.enable, memoryBytes: 8000 })).rejects.toThrow("storage failure");
    expect(await f.handlers.read({})).toEqual(f.enable); expect(f.counts().starts).toBe(3);
    const retained = new Store(f.database); expect(retained.all("turns")).toHaveLength(1); retained.close();
  } finally { await f.cleanup?.(); await rm(f.root, { recursive: true, force: true }); }
});

test("explicit JSON options remain authoritative instead of silently accepting TUI overrides", async () => {
  const f = await fixture();
  try {
    let handlers: any;
    const ctx = { ...f.context, options: f.enable, rpc: { register: async (_definition: any, value: any) => { handlers = value; return { dispose: async () => {} }; } } };
    const cleanup = await setupSettings(ctx, f.start);
    try { await expect(handlers.write(f.enable)).rejects.toThrow("CONFIG_MANAGED"); }
    finally { await cleanup?.(); }
  } finally { await f.cleanup?.(); await rm(f.root, { recursive: true, force: true }); }
});

test("a failed settings transport registration disposes an activated runtime", async () => {
  const f = await fixture();
  try {
    const ctx = { ...f.context, options: f.enable, rpc: { register: async () => { throw new Error("RPC registration failed"); } } };
    await expect(setupSettings(ctx, f.start)).rejects.toThrow("RPC registration failed");
    expect(f.counts()).toEqual({ starts: 1, stops: 1, disposed: 2 });
  } finally { await f.cleanup?.(); await rm(f.root, { recursive: true, force: true }); }
});

test("TUI command selects a model, confirms costs, and saves only to its current Location", async () => {
  const location = { directory: "/test/project" }, selections = ["model", JSON.stringify({ providerID: "provider", id: "model" }), "enabled", "memoryBytes", "save"];
  let command: any, saved: any, confirmed = 0; const calls: any[] = [], notices: any[] = [];
  registerSettingsDialog({ location, keymap: { layer: (factory: any) => { command = factory().commands[0]; } },
    client: { rpc: () => ({ read: async (_input: any, options: any) => { calls.push(options); return { enabled: false, database: "/private/memory.sqlite", scopeId: "project-scope", memoryBytes: 16000, safetyTokens: 2048, waitMs: 30000 }; }, write: async (value: any, options: any) => { calls.push(options); saved = value; return value; } }),
      model: { list: async (input: any) => { calls.push(input); return { data: [{ providerID: "provider", id: "model", enabled: true, limit: { context: 32000, output: 1024 } }] }; } } },
    ui: { dialog: { select: async () => selections.shift(), prompt: async () => "8000", confirm: async () => { confirmed++; return true; }, alert: async (value: any) => notices.push(value) }, toast: { show: (value: any) => notices.push(value) } },
  } as any);
  expect(command.palette).toBe(true); expect(command.slash.name).toBe("optchat-settings");
  await command.run(); expect(saved).toMatchObject({ enabled: true, compactorModel: { providerID: "provider", id: "model" }, memoryBytes: 8000 });
  expect(confirmed).toBe(1); expect(calls.every(c => c.location === location)).toBe(true);
  expect(notices).toEqual([{ message: "OptChat settings saved", variant: "success" }]);
});

test("closing the TUI dialog does not persist draft changes or make model calls", async () => {
  let command: any, writes = 0, calls = 0; const choices = ["enabled", undefined];
  registerSettingsDialog({ location: { directory: "/test" }, keymap: { layer: (factory: any) => { command = factory().commands[0]; } },
    client: { rpc: () => ({ read: async () => ({ enabled: false }), write: async () => { writes++; } }), model: { list: async () => { calls++; } } },
    ui: { dialog: { select: async () => choices.shift(), alert: async () => {} } },
  } as any);
  await command.run(); expect(writes).toBe(0); expect(calls).toBe(0);
});

test("status reports queue health without originals and retry preserves retained memory", async () => {
  const f = await fixture();
  try {
    expect(memoryStatus(f.database, false)).toMatchObject({ databaseExists: false, originals: 0 });
    expect(await Bun.file(f.database).exists()).toBe(false);
    const store = new Store(f.database), engine = new Engine(store);
    engine.register("session", "test-scope", "test-project"); engine.admit("session", "turn");
    engine.append({ sessionId: "session", generation: 0, eventKey: "evt", turnId: "turn", kind: "user", timestamp: new Date().toISOString(), projectId: "test-project", payload: "PRIVATE_STATUS_PAYLOAD" });
    await expect(f.handlers.retry({})).rejects.toThrow("SETTINGS_BUSY");
    engine.finish("session", "turn", "completed");
    store.db.query("UPDATE jobs SET status='failed',error='MemoryError: LEASE_LOST: Compactor lease expired'").run();
    store.set("adapterErrors", "session", { code: "COMPACTION_FAILED", timestamp: new Date().toISOString() });
    expect(await f.handlers.status({})).toMatchObject({ enabled: false, originals: 1, jobs: { failed: 1 }, lastError: "COMPACTION_FAILED" });
    expect(JSON.stringify(await f.handlers.status({}))).not.toContain("PRIVATE_STATUS_PAYLOAD");
    expect(await f.handlers.retry({})).toMatchObject({ originals: 1, jobs: { pending: 1, failed: 0 } });
    await engine.drain(); expect(memoryStatus(f.database, false).publications).toBe(1);
    expect(engine.sources("session", 0)[0].payload).toBe("PRIVATE_STATUS_PAYLOAD"); store.close();
  } finally { await f.cleanup?.(); await rm(f.root, { recursive: true, force: true }); }
});

test("the terminal status dialog reads health and confirms retries without saving settings", async () => {
  let command: any, retried = 0, alerts: any[] = [], confirmations = 0;
  const choices = ["status", "retry", undefined];
  registerSettingsDialog({ location: { directory: "/test" }, keymap: { layer: (factory: any) => { command = factory().commands[0]; } },
    client: { rpc: () => ({ read: async () => ({ enabled: false }), status: async () => ({ enabled: false, databaseExists: true, sessions: 2, originals: 9, summaries: 6, publications: 3, activeTurns: 0, jobs: { failed: 1 }, lastError: "COMPACTION_FAILED" }), retry: async () => { retried++; } }) },
    ui: { dialog: { select: async () => choices.shift(), alert: async (value: any) => { alerts.push(value); }, confirm: async () => { confirmations++; return true; } }, toast: { show: () => {} } },
  } as any);
  await command.run(); expect(alerts[0].message).toContain("Originals: 9"); expect(alerts[0].message).toContain("COMPACTION_FAILED");
  expect(retried).toBe(1); expect(confirmations).toBe(1);
});
