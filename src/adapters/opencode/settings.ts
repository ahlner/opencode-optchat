import type { Context, Cleanup } from "@opencode/plugin/promise/plugin";
import { homedir } from "node:os";
import { join, isAbsolute } from "node:path";
import { Store, insist, type Turn } from "../../index.ts";
import { SettingsRpc, type Settings } from "./settings-rpc.ts";
import { memoryStatus, retryMemoryJobs } from "./settings-status.ts";
import { automaticScope } from "./settings-scope.ts";
import { adoptMemory, memoryCandidates, memoryRoot } from "./adoption.ts";
import { defaultSummaryAcceptBytes, validateSummaryAcceptBytes } from "../../compactor/summarizer.ts";

export async function setupSettings(ctx: Context, start: (ctx: Context) => Promise<Cleanup | void> | Cleanup | void) {
  insist(ctx.app.version === "2.0.26", "UNSUPPORTED_HOST", "OptChat supports OpenCode 2.0.26 only");
  // Legacy programmatic contexts do not provide the settings transport.
  if (!ctx.rpc || !ctx.storage) return start(ctx);
  const explicit = Object.keys(ctx.options).length > 0;
  const scopeId = automaticScope(ctx.location.project.id, ctx.location.project.canonical);
  const identity = scopeId.slice("local:".length);
  const defaults: Settings = {
    enabled: false, database: join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "optchat", identity, "memory.sqlite"),
    memoryBytes: 16000, safetyTokens: 2048, waitMs: 30000, captureContent: false, summaryAcceptBytes: defaultSummaryAcceptBytes,
  };
  let settings = explicit ? { ...defaults, ...ctx.options, enabled: true } as Settings :
    { ...defaults, ...await ctx.storage.get("settings.v1") as Partial<Settings> };
  let cleanup: Cleanup | void, registrations: { dispose(): Promise<void> }[] = [];
  let tail = Promise.resolve(), closing = false, changing = false, activeRequests = 0, revision = 0;
  const serial = <T>(work: () => Promise<T>) => {
    const next = tail.then(work); tail = next.then(() => {}, () => {}); return next;
  };
  const stop = async () => {
    revision++;
    for (const registration of registrations.splice(0).reverse()) await registration.dispose();
    await cleanup?.(); cleanup = undefined;
  };
  const activate = async (value: Settings) => {
    if (!value.enabled) return;
    const currentRevision = ++revision;
    const guard = (callback: (...args: any[]) => any) => async (...args: any[]) => {
      insist(!changing && !closing && currentRevision === revision, "SETTINGS_BUSY", "Wait until OptChat settings finish changing");
      activeRequests++;
      try { return await callback(...args); } finally { activeRequests--; }
    };
    const capture = async (promise: Promise<any>) => { const registration = await promise; if (registration) registrations.push(registration); return registration; };
    const session = new Proxy(ctx.session, { get(target, name) {
      if (name === "hook") return (name: string, callback: (...args: any[]) => any, ...rest: any[]) => capture((target.hook as any)(name, guard(callback), ...rest));
      return Reflect.get(target, name);
    } });
    const tool = new Proxy(ctx.tool, { get(target, name) {
      if (name === "transform") return (callback: (editor: any) => void) => capture(target.transform(editor => callback(new Proxy(editor, { get(target, name) {
        if (name === "add") return (definition: any) => target.add({ ...definition, execute: guard(definition.execute) });
        return Reflect.get(target, name);
      } }))));
      return Reflect.get(target, name);
    } });
    const context = new Proxy(ctx, { get(target, name) {
      if (name === "options") return value;
      if (name === "session") return session;
      if (name === "tool") return tool;
      return Reflect.get(target, name);
    } });
    try { cleanup = await start(context); }
    catch (error) { await stop(); throw error; }
  };
  const validate = async (value: Settings) => {
    validateSummaryAcceptBytes(value.summaryAcceptBytes ?? defaultSummaryAcceptBytes);
    insist(value.captureContent === undefined || typeof value.captureContent === "boolean", "CONFIG", "Content capture must be a boolean");
    insist(isAbsolute(value.database), "CONFIG", "Use an absolute database path");
    insist(Number.isSafeInteger(value.memoryBytes) && value.memoryBytes >= 0 && Number.isSafeInteger(value.safetyTokens) && value.safetyTokens >= 256,
      "CONFIG", "Use valid memory and safety budgets");
    insist(Number.isSafeInteger(value.waitMs) && value.waitMs >= 1 && value.waitMs <= 300000, "CONFIG", "Use a wait between 1 and 300000 milliseconds");
    if (value.enabled) {
      insist(value.compactorModel || (value as any).fakeSummarizer, "CONFIG", "Select a compactor model");
      if (value.compactorModel) {
        const models = (await ctx.model.list({})).data;
        insist(models.some(m => m.enabled && m.providerID === value.compactorModel!.providerID && m.id === value.compactorModel!.id && m.limit.context && m.limit.output),
          "CONFIG", "Select an enabled model with known limits");
      }
    }
  };
  await activate(settings);
  const publicSettings = () => Object.fromEntries(["enabled", "database", "compactorModel", "memoryBytes", "safetyTokens", "waitMs", "captureContent", "summaryAcceptBytes"].filter(k => (settings as any)[k] !== undefined).map(k => [k, (settings as any)[k]]));
  let rpc;
  try { rpc = await ctx.rpc.register(SettingsRpc, {
    read: async () => publicSettings(),
    status: async () => memoryStatus(settings.database, settings.enabled),
    retry: async () => serial(async () => {
      insist(!closing && !changing && !activeRequests, "SETTINGS_BUSY", "Wait until active memory requests finish");
      retryMemoryJobs(settings.database);
      return memoryStatus(settings.database, settings.enabled);
    }),
    candidates: async () => memoryCandidates(memoryRoot(), settings.database),
    adopt: async input => serial(async () => {
      insist(!closing, "SETTINGS_CLOSED", "Settings are closing");
      insist(!explicit, "CONFIG_MANAGED", "Remove explicit plugin options before using TUI settings");
      insist(!changing && !activeRequests, "SETTINGS_BUSY", "Wait until active memory requests finish");
      const candidate = memoryCandidates(memoryRoot(), settings.database).find(c => c.database === (input as { database: string }).database);
      insist(candidate, "NOT_FOUND", "Select a listed memory database");
      changing = true;
      try { await stop(); adoptMemory(candidate!.database, settings.database, scopeId); await activate(settings); }
      finally { changing = false; }
      return memoryStatus(settings.database, settings.enabled);
    }),
    write: async input => serial(async () => {
      insist(!closing, "SETTINGS_CLOSED", "Settings are closing");
      insist(!explicit, "CONFIG_MANAGED", "Remove explicit plugin options before using TUI settings");
       const next = { summaryAcceptBytes: defaultSummaryAcceptBytes, ...input as Settings }; await validate(next);
      insist(next.database === settings.database, "SCOPE_LOCKED", "The project database cannot change in this dialog");
      insist(!activeRequests, "SETTINGS_BUSY", "Wait until active memory requests finish");
      changing = true;
      try {
      if (cleanup) {
        const store = new Store(settings.database);
        try { insist(store.all<Turn>("turns").every(t => t.outcome), "SETTINGS_BUSY", "Finish or interrupt active turns before changing settings"); }
        finally { store.close(); }
      }
      const previous = settings;
      await stop();
      try { await activate(next); await ctx.storage.set("settings.v1", JSON.parse(JSON.stringify(next))); settings = next; }
      catch (error) { await stop(); await activate(previous); throw error; }
      return publicSettings();
      } finally { changing = false; }
    }),
  }); } catch (error) { await stop(); throw error; }
  return async () => { closing = true; await rpc.dispose(); await tail; await stop(); };
}
