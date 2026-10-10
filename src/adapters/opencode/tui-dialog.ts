import type { Context } from "@opencode/plugin/tui/plugin";
import { SettingsRpc, type Settings } from "./settings-rpc.ts";
import type { MemoryStatus } from "./settings-status.ts";
import { activityDetails } from "./tui-status-model.ts";

export function registerSettingsDialog(ctx: Context) {
  const edit = async () => {
    const location = ctx.location ?? ctx.data.location.default();
    if (!location) throw new Error("Open a project before configuring OptChat");
    const rpc = ctx.client.rpc(SettingsRpc), options = { location };
    let draft = { ...await rpc.read({}, options) as Settings };
    for (;;) {
      const field = await ctx.ui.dialog.select({ title: "OptChat settings", options: [
        { title: `Memory: ${draft.enabled ? "enabled" : "disabled"}`, value: "enabled" },
        { title: `Compactor: ${draft.compactorModel ? `${draft.compactorModel.providerID}/${draft.compactorModel.id}` : "select a model"}`, value: "model" },
        { title: `Memory budget: ${draft.memoryBytes} bytes`, value: "memoryBytes" },
        { title: `Safety reserve: ${draft.safetyTokens} tokens`, value: "safetyTokens" },
        { title: `Admission wait: ${draft.waitMs} milliseconds`, value: "waitMs" },
        { title: "Show project scope and database", value: "scope" },
        { title: "Show memory status", value: "status" },
         { title: "Retry failed compaction", value: "retry" },
         { title: `Capture compactor content: ${draft.captureContent ? "enabled" : "disabled"}`, value: "captureContent" },
         { title: `Summary size tolerance: ${draft.summaryAcceptBytes ?? 640} bytes`, value: "summaryAcceptBytes" },
        { title: "Save settings", value: "save" },
      ] });
      if (!field) return;
      if (field === "enabled") draft.enabled = !draft.enabled;
      else if (field === "captureContent") {
        if (draft.captureContent) draft.captureContent = false;
        else if (await ctx.ui.dialog.confirm({ title: "Capture private content?", message: "This saves complete compactor prompts and visible model responses locally. They can contain confidential conversation data or secrets. Disable capture after diagnosis.", label: { confirm: "Capture", cancel: "Cancel" } })) draft.captureContent = true;
      }
      else if (field === "model") {
        const models = (await ctx.client.model.list({ location })).data.filter(m => m.enabled && m.limit.context && m.limit.output);
        const selected = await ctx.ui.dialog.select({ title: "Compactor model", options: models.map(m => ({ title: `${m.providerID}/${m.id}`, value: JSON.stringify({ providerID: m.providerID, id: m.id }) })) });
        if (selected) draft.compactorModel = JSON.parse(selected);
      } else if (field === "scope") await ctx.ui.dialog.alert({ title: "Project memory", message: `Scope: ${draft.scopeId}\nDatabase: ${draft.database}\nContent log: ${draft.database}.content.ndjson\nThis dialog cannot change the trust boundary.` });
      else if (field === "status") {
        const status = await rpc.status({}, options) as MemoryStatus;
        await ctx.ui.dialog.alert({ title: "Memory status", message: `${activityDetails(status)}\nAdapter: ${status.enabled ? "enabled" : "disabled"}\nDatabase: ${status.databaseExists ? "present" : "not created"}\nSessions: ${status.sessions}\nOriginals: ${status.originals}\nSummaries: ${status.summaries}\nPublications: ${status.publications}\nActive memory turns: ${status.activeTurns}\nNative turn markers: ${status.nativeTurns ?? 0}\nJobs: ${JSON.stringify(status.jobs)}\nLast error: ${status.lastError ?? "none"}\nDiagnostics: ${draft.database}.diagnostics.ndjson\nCounts cover this database. Status does not certify summary accuracy.` });
      } else if (field === "retry") {
         if (await ctx.ui.dialog.confirm({ title: "Retry failed compaction?", message: "This requeues failed jobs and clears a background pause without deleting originals. Automatic preparation can incur model costs.", label: { confirm: "Retry", cancel: "Cancel" } })) {
          await rpc.retry({}, options); ctx.ui.toast.show({ message: "Failed jobs queued. Processing resumes on the next session reconciliation.", variant: "success" });
        }
      } else if (field === "save") {
        if (draft.enabled && !await ctx.ui.dialog.confirm({ title: "Enable project memory?", message: "OptChat retains public conversation data and sends it to the selected compactor. Model calls can incur costs.", label: { confirm: "Save", cancel: "Cancel" } })) continue;
        draft = await rpc.write(draft, options) as Settings;
        ctx.ui.toast.show({ message: "OptChat settings saved", variant: "success" }); return;
      } else {
        const text = await ctx.ui.dialog.prompt({ title: field, placeholder: String(field === "summaryAcceptBytes" ? draft.summaryAcceptBytes ?? 640 : draft[field as "memoryBytes" | "safetyTokens" | "waitMs"]) });
        if (text !== undefined) {
          const value = Number(text);
           if (!text.trim() || !Number.isSafeInteger(value)) { await ctx.ui.dialog.alert({ title: "Invalid value", message: "Enter a whole number." }); continue; }
           if (field === "summaryAcceptBytes" && value < 512) { await ctx.ui.dialog.alert({ title: "Invalid value", message: "Enter at least 512 bytes." }); continue; }
          draft = { ...draft, [field]: value };
        }
      }
    }
  };
  ctx.keymap.layer(() => ({ mode: "global", commands: [{ id: "optchat.settings", title: "OptChat settings", group: "OptChat", palette: true,
    slash: { name: "optchat-settings" }, run: async () => { try { await edit(); } catch (error) { await ctx.ui.dialog.alert({ title: "OptChat settings", message: String(error) }); } },
  }] }));
}
