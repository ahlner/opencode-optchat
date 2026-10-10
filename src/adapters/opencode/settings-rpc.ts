import { Rpc } from "@opencode/plugin/rpc";

export interface Settings {
  enabled: boolean;
  database: string;
  compactorModel?: { providerID: string; id: string };
  memoryBytes: number;
  safetyTokens: number;
  waitMs: number;
  captureContent?: boolean;
  summaryAcceptBytes?: number;
}
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    summaryAcceptBytes: { type: "integer", minimum: 512, maximum: Number.MAX_SAFE_INTEGER },
    enabled: { type: "boolean" }, captureContent: { type: "boolean" }, database: { type: "string", minLength: 1 },
    compactorModel: { type: "object", additionalProperties: false, properties: { providerID: { type: "string", minLength: 1 }, id: { type: "string", minLength: 1 } }, required: ["providerID", "id"] },
    memoryBytes: { type: "integer", minimum: 0 }, safetyTokens: { type: "integer", minimum: 256 }, waitMs: { type: "integer", minimum: 1, maximum: 300000 },
  }, required: ["enabled", "database", "memoryBytes", "safetyTokens", "waitMs"],
} as const;
const counts = { type: "integer", minimum: 0 } as const;
const statusSchema = { type: "object", additionalProperties: false, properties: {
  jobError: { type: "string" }, retryInSeconds: counts, retryAttempt: counts,
  enabled: { type: "boolean" }, databaseExists: { type: "boolean" }, sessions: counts, originals: counts, summaries: counts,
  publications: counts, activeTurns: counts, nativeTurns: counts, remainingMessages: counts, totalMessages: counts, processedMessages: counts, inventoryComplete: { type: "boolean" }, lastError: { type: "string" }, jobs: { type: "object", additionalProperties: false,
    properties: { pending: counts, running: counts, expired: counts, failed: counts, done: counts, revoked: counts },
    required: ["pending", "running", "expired", "failed", "done", "revoked"] },
}, required: ["enabled", "databaseExists", "sessions", "originals", "summaries", "publications", "activeTurns", "jobs"] } as const;
const candidateSchema = { type: "object", additionalProperties: false, properties: {
  database: { type: "string", minLength: 1 }, scopeId: { type: "string", minLength: 1 }, sessions: counts, publications: counts, modified: counts,
}, required: ["database", "scopeId", "sessions", "publications", "modified"] } as const;
export const SettingsRpc = Rpc.define({ id: "optchat.settings", methods: {
  read: { input: { type: "object", additionalProperties: false }, output: schema }, write: { input: schema, output: schema },
  status: { input: { type: "object", additionalProperties: false }, output: statusSchema },
  retry: { input: { type: "object", additionalProperties: false }, output: statusSchema },
  candidates: { input: { type: "object", additionalProperties: false }, output: { type: "array", items: candidateSchema } },
  adopt: { input: { type: "object", additionalProperties: false, properties: { database: { type: "string", minLength: 1 } }, required: ["database"] }, output: statusSchema },
}, events: {} });
