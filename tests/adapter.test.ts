import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import plugin from "../src/adapters/opencode/plugin.ts";
import { Store, Engine } from "../src/index.ts";
import { extract } from "../src/adapters/opencode/transcript.ts";

test("cancelled chunk work preserves durable progress and cannot release another worker's fence", async () => {
  const store = new Store(), controller = new AbortController();
  let calls = 0, finishLate!: (value: any) => void;
  const pending = new Promise<any>(resolve => { finishLate = resolve; });
  const engine = new Engine(store, { summarize: async () => ++calls === 1 ? { text: "Durable chunk.", model: "fixture", promptVersion: "fixture", fallback: false } : pending }, { chunkBytes: 2048 });
  try {
    engine.register("chunk-session", "scope", "project"); engine.admit("chunk-session", "past");
    engine.append({ sessionId: "chunk-session", generation: 0, projectId: "project", eventKey: "chunk", turnId: "past", kind: "tool_result", timestamp: "2026-10-09T00:00:00Z", payload: "COMPLETE_ORIGINAL".repeat(1000) });
    engine.finish("chunk-session", "past", "completed");
    const work = engine.workOne(controller.signal);
    while (calls < 2) await Bun.sleep(1);
    const reason = new Error("Operator cancelled preparation"); controller.abort(reason);
    await expect(work).rejects.toBe(reason);
    expect(store.db.query("SELECT status FROM jobs").all()).toEqual([{ status: "pending" }]);
    expect(store.db.query("SELECT id FROM nodes").all()).toHaveLength(1);
    const replacement = store.claim()!;
    expect(store.release({ ...replacement, fence: replacement.fence - 1 })).toBe(false);
    expect(store.owns(replacement)).toBe(true);
    finishLate({ text: "Cancelled chunk.", model: "fixture", promptVersion: "fixture", fallback: false }); await Bun.sleep(5);
    expect(store.db.query("SELECT id FROM nodes").all()).toHaveLength(1);
    expect(engine.sources("chunk-session", 0)[0]!.payload).toBe("COMPLETE_ORIGINAL".repeat(1000));
    expect(store.release(replacement)).toBe(true);
    await new Engine(store, undefined, { chunkBytes: 2048 }).drain(); expect(store.all("publications")).toHaveLength(1);
  } finally { finishLate?.({ text: "Ignored.", model: "fixture", promptVersion: "fixture", fallback: false }); store.close(); }
});

test("cold history cancellation releases settings and discards a provider result that arrives after the deadline", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-cold-cancel-"));
  const database = join(root, "memory.sqlite"), hooks: Record<string, any> = {};
  let rpc: Record<string, any> = {}, calls = 0, fast = false, signal: AbortSignal | undefined;
  let finishLate!: (value: { text: string }) => void;
  const late = new Promise<{ text: string }>(resolve => { finishLate = resolve; });
  const history = Array.from({ length: 24 }, (_, i) => [
    { id: `past-${i}`, type: "user", time: { created: i * 2 + 1 }, text: `HISTORICAL_EVIDENCE_${i}` },
    { id: `idle-${i}`, type: "idle", time: { created: i * 2 + 2 }, outcome: "succeeded" },
  ]).flat();
  let cleanup: (() => Promise<void>) | undefined;
  try {
    cleanup = await plugin.setup({ app: { version: "2.0.26" }, location: { directory: root, project: { id: "stable" } },
      options: { database, scopeId: "cold", compactorModel: { providerID: "fixture", id: "fixture" }, waitMs: 80 },
      storage: { get: async () => undefined, set: async () => {} }, rpc: { register: async (_: any, handlers: any) => { rpc = handlers; return { dispose: async () => {} }; } },
      session: { hook: async (name: string, callback: any) => { hooks[name] = callback; return { dispose: async () => {} }; },
        get: async () => ({ projectID: "stable", agent: "build", permissions: [], location: { directory: root } }),
        context: async () => [...history, { id: "current", type: "user", time: { created: 100 }, text: "CURRENT" }] },
      agent: { get: async () => ({ data: { permissions: [] } }) }, model: { list: async () => ({ data: [{ id: "fixture", providerID: "fixture", limit: { context: 131072, output: 1024 } }] }) },
      generate: { text: async (_: any, options: any) => { calls++; signal = options.signal; return fast ? { text: "Historical evidence." } : late; } },
      tool: { transform: async (callback: any) => { callback({ add() {} }); return { dispose: async () => {} }; } }, event: { subscribe: async function* () {} },
    } as any) as typeof cleanup;
    const request = { sessionID: "cold-session", agent: "build", model: { providerID: "fixture", id: "fixture" }, options: {}, system: [], tools: {}, messages: [{ id: "current", role: "user", content: "CURRENT" }] };
    const system = request.system, messages = request.messages, started = performance.now();
    await expect(hooks.context(request)).rejects.toThrow("MEMORY_NOT_READY");
    expect(performance.now() - started).toBeLessThan(500); expect(signal?.aborted).toBe(true); expect(calls).toBe(1);
    expect(request.system).toBe(system); expect(request.messages).toBe(messages);
    // The native settings guard must not retain a request after its deadline.
    await rpc.retry({});
    const store = new Store(database);
    try {
      expect(store.db.query("SELECT status FROM jobs").all()).toEqual([{ status: "pending" }]);
      expect(new Engine(store).sources("cold-session", 0)).toHaveLength(1);
      finishLate({ text: "LATE_RESULT_MUST_NOT_COMMIT" }); await Bun.sleep(10);
      expect(store.db.query("SELECT id FROM nodes").all()).toEqual([]); expect(calls).toBe(1);
      fast = true; await hooks.context(request);
      expect(new Engine(store).sources("cold-session", 0)).toHaveLength(24);
      expect(store.all("publications")).toHaveLength(24);
      expect(JSON.stringify(store.db.query("SELECT value FROM nodes").all())).not.toContain("LATE_RESULT_MUST_NOT_COMMIT");
    } finally { store.close(); }
  } finally { finishLate({ text: "Ignored late result." }); await cleanup?.(); await rm(root, { recursive: true, force: true }); }
});

