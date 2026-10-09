import { hash, insist, type Kind } from "../../core/types.ts";
export interface RawMessage { id: string; type: string; time: { created: number | string | Date; completed?: unknown }; [k: string]: unknown }
export interface Extracted { key: string; kind: Kind; payload: string; timestamp: string; callId?: string; truncated?: boolean }
// Provider state and hidden reasoning are deliberately excluded, including from hashes.
export function extract(message: RawMessage): Extracted[] {
  const timestamp = new Date(message.time.created).toISOString(), result: Extracted[] = [];
  const add = (suffix: string, kind: Kind, value: unknown, callId?: string) => result.push({ key: `${message.id}:${suffix}`, kind, payload: JSON.stringify(value), timestamp, ...(callId ? { callId } : {}) });
  if (message.type === "user") add("user", "user", { text: message.text, files: message.files ?? [], agents: message.agents, skills: message.skills });
  else if (message.type === "assistant") {
    insist(Array.isArray(message.content), "HOST_SHAPE", "Assistant content must be an array");
    for (const [i, part] of (message.content as Record<string, unknown>[]).entries()) {
      if (part.type === "text") add(`text:${i}`, "assistant", { text: part.text });
      else if (part.type === "tool") {
        const state = part.state as Record<string, unknown>;
        add(`call:${i}`, "tool_call", { name: part.name, input: state.input, status: state.status, executed: part.executed, time: part.time }, String(part.id));
        add(`result:${i}`, "tool_result", { status: state.status, content: state.content, error: state.error, metadata: state.metadata, executed: part.executed, time: part.time, incomplete: state.status !== "completed" && state.status !== "error" }, String(part.id));
        if ((state.metadata as Record<string, unknown> | undefined)?.truncated === true) result[result.length - 1]!.truncated = true;
      }
    }
    const report = { agent: message.agent, model: message.model, finish: message.finish, rawFinish: message.rawFinish, cost: message.cost, tokens: message.tokens, error: message.error, retry: message.retry, snapshot: message.snapshot };
    if (Object.values(report).some(v => v !== undefined)) add("report", "report", { ...report, time: message.time });
  } else if (message.type === "shell") add("shell", "report", { command: message.command, status: message.status, exit: message.exit, output: message.output });
  // Synthetic/native compaction/system/skill are not original user or tool evidence.
  return result;
}
export const fingerprint = (message: RawMessage) => hash(JSON.stringify(extract(message)));
export const contentFingerprint = (message: RawMessage) => hash(JSON.stringify(extract(message).map(({ key: _, ...record }) => record)));

// The checkpoint journal contains only public transcript fields, never provider state.
export function retainedMessage(message: RawMessage): RawMessage {
  const base = { id: message.id, type: message.type, time: message.time };
  if (message.type === "idle") return { ...base, outcome: message.outcome };
  if (message.type === "user") return { ...base, text: message.text, files: message.files, agents: message.agents, skills: message.skills };
  if (message.type === "assistant") return { ...base, agent: message.agent, model: message.model, finish: message.finish, rawFinish: message.rawFinish, cost: message.cost, tokens: message.tokens, error: message.error, retry: message.retry, snapshot: message.snapshot, content: (message.content as Record<string, unknown>[]).filter(p => p.type !== "reasoning").map(p => p.type === "tool" ? { type: p.type, id: p.id, name: p.name, state: p.state, executed: p.executed, time: p.time } : { type: p.type, text: p.text }) };
  if (message.type === "shell") return { ...base, command: message.command, status: message.status, exit: message.exit, output: message.output };
  return base;
}

export function liveSuffix<T extends { id?: string }>(messages: T[], activeIds: Set<string>): T[] {
  const first = messages.findIndex(m => m.id && activeIds.has(m.id));
  insist(first >= 0, "HOST_SHAPE", "Cannot identify the active transcript in the model request");
  const suffix = messages.slice(first);
  // Unidentified result messages stay adjacent to their calls. Never splice individual parts.
  return suffix;
}
