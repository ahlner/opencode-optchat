import { Plugin } from "@opencode/plugin/tui";
import { registerSettingsDialog } from "./tui-dialog.ts";

import { registerStatusBar } from "./tui-status.ts";

export default Plugin.define({ id: "optchat.settings", setup(ctx) {
  registerSettingsDialog(ctx);
  return registerStatusBar(ctx);
} });
