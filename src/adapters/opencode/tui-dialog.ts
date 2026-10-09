import type { Context } from "@opencode/plugin/tui/plugin";
import { SettingsRpc, type Settings } from "./settings-rpc.ts";

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
        { title: "Save settings", value: "save" },
      ] });
      if (!field) return;
      if (field === "enabled") draft.enabled = !draft.enabled;
      else if (field === "model") {
        const models = (await ctx.client.model.list({ location })).data.filter(m => m.enabled && m.limit.context && m.limit.output);
        const selected = await ctx.ui.dialog.select({ title: "Compactor model", options: models.map(m => ({ title: `${m.providerID}/${m.id}`, value: JSON.stringify({ providerID: m.providerID, id: m.id }) })) });
        if (selected) draft.compactorModel = JSON.parse(selected);
      } else if (field === "scope") await ctx.ui.dialog.alert({ title: "Project memory", message: `Scope: ${draft.scopeId}\nDatabase: ${draft.database}\nThis dialog cannot change the trust boundary.` });
      else if (field === "save") {
        if (draft.enabled && !await ctx.ui.dialog.confirm({ title: "Enable project memory?", message: "OptChat retains public conversation data and sends it to the selected compactor. Model calls can incur costs.", label: { confirm: "Save", cancel: "Cancel" } })) continue;
        draft = await rpc.write(draft, options) as Settings;
        ctx.ui.toast.show({ message: "OptChat settings saved", variant: "success" }); return;
      } else {
        const text = await ctx.ui.dialog.prompt({ title: field, placeholder: String(draft[field as "memoryBytes" | "safetyTokens" | "waitMs"]) });
        if (text !== undefined) {
          const value = Number(text);
          if (!text.trim() || !Number.isSafeInteger(value)) { await ctx.ui.dialog.alert({ title: "Invalid value", message: "Enter a whole number." }); continue; }
          draft = { ...draft, [field]: value };
        }
      }
    }
  };
  ctx.keymap.layer(() => ({ mode: "global", commands: [{ id: "optchat.settings", title: "OptChat settings", group: "OptChat", palette: true,
    slash: { name: "optchat-settings" }, run: async () => { try { await edit(); } catch (error) { await ctx.ui.dialog.alert({ title: "OptChat settings", message: String(error) }); } },
  }] }));
}
