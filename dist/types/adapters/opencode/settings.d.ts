import type { Context, Cleanup } from "@opencode/plugin/promise/plugin";
export declare function setupSettings(ctx: Context, start: (ctx: Context) => Promise<Cleanup | void> | Cleanup | void): Promise<void | Cleanup>;
