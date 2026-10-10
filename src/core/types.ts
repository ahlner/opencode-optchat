export type Outcome = "completed" | "interrupted" | "failed";
export type Kind = "user" | "assistant" | "tool_call" | "tool_result" | "report";
export interface SourceInput {
  sessionId: string; generation: number; eventKey: string; turnId: string;
  kind: Kind; timestamp: string; payload: string; projectId: string;
  worktreeId?: string; commit?: string; callId?: string; truncated?: boolean;
  inheritedFrom?: { sessionId: string; generation: number; seq: number };
}
export interface SourceRecord extends SourceInput { seq: number; payloadHash: string }
export interface Session { id: string; scopeId: string; projectId: string; generation: number; disabled?: string; broadcast?: boolean; parentId?: string }
export interface Node {
  id: string; tree: string; start: number; count: number; text: string;
  inputs: string[]; children: string[]; source?: string; publicationId?: string;
  model: string; promptVersion: string; bytes: number; fallback: boolean;
  evidenceStart?: number; evidenceEnd?: number;
}
export interface Publication {
  id: string; scopeId: string; publicationSeq: number; sessionId: string;
  generation: number; turnId: string; start: number; end: number;
  outcome: Outcome; completedAt: string; publishedAt: string; sourceCover: string[]; nodeId: string;
}
export interface View { tree: string; revision: number; prefix: number; nodes: string[]; shrinking: boolean }
export interface Snapshot {
  id: string; scopeId: string; epoch: number; policy: number; highWater: number;
  view: View; sessionId: string; generation: number; ownBoundary: number;
}
export interface Turn { id: string; sessionId: string; generation: number; start: number; end?: number; outcome?: Outcome; completedAt?: string; snapshot: Snapshot; inherited?: boolean }
export type JobInput =
  | { type: "leaf"; tree: string; start: number; source: string }
  | { type: "parent"; tree: string; start: number; count: number; children: string[] }
  | { type: "publication"; turnKey: string; scopeId: string; cover: string[] };
export interface Job { id: string; input: JobInput; status: string; fence: number; leaseUntil: number; attempts: number }
export class MemoryError extends Error {
  constructor(public code: string, message: string) { super(`${code}: ${message}`); this.name = "MemoryError"; }
}
export function insist(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new MemoryError(code, message);
}
export const bytes = (text: string) => Buffer.byteLength(text, "utf8");
export const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
export const key = (...parts: unknown[]) => JSON.stringify(parts);
export const sessionTree = (sessionId: string, generation: number) => key("session", sessionId, generation);
export const sharedTree = (scope: string, epoch: number) => key("shared", scope, epoch);
export const sourceKey = (r: Pick<SourceRecord, "sessionId" | "generation" | "seq">) => key(r.sessionId, r.generation, r.seq);
export const turnKey = (t: Pick<Turn, "sessionId" | "generation" | "id">) => key(t.sessionId, t.generation, t.id);