test("server-wide terminal events do not import unrelated Locations into a configured scope", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-event-scope-")); let reads = 0;
  try {
    const database = join(root, "memory.sqlite");
    const cleanup = await plugin.setup({ app: { version: "2.0.26" }, location: { directory: root }, options: { database, scopeId: "event-scope", fakeSummarizer: true }, session: { hook: async () => {}, get: async () => { reads++; throw new Error("Must not read unrelated history"); } }, tool: { transform: async (callback: any) => callback({ add() {} }) }, event: { subscribe: async function* () { yield { type: "session.execution.succeeded", location: { directory: "/unrelated" }, data: { sessionID: "foreign" } }; } } } as any);
    await cleanup?.(); const store = new Store(database);
    try { expect(reads).toBe(0); expect(store.all("sessions")).toEqual([]); expect(store.all("publications")).toEqual([]); } finally { store.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("adapter retries a transient rate limit and publishes without losing originals", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-rate-limit-"));
  let calls = 0;
  try {
    const database = join(root, "memory.sqlite");
    const cleanup = await plugin.setup({ app: { version: "2.0.26" }, location: { directory: root }, options: { database, scopeId: "retry-scope", compactorModel: { id: "fixture", providerID: "fixture" } },
      session: { hook: async () => {}, get: async () => ({ projectID: "stable", location: { directory: root }, agent: "build", permissions: [] }), context: async () => [{ id: "original", type: "user", time: { created: 1 }, text: "RETAINED_RETRY_EVIDENCE" }, { id: "idle", type: "idle", time: { created: 2 }, outcome: "succeeded" }] },
      agent: { get: async () => ({ data: { permissions: [] } }) }, model: { list: async () => ({ data: [{ id: "fixture", providerID: "fixture", limit: { context: 32000, output: 1024 } }] }) }, generate: { text: async () => { if (++calls === 1) throw new Error("Generate.UnavailableError: Rate limit exceeded. Retry after 1 seconds."); return { text: "Retained retry evidence." }; } }, tool: { transform: async (callback: any) => callback({ add() {} }) }, event: { subscribe: async function* () { yield { type: "session.execution.succeeded", location: { directory: root }, data: { sessionID: "retry-session" } }; } },
    } as any);
    await cleanup?.();
    const store = new Store(database);
    try {
      expect(calls).toBeGreaterThan(1);
      expect(store.all("publications")).toHaveLength(1);
      expect(store.db.query("SELECT id FROM jobs WHERE status='failed'").all()).toEqual([]);
      expect(JSON.stringify(new Engine(store).sources("retry-session", 0))).toContain("RETAINED_RETRY_EVIDENCE");
    } finally { store.close(); }
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

test("agent and lifecycle readiness events preserve history and admission resumes after another worker finishes", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-event-readiness-"));
  const database = join(root, "memory.sqlite"), store = new Store(database), engine = new Engine(store);
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const past = { id: "past", type: "user", time: { created: 1 }, text: "PRESERVED_ORIGINAL" }, record = extract(past)[0]!;
    engine.register("session", "u:p", "stable"); const originalSnapshot = engine.admit("session", "past").snapshot;
    engine.append({ sessionId: "session", generation: 0, projectId: "stable", eventKey: record.key, turnId: "past", kind: record.kind, timestamp: record.timestamp, payload: record.payload });
    engine.finish("session", "past", "completed"); const lease = store.claim(Date.now(), 100000)!;
    const hooks: Record<string, (event: any) => Promise<void>> = {};
    const raw = [past, { id: "idle-past", type: "idle", time: { created: 2 }, outcome: "succeeded" },
      { id: "second", type: "user", time: { created: 3 }, text: "SECOND_ORIGINAL" }, { id: "idle-second", type: "idle", time: { created: 4 }, outcome: "succeeded" },
      { id: "current", type: "user", time: { created: 5 }, text: "CURRENT" }];
    const context = (events: boolean) => ({ app: { version: "2.0.26" }, location: { directory: root }, options: { database, scopeId: "u:p", fakeSummarizer: true },
      session: { hook: async (name: string, callback: any) => { hooks[name] = callback; }, get: async () => ({ projectID: "stable", location: { directory: root }, agent: "build", permissions: [] }), context: async () => raw },
      agent: { get: async () => ({ data: { permissions: [] } }) }, model: { list: async () => ({ data: [{ id: "fixture", providerID: "fixture", limit: { context: 32000, output: 1024 } }] }) },
      tool: { transform: async (callback: any) => callback({ add() {} }) }, event: { subscribe: async function* () {
        if (events) for (const type of ["agent.updated", "session.permissions", "session.execution.succeeded"])
          yield { type, location: { directory: root }, data: { sessionID: "session" } };
      } },
    });
    cleanup = await plugin.setup(context(true) as any) as typeof cleanup; await cleanup?.(); cleanup = undefined;
    expect(engine.session("session")).toMatchObject({ generation: 0 });
    expect(engine.sources("session", 0)).toHaveLength(1); engine.validateSnapshot(originalSnapshot);
    expect(store.get("adapterErrors", "session")).toMatchObject({ code: "MEMORY_NOT_READY" });
    expect(store.db.query("SELECT status,fence FROM jobs WHERE id=?").get(lease.id)).toEqual({ status: "running", fence: lease.fence });
    store.db.query("UPDATE jobs SET status='pending' WHERE id=? AND fence=?").run(lease.id, lease.fence);
    cleanup = await plugin.setup(context(false) as any) as typeof cleanup;
    const request = { sessionID: "session", agent: "build", model: { id: "fixture", providerID: "fixture" }, options: {}, system: [], tools: {}, messages: [{ id: "current", role: "user", content: "CURRENT" }] };
    await hooks.context!(request);
    expect(engine.session("session").generation).toBe(0); expect(engine.sources("session", 0)).toHaveLength(2);
    expect(JSON.stringify(request.system)).toContain("PRESERVED_ORIGINAL"); expect(request.messages).toHaveLength(1);
    expect(store.get("adapterErrors", "session")).toBeUndefined();
  } finally { await cleanup?.(); store.close(); await rm(root, { recursive: true, force: true }); }
});

test("startup recovers only the known false readiness disable and repeated events preserve genuine disable reasons", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-disable-recovery-"));
  const database = join(root, "memory.sqlite"), store = new Store(database), engine = new Engine(store);
  try {
    engine.register("false-disable", "u:p", "stable"); engine.register("denied", "u:p", "stable"); engine.register("uncertain", "u:p", "stable");
    const reason = "MemoryError: SESSION_DISABLED: ".repeat(5) + "Agent policy reconciliation failed: MemoryError: MEMORY_NOT_READY: Own sealed records are not summarized yet";
    store.set("sessions", "false-disable", { ...engine.session("false-disable"), disabled: reason });
    engine.register("false-but-denied", "u:p", "stable");
    store.set("sessions", "false-but-denied", { ...engine.session("false-but-denied"), disabled: reason });
    store.set("sessions", "denied", { ...engine.session("denied"), disabled: "Memory read permission was revoked" });
    store.set("sessions", "uncertain", { ...engine.session("uncertain"), disabled: "CHECKPOINT_MISSING: Unknown original mapping" });
    const hooks: Record<string, (event: any) => Promise<void>> = {};
    const cleanup = await plugin.setup({ app: { version: "2.0.26" }, options: { database, scopeId: "u:p", fakeSummarizer: true },
      session: { hook: async (name: string, callback: any) => { hooks[name] = callback; }, get: async ({ sessionID }: any) => ({ projectID: "stable", location: { directory: root }, agent: "build", permissions: sessionID === "false-but-denied" ? [{ action: "optchat.read", resource: "u:p", effect: "deny" }] : [] }), context: async () => [] },
      agent: { get: async () => ({ data: { permissions: [] } }) }, tool: { transform: async (callback: any) => callback({ add() {} }) },
      event: { subscribe: async function* () { for (let i = 0; i < 5; i++) yield { type: "session.agent.selected", data: { sessionID: "uncertain" } }; } },
    } as any);
    try { await expect(hooks.context!({ sessionID: "false-but-denied", agent: "build" })).rejects.toThrow("Memory read permission was revoked"); }
    finally { await cleanup?.(); }
    expect(engine.session("false-disable").generation).toBe(0);
    expect(store.get<any>("sessions", "denied").disabled).toBe("Memory read permission was revoked");
    expect(store.get<any>("sessions", "uncertain").disabled).toBe("CHECKPOINT_MISSING: Unknown original mapping");
    expect(store.get<any>("sessions", "false-but-denied").disabled).toBe("Memory read permission was revoked");
  } finally { store.close(); await rm(root, { recursive: true, force: true }); }
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
