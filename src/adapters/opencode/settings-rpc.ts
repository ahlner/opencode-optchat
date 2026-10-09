import { Rpc } from "@opencode/plugin/rpc";

export interface Settings {
  enabled: boolean;
  database: string;
  scopeId: string;
  compactorModel?: { providerID: string; id: string };
  memoryBytes: number;
  safetyTokens: number;
  waitMs: number;
}
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    enabled: { type: "boolean" }, database: { type: "string", minLength: 1 }, scopeId: { type: "string", minLength: 1 },
    compactorModel: { type: "object", additionalProperties: false, properties: { providerID: { type: "string", minLength: 1 }, id: { type: "string", minLength: 1 } }, required: ["providerID", "id"] },
    memoryBytes: { type: "integer", minimum: 0 }, safetyTokens: { type: "integer", minimum: 256 }, waitMs: { type: "integer", minimum: 1, maximum: 300000 },
  }, required: ["enabled", "database", "scopeId", "memoryBytes", "safetyTokens", "waitMs"],
} as const;
export const SettingsRpc = Rpc.define({ id: "optchat.settings", methods: {
  read: { input: { type: "object", additionalProperties: false }, output: schema }, write: { input: schema, output: schema },
}, events: {} });
