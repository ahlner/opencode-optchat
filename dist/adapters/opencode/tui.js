// @bun
// src/adapters/opencode/tui.ts
import { Plugin } from "@opencode/plugin/tui";

// src/adapters/opencode/settings-rpc.ts
import { Rpc } from "@opencode/plugin/rpc";
var schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    database: { type: "string", minLength: 1 },
    scopeId: { type: "string", minLength: 1 },
    compactorModel: { type: "object", additionalProperties: false, properties: { providerID: { type: "string", minLength: 1 }, id: { type: "string", minLength: 1 } }, required: ["providerID", "id"] },
    memoryBytes: { type: "integer", minimum: 0 },
    safetyTokens: { type: "integer", minimum: 256 },
    waitMs: { type: "integer", minimum: 1, maximum: 300000 }
  },
  required: ["enabled", "database", "scopeId", "memoryBytes", "safetyTokens", "waitMs"]
};
var counts = { type: "integer", minimum: 0 };
var statusSchema = { type: "object", additionalProperties: false, properties: {
  enabled: { type: "boolean" },
  databaseExists: { type: "boolean" },
  sessions: counts,
  originals: counts,
  summaries: counts,
  publications: counts,
  activeTurns: counts,
  lastError: { type: "string" },
  jobs: {
    type: "object",
    additionalProperties: false,
    properties: { pending: counts, running: counts, expired: counts, failed: counts, done: counts, revoked: counts },
    required: ["pending", "running", "expired", "failed", "done", "revoked"]
  }
}, required: ["enabled", "databaseExists", "sessions", "originals", "summaries", "publications", "activeTurns", "jobs"] };
var SettingsRpc = Rpc.define({ id: "optchat.settings", methods: {
  read: { input: { type: "object", additionalProperties: false }, output: schema },
  write: { input: schema, output: schema },
  status: { input: { type: "object", additionalProperties: false }, output: statusSchema },
  retry: { input: { type: "object", additionalProperties: false }, output: statusSchema }
}, events: {} });

// src/adapters/opencode/tui-dialog.ts
function registerSettingsDialog(ctx) {
  const edit = async () => {
    const location = ctx.location ?? ctx.data.location.default();
    if (!location)
      throw new Error("Open a project before configuring OptChat");
    const rpc = ctx.client.rpc(SettingsRpc), options = { location };
    let draft = { ...await rpc.read({}, options) };
    for (;; ) {
      const field = await ctx.ui.dialog.select({ title: "OptChat settings", options: [
        { title: `Memory: ${draft.enabled ? "enabled" : "disabled"}`, value: "enabled" },
        { title: `Compactor: ${draft.compactorModel ? `${draft.compactorModel.providerID}/${draft.compactorModel.id}` : "select a model"}`, value: "model" },
        { title: `Memory budget: ${draft.memoryBytes} bytes`, value: "memoryBytes" },
        { title: `Safety reserve: ${draft.safetyTokens} tokens`, value: "safetyTokens" },
        { title: `Admission wait: ${draft.waitMs} milliseconds`, value: "waitMs" },
        { title: "Show project scope and database", value: "scope" },
        { title: "Show memory status", value: "status" },
        { title: "Retry failed compaction", value: "retry" },
        { title: "Save settings", value: "save" }
      ] });
      if (!field)
        return;
      if (field === "enabled")
        draft.enabled = !draft.enabled;
      else if (field === "model") {
        const models = (await ctx.client.model.list({ location })).data.filter((m) => m.enabled && m.limit.context && m.limit.output);
        const selected = await ctx.ui.dialog.select({ title: "Compactor model", options: models.map((m) => ({ title: `${m.providerID}/${m.id}`, value: JSON.stringify({ providerID: m.providerID, id: m.id }) })) });
        if (selected)
          draft.compactorModel = JSON.parse(selected);
      } else if (field === "scope")
        await ctx.ui.dialog.alert({ title: "Project memory", message: `Scope: ${draft.scopeId}
Database: ${draft.database}
This dialog cannot change the trust boundary.` });
      else if (field === "status") {
        const status = await rpc.status({}, options);
        await ctx.ui.dialog.alert({ title: "Memory status", message: `Adapter: ${status.enabled ? "enabled" : "disabled"}
Database: ${status.databaseExists ? "present" : "not created"}
Sessions: ${status.sessions}
Originals: ${status.originals}
Summaries: ${status.summaries}
Publications: ${status.publications}
Active turns: ${status.activeTurns}
Jobs: ${JSON.stringify(status.jobs)}
Last error: ${status.lastError ?? "none"}
Diagnostics: ${draft.database}.diagnostics.ndjson
Status does not certify summary accuracy.` });
      } else if (field === "retry") {
        if (await ctx.ui.dialog.confirm({ title: "Retry failed compaction?", message: "This requeues failed jobs and clears a background pause without deleting originals. Automatic preparation can incur model costs.", label: { confirm: "Retry", cancel: "Cancel" } })) {
          await rpc.retry({}, options);
          ctx.ui.toast.show({ message: "Failed jobs queued. Processing resumes on the next session reconciliation.", variant: "success" });
        }
      } else if (field === "save") {
        if (draft.enabled && !await ctx.ui.dialog.confirm({ title: "Enable project memory?", message: "OptChat retains public conversation data and sends it to the selected compactor. Model calls can incur costs.", label: { confirm: "Save", cancel: "Cancel" } }))
          continue;
        draft = await rpc.write(draft, options);
        ctx.ui.toast.show({ message: "OptChat settings saved", variant: "success" });
        return;
      } else {
        const text = await ctx.ui.dialog.prompt({ title: field, placeholder: String(draft[field]) });
        if (text !== undefined) {
          const value = Number(text);
          if (!text.trim() || !Number.isSafeInteger(value)) {
            await ctx.ui.dialog.alert({ title: "Invalid value", message: "Enter a whole number." });
            continue;
          }
          draft = { ...draft, [field]: value };
        }
      }
    }
  };
  ctx.keymap.layer(() => ({ mode: "global", commands: [{
    id: "optchat.settings",
    title: "OptChat settings",
    group: "OptChat",
    palette: true,
    slash: { name: "optchat-settings" },
    run: async () => {
      try {
        await edit();
      } catch (error) {
        await ctx.ui.dialog.alert({ title: "OptChat settings", message: String(error) });
      }
    }
  }] }));
}

