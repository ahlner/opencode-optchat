import { appendFileSync, closeSync, constants, fchmodSync, fstatSync, openSync, readFileSync, renameSync, statSync } from "node:fs";
import { MemoryError } from "../../core/types.ts";

// Keep this allowlist independent from provider errors and conversation payloads.
const fields = new Set(["operationId", "parentId", "sessionId", "eventType", "phase", "elapsedMs", "queueMs", "queued", "active", "driftMs", "jobId", "kind", "fence", "leaseUntil", "inputBytes", "outputBytes", "messages", "terminals", "records", "pending", "running", "expired", "failed", "done", "publications", "attempt", "delayMs", "errorCode", "aborted", "waitMs", "memoryBytes", "safetyTokens", "moduleHash", "boundary", "prefix", "expectedScopeHash", "actualScopeHash", "expectedProjectHash", "actualProjectHash"]);
export function diagnosticCode(error: unknown): string {
  if (error instanceof MemoryError) return /^[A-Z_]{1,64}$/.test(error.code) ? error.code : "MEMORY_ERROR";
  return error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? error.name : "ERROR";
}
export class Diagnostics {
  readonly path: string;
  private fd?: number;
  private sequence = 0;
  private closed = false;
  private spans = new Map<number, { phase: string; started: number; parentId?: number }>();
  private timer: ReturnType<typeof setInterval>;
  constructor(database: string, private counters: () => Record<string, number> = () => ({}), intervalMs = 5000, private maxBytes = 2 * 1024 * 1024) {
    this.path = `${database}.diagnostics.ndjson`;
    let previous = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      this.emit("heartbeat", { driftMs: Math.round(Math.max(0, now - previous - intervalMs)), active: this.spans.size, ...this.counts() });
      for (const [operationId, span] of this.spans) this.emit("waiting", { operationId, parentId: span.parentId, phase: span.phase, elapsedMs: Math.round(now - span.started) });
      previous = now;
    }, intervalMs);
    this.timer.unref();
    let moduleHash: string | undefined;
    try { moduleHash = new Bun.CryptoHasher("sha256").update(readFileSync(import.meta.path)).digest("hex"); } catch {}
    this.emit("runtime.start", { moduleHash });
  }
  private counts() { try { return this.counters(); } catch { return {}; } }
  emit(event: string, details: Record<string, unknown> = {}) {
    if (this.closed || !/^[a-z][a-z0-9._-]{0,63}$/.test(event)) return;
    const safe: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(details)) if (fields.has(field) && (typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 128)) safe[field] = value;
    // Logging must not change admission, job ownership, or model behavior.
    try {
      // Another runtime can rotate the same scope's log during a worktree move.
      if (this.fd !== undefined && fstatSync(this.fd).ino !== statSync(this.path).ino) { closeSync(this.fd); this.fd = undefined; }
      if (this.fd === undefined) { this.fd = openSync(this.path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600); fchmodSync(this.fd, 0o600); }
      if (fstatSync(this.fd).size >= this.maxBytes) { closeSync(this.fd); this.fd = undefined; renameSync(this.path, `${this.path}.1`); this.fd = openSync(this.path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600); }
      appendFileSync(this.fd, `${JSON.stringify({ time: new Date().toISOString(), runId: this.runId, pid: process.pid, event, ...safe })}\n`);
    } catch { if (this.fd !== undefined) { try { closeSync(this.fd); } catch {} this.fd = undefined; } }
  }
  private readonly runId = crypto.randomUUID();
  begin(phase: string, details: Record<string, unknown> = {}) {
    const operationId = ++this.sequence, started = performance.now();
    this.spans.set(operationId, { phase, started, parentId: typeof details.parentId === "number" ? details.parentId : undefined });
    this.emit("phase.start", { ...details, phase, operationId });
    return { operationId, end: (error?: unknown) => {
      if (!this.spans.delete(operationId)) return;
      this.emit("phase.end", { ...details, phase, operationId, elapsedMs: Math.round(performance.now() - started), ...(error === undefined ? {} : { errorCode: diagnosticCode(error) }) });
    } };
  }
  async span<T>(phase: string, work: () => Promise<T>, details: Record<string, unknown> = {}): Promise<T> {
    const span = this.begin(phase, details);
    try { const result = await work(); span.end(); return result; }
    catch (error) { span.end(error); throw error; }
  }
  close() {
    if (this.closed) return;
    this.emit("runtime.stop", { active: this.spans.size });
    this.closed = true; clearInterval(this.timer);
    if (this.fd !== undefined) { try { closeSync(this.fd); } catch {} this.fd = undefined; }
  }
}
