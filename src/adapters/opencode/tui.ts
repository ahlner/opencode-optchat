import { Plugin } from "@opencode/plugin/tui";
import { registerSettingsDialog } from "./tui-dialog.ts";

export default Plugin.define({ id: "optchat.settings", setup: registerSettingsDialog });