// src/adapters/opencode/tui-status.ts
import { createElement, spread } from "@opentui/solid";
import { createSignal, onCleanup, onMount } from "solid-js";

// src/adapters/opencode/tui-status-model.ts
function statusIndicator(status) {
  if (!status.enabled)
    return { text: "OptChat: off", tone: "muted" };
  if (status.jobs.failed || status.jobs.expired)
    return { text: "OptChat: error", tone: "error" };
  if (status.jobs.running)
    return { text: `OptChat: processing ${status.jobs.running}`, tone: "warning" };
  if (status.jobs.pending && status.lastError === "BACKGROUND_PAUSED")
    return { text: "OptChat: paused", tone: "warning" };
  if (status.jobs.pending)
    return { text: `OptChat: queued ${status.jobs.pending}`, tone: "warning" };
  if (status.activeTurns)
    return { text: "OptChat: active", tone: "success" };
  return { text: "OptChat: ready", tone: "success" };
}
function createStatusReader(options) {
  let disposed = false;
  let pending = false;
  let controller;
  return {
    async refresh() {
      if (disposed || pending)
        return;
      const location = options.location();
      if (!location) {
        options.update({ text: "OptChat: unavailable", tone: "muted" });
        return;
      }
      const key = JSON.stringify(location);
      pending = true;
      controller = new AbortController;
      const timeout = setTimeout(() => controller?.abort(), 4000);
      try {
        const status = await options.read(location, controller.signal);
        if (!disposed && key === JSON.stringify(options.location()))
          options.update(statusIndicator(status));
      } catch {
        if (!disposed && key === JSON.stringify(options.location())) {
          options.update({ text: "OptChat: unavailable", tone: "muted" });
        }
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    },
    dispose() {
      disposed = true;
      controller?.abort();
    }
  };
}

// src/adapters/opencode/tui-status.ts
function registerStatusBar(ctx) {
  const rpc = ctx.client.rpc(SettingsRpc);
  const cleanups = new Set;
  const render = () => {
    const [indicator, setIndicator] = createSignal({ text: "OptChat: checking", tone: "muted" });
    const reader = createStatusReader({
      location: () => ctx.location ?? ctx.data.location.default(),
      read: async (location, signal) => await rpc.status({}, { location, signal }),
      update: setIndicator
    });
    let timer;
    const cleanup = () => {
      clearInterval(timer);
      reader.dispose();
      cleanups.delete(cleanup);
    };
    cleanups.add(cleanup);
    onMount(() => {
      reader.refresh();
      timer = setInterval(() => void reader.refresh(), 5000);
    });
    onCleanup(cleanup);
    const text = createElement("text");
    spread(text, {
      get fg() {
        const theme = ctx.theme;
        const tone = indicator().tone;
        return tone === "muted" ? theme.text.muted : theme.text.feedback[tone].base;
      },
      get children() {
        return ` ${indicator().text} `;
      }
    });
    return text;
  };
  const removeHome = ctx.ui.slot({ append: "home.footer.status", render });
  let removePrompt;
  try {
    removePrompt = ctx.ui.slot({ append: "prompt.footer.status", render });
  } catch (error) {
    removeHome();
    throw error;
  }
  return () => {
    for (const cleanup of cleanups)
      cleanup();
    removePrompt();
    removeHome();
  };
}

// src/adapters/opencode/tui.ts
var tui_default = Plugin.define({ id: "optchat.settings", setup(ctx) {
  registerSettingsDialog(ctx);
  return registerStatusBar(ctx);
} });
export {
  tui_default as default
};

//# debugId=806A894E6B19024164756E2164756E21
