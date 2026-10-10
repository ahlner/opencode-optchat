import { Store } from "../storage/store.ts";
import { abortable } from "./abort.ts";
import { chunks, FakeSummarizer, validSummary, type Summarizer } from "../compactor/summarizer.ts";
import { MemoryError, bytes, hash, insist, key, sessionTree, sharedTree, sourceKey, turnKey, type Job, type Node, type Outcome, type Publication, type Session, type Snapshot, type SourceInput, type SourceRecord, type Turn, type View } from "./types.ts";
import { rangeCover, validateCover } from "./tree.ts";
import { mergeView, project } from "./views.ts";

interface Scope { id: string; epoch: number; policy: number; highWater: number }
// Originals remain unchanged. Only the summarization projection omits routine audit overhead.
export function evidenceInput(record: SourceRecord): string {
  let payload: any; try { payload = JSON.parse(record.payload); } catch { return JSON.stringify({ kind: record.kind, payload: record.payload }); }
  if (record.kind === "report" && !payload.command && !payload.output) {
    const snapshot = payload.snapshot;
    return JSON.stringify({ kind: "audit", finish: payload.finish, error: payload.error, retry: payload.retry,
      snapshotChanged: snapshot?.start !== undefined && snapshot?.end !== undefined ? snapshot.start !== snapshot.end : undefined,
      changedFiles: snapshot?.files?.length ? snapshot.files : undefined });
  }
  if (record.kind === "tool_call") return JSON.stringify({ kind: record.kind, name: payload.name, input: payload.input, resultLocation: "Separate original tool_result record; this call is not evidence of an absent result" });
  if (record.kind === "tool_result") return JSON.stringify({ kind: record.kind, status: payload.status, content: payload.content, error: payload.error, metadata: payload.metadata, incomplete: payload.incomplete, truncated: record.truncated ?? false });
  return JSON.stringify({ kind: record.kind, payload });
}
const jobFailureCode = (error: unknown) => {
  if (error instanceof MemoryError && /^[A-Z_]{1,64}$/.test(error.code)) return error.code;
  const text = String(error ?? "");
  if (/SUMMARY_BATCH_INVALID/.test(text)) return "SUMMARY_BATCH_INVALID";
  return /LEASE_LOST/.test(text) ? "LEASE_LOST" : /512.*bytes|nonempty summary/i.test(text) ? "SUMMARY_SIZE" : /rate[ -]?limit|429/i.test(text) ? "RATE_LIMIT" : /unavailable|503/i.test(text) ? "PROVIDER_UNAVAILABLE" : /timeout|abort|deadline/i.test(text) ? "TIMEOUT" : "ERROR";
};
export interface EngineOptions { high: number; low: number; chunkBytes: number; leaseMs: number; broadcastSubagents: boolean; maxRunningJobs: number; parentBatchSize: number; compactEvidence: boolean; jobEvent?: (event: string, details: { jobId: string; kind: string; fence: number; leaseUntil: number; errorCode?: string; sourceId?: string; tree?: string; start?: number; count?: number; batchSize?: number }) => void }
const defaults: EngineOptions = { high: 16000, low: 12000, chunkBytes: 10000, leaseMs: 300000, broadcastSubagents: false, maxRunningJobs: Number.MAX_SAFE_INTEGER, parentBatchSize: 1, compactEvidence: false };
export class Engine {
  readonly options: EngineOptions;
  constructor(readonly store: Store, readonly summarizer: Summarizer = new FakeSummarizer(), options: Partial<EngineOptions> = {}) {
    this.options = { ...defaults, ...options };
    insist(Number.isSafeInteger(this.options.maxRunningJobs) && this.options.maxRunningJobs > 0, "CONFIG", "Job concurrency must be a positive integer");
    insist(Number.isSafeInteger(this.options.parentBatchSize) && this.options.parentBatchSize >= 1 && this.options.parentBatchSize <= 16, "CONFIG", "Parent batch size must be between 1 and 16");
    insist(this.options.low >= 0 && this.options.high > this.options.low && this.options.chunkBytes >= 2048 && Number.isSafeInteger(this.options.leaseMs) && this.options.leaseMs >= 3, "CONFIG", "Invalid compaction thresholds or lease duration");
  }
  scope(id: string): Scope {
    return this.store.get<Scope>("scopes", id) ?? { id, epoch: 0, policy: 0, highWater: 0 };
  }
  register(id: string, scopeId: string, projectId: string, parentId?: string): Session {
    return this.store.transaction(() => {
      const existing = this.store.get<Session>("sessions", id);
      if (existing) {
        insist(existing.scopeId === scopeId && existing.projectId === projectId, "SCOPE_MISMATCH", "Session cannot silently change scope");
        return existing;
      }
      const session: Session = { id, scopeId, projectId, generation: 0, ...(parentId ? { parentId, broadcast: this.options.broadcastSubagents } : {}) };
      this.store.set("sessions", id, session); this.store.set("scopes", scopeId, this.scope(scopeId));
      return session;
    });
  }
  session(id: string): Session {
    const s = this.store.get<Session>("sessions", id);
    insist(s, "UNKNOWN_SESSION", id); insist(!s.disabled, "SESSION_DISABLED", s.disabled ?? ""); return s;
  }
  sources(sessionId: string, generation: number): SourceRecord[] {
    return (this.store.db.query("SELECT value FROM sources WHERE session=? AND generation=? ORDER BY seq").all(sessionId, generation) as { value: string }[]).map(r => JSON.parse(r.value));
  }
  private sourceCount(sessionId: string, generation: number): number {
    return (this.store.db.query("SELECT count(*) AS n FROM sources WHERE session=? AND generation=?").get(sessionId, generation) as { n: number }).n;
  }
  source(id: string): SourceRecord {
    const row = this.store.db.query("SELECT value FROM sources WHERE id=?").get(id) as { value: string } | null;
    insist(row, "NOT_FOUND", "Source not retained"); return JSON.parse(row.value);
  }
  node(id: string): Node {
    const row = this.store.db.query("SELECT value FROM nodes WHERE id=?").get(id) as { value: string } | null;
    insist(row, "NOT_FOUND", "Node not retained"); return JSON.parse(row.value);
  }
  findNode(tree: string, start: number, count: number): Node | undefined {
    const row = this.store.db.query("SELECT value FROM nodes WHERE tree=? AND start=? AND count=?").get(tree, start, count) as { value: string } | null;
    return row ? JSON.parse(row.value) : undefined;
  }
  view(tree: string): View { return this.store.get<View>("views", tree) ?? { tree, revision: 0, prefix: 0, nodes: [], shrinking: false }; }
  preparationStatus(sessionId: string) {
    const session = this.session(sessionId), tree = sessionTree(sessionId, session.generation), scope = this.scope(session.scopeId);
    const rows = this.store.db.query("SELECT id,status,attempts,error,json_extract(input,'$.type') kind FROM jobs WHERE status IN ('pending','running','failed') AND (json_extract(input,'$.tree')=? OR json_extract(input,'$.tree')=? OR (json_extract(input,'$.type')='publication' AND json_extract(input,'$.scopeId')=?))").all(tree, sharedTree(scope.id, scope.epoch), scope.id) as { id: string; status: string; attempts: number; error: string | null; kind: string }[];
    const failed = rows.filter(r => r.status === "failed");
    return { boundary: this.sourceCount(sessionId, session.generation), prefix: this.view(tree).prefix,
      pending: rows.filter(r => r.status === "pending").length, running: rows.filter(r => r.status === "running").length, failed: failed.length,
      failures: failed.slice(0, 16).map(r => ({ jobId: r.id, kind: r.kind, attempt: r.attempts, errorCode: jobFailureCode(r.error) })) };
  }
  admit(sessionId: string, id: string): Turn {
    return this.store.transaction(() => {
      const session = this.session(sessionId), tk = key(sessionId, session.generation, id);
      const old = this.store.get<Turn>("turns", tk);
      if (old) { this.validateSnapshot(old.snapshot); return old; }
      insist(!this.store.all<Turn>("turns").some(t => t.sessionId === sessionId && t.generation === session.generation && !t.outcome), "TURN_ACTIVE", "Finish the existing turn before admitting another");
      const scope = this.scope(session.scopeId), boundary = this.sourceCount(sessionId, session.generation);
      insist(this.view(sessionTree(sessionId, session.generation)).prefix === boundary, "MEMORY_NOT_READY", "Own sealed records are not summarized yet");
      const snapshot: Snapshot = { id: hash(tk + key(scope)), scopeId: scope.id, epoch: scope.epoch, policy: scope.policy, highWater: scope.highWater, view: structuredClone(this.view(sharedTree(scope.id, scope.epoch))), sessionId, generation: session.generation, ownBoundary: boundary };
      const turn: Turn = { id, sessionId, generation: session.generation, start: boundary, snapshot };
      this.store.set("turns", tk, turn); this.store.set("snapshots", snapshot.id, snapshot); return turn;
    });
  }
  validateSnapshot(snapshot: Snapshot) {
    const scope = this.scope(snapshot.scopeId), session = this.session(snapshot.sessionId);
    insist(scope.epoch === snapshot.epoch && scope.policy === snapshot.policy && session.generation === snapshot.generation, "SNAPSHOT_REVOKED", "Retention, policy or generation changed");
    const registered = this.store.get<Snapshot>("snapshots", snapshot.id);
    insist(registered && JSON.stringify(registered) === JSON.stringify(snapshot), "SNAPSHOT_REVOKED", "Snapshot is unregistered or its admitted bounds were changed");
  }
  append(input: SourceInput): SourceRecord {
    return this.store.transaction(() => {
      const session = this.session(input.sessionId);
      insist(session.generation === input.generation && session.projectId === input.projectId, "GENERATION_MISMATCH", "Record does not belong to the current session generation/project");
      const existing = this.store.db.query("SELECT value FROM sources WHERE session=? AND generation=? AND eventKey=?").get(input.sessionId, input.generation, input.eventKey) as { value: string } | null;
      if (existing) {
        const record: SourceRecord = JSON.parse(existing.value);
        insist(hash(JSON.stringify(input)) === hash(JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k]) => k !== "seq" && k !== "payloadHash")))), "EVENT_CONFLICT", "Event key was reused with a changed payload");
        return record;
      }
      const turn = this.store.get<Turn>("turns", key(input.sessionId, input.generation, input.turnId));
      insist(turn && !turn.outcome, "TURN_CLOSED", "Records can only be sealed into an admitted active turn");
      const seq = this.sourceCount(input.sessionId, input.generation);
      const record: SourceRecord = { ...input, seq, payloadHash: hash(input.payload) }, id = sourceKey(record);
      this.store.db.query("INSERT INTO sources VALUES(?,?,?,?,?,?,?)").run(id, input.sessionId, input.generation, seq, input.eventKey, input.turnId, JSON.stringify(record));
      this.store.db.query("INSERT INTO source_fts VALUES(?,?)").run(id, input.payload);
      this.store.enqueue({ type: "leaf", tree: sessionTree(input.sessionId, input.generation), start: seq, source: id });
      return record;
    });
  }
  stage(input: SourceInput) {
    this.session(input.sessionId);
    this.store.set("staging", key(input.sessionId, input.generation, input.eventKey), input);
  }
  sealStaged(sessionId: string, generation: number, eventKey: string) {
    return this.store.transaction(() => {
      const id = key(sessionId, generation, eventKey), input = this.store.get<SourceInput>("staging", id);
      insist(input, "NOT_FOUND", "No staged record"); const record = this.append(input); this.store.remove("staging", id); return record;
    });
  }
  finish(sessionId: string, id: string, outcome: Outcome, completedAt = new Date().toISOString()): Turn {
    insist(Number.isFinite(Date.parse(completedAt)), "CONFIG", "Turn completion timestamp must be valid");
    return this.store.transaction(() => {
      const s = this.session(sessionId), tk = key(sessionId, s.generation, id), turn = this.store.get<Turn>("turns", tk);
      insist(turn, "UNKNOWN_TURN", id);
      if (turn.outcome) { insist(turn.outcome === outcome, "OUTCOME_CONFLICT", "Terminal outcome changed"); return turn; }
      insist(!this.store.all<SourceInput>("staging").some(r => r.sessionId === sessionId && r.generation === s.generation), "UNSEALED_RECORDS", "Finalize streamed content before finishing");
      turn.end = this.sourceCount(sessionId, s.generation); turn.outcome = outcome; turn.completedAt = new Date(completedAt).toISOString();
      if (s.broadcast === false) turn.inherited = true;
      this.store.set("turns", tk, turn); this.schedulePublications(); return turn;
    });
  }
  private schedulePublications() {
    for (const t of this.store.all<Turn>("turns")) {
      const s = this.store.get<Session>("sessions", t.sessionId);
      if (!s || s.disabled || s.broadcast === false || s.generation !== t.generation || t.inherited || !t.outcome || t.end === undefined || this.store.get("publicationsByTurn", turnKey(t))) continue;
      const cover = rangeCover(t.start, t.end).map(r => this.findNode(sessionTree(t.sessionId, t.generation), r.start, r.count));
      if (cover.some(n => !n)) continue;
      this.store.enqueue({ type: "publication", turnKey: turnKey(t), scopeId: s.scopeId, cover: cover.map(n => n!.id) });
    }
  }
  private writeNode(node: Node) {
    insist(node.bytes === bytes(node.text) && node.bytes <= 512 && !!node.text, "INVALID_SUMMARY", "Summary must be nonempty and at most 512 UTF-8 bytes");
    if (node.tree.startsWith('["session"') && node.children.length) {
      const children = node.children.map(id => this.node(id));
      node.evidenceStart = Math.min(node.evidenceStart ?? node.start, ...children.map(n => n.evidenceStart ?? n.start));
      node.evidenceEnd = Math.max(node.evidenceEnd ?? node.start + node.count, ...children.map(n => n.evidenceEnd ?? n.start + n.count));
    }
    this.store.db.query("INSERT OR IGNORE INTO nodes VALUES(?,?,?,?,?)").run(node.id, node.tree, node.start, node.count, JSON.stringify(node));
    if (node.tree.startsWith('["chunk"')) return;
    const span = node.count, siblingStart = node.start % (span * 2) === 0 ? node.start + span : node.start - span;
    const sibling = this.findNode(node.tree, siblingStart, span);
    if (sibling) {
      const start = Math.min(node.start, siblingStart), children = [node, sibling].sort((a, b) => a.start - b.start).map(n => n.id);
      this.store.enqueue({ type: "parent", tree: node.tree, start, count: span * 2, children });
    }
    let view = this.view(node.tree), changed = false;
    let leaf: Node | undefined;
    while ((leaf = this.findNode(node.tree, view.prefix, 1))) { view.nodes.push(leaf.id); view.prefix++; changed = true; }
    const merged = mergeView(view, id => this.node(id), (start, count) => this.findNode(node.tree, start, count), this.options.high, this.options.low);
    if (changed || JSON.stringify(merged.nodes) !== JSON.stringify(view.nodes) || merged.shrinking !== view.shrinking) {
      merged.revision++; this.store.set("views", node.tree, merged);
    }
    this.schedulePublications();
  }
  private async summarizeFull(text: string, job: Job, signal?: AbortSignal): Promise<{ text: string; model: string; promptVersion: string; fallback: boolean; inputs: string[] }> {
    let inputs: string[] = [], depth = 0, fallback = false;
    while (bytes(text) > this.options.chunkBytes) {
      const parts = chunks(text, this.options.chunkBytes), summaries: string[] = [], ids: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const tree = key("chunk", job.id, depth, i), existing = this.findNode(tree, 0, 1);
        if (existing) { summaries.push(existing.text); ids.push(existing.id); fallback ||= existing.fallback; continue; }
        signal?.throwIfAborted();
        const result = await abortable(() => this.summarizer.summarize(parts[i]!, signal), signal); fallback ||= result.fallback;
        const n: Node = { id: hash(key(tree, hash(parts[i]), result)), tree, start: 0, count: 1, children: [], inputs: [hash(parts[i])], ...result, bytes: bytes(result.text) };
        this.store.transaction(() => { insist(this.store.recoverLease(job, this.options.leaseMs, Date.now(), this.options.maxRunningJobs), "LEASE_LOST", "Another worker or retention change replaced this job"); this.writeNode(n); });
        summaries.push(n.text); ids.push(n.id);
      }
      text = summaries.join("\n"); inputs = ids; depth++;
    }
    const result = await abortable(() => this.summarizer.summarize(text, signal), signal);
    return { ...result, fallback: fallback || result.fallback, inputs };
  }
  private async workParentBatch(jobs: Job[], signal?: AbortSignal): Promise<boolean> {
    const report = (job: Job, event: string, error?: unknown) => { try { this.options.jobEvent?.(event, { jobId: job.id, kind: job.input.type, fence: job.fence, leaseUntil: job.leaseUntil, batchSize: jobs.length, ...(job.input.type === "parent" ? { tree: job.input.tree, start: job.input.start, count: job.input.count } : {}), ...(error === undefined ? {} : { errorCode: jobFailureCode(error) }) }); } catch {} };
    for (const job of jobs) report(job, "job.claim");
    report(jobs[0]!, "job.batch");
    const renewal = setInterval(() => { for (const job of jobs) { try { if (!this.store.renew(job, this.options.leaseMs)) report(job, "job.renew.unowned"); } catch { report(job, "job.renew.error"); } } }, Math.max(1, Math.floor(this.options.leaseMs / 3)));
    renewal.unref();
    try {
      const inputs = jobs.map(job => { insist(job.input.type === "parent", "JOB_SHAPE", "Only parent jobs can share a batch"); return this.parentInput(job.input.children); });
      const evidenceNodes = jobs.flatMap(job => job.input.type === "parent" ? job.input.children.map(id => this.node(id)) : []);
      const evidenceStart = Math.min(...evidenceNodes.map(node => node.evidenceStart ?? node.start));
      const evidenceEnd = Math.max(...evidenceNodes.map(node => node.evidenceEnd ?? node.start + node.count));
      const results = await abortable(() => this.summarizer.summarizeBatch!(inputs, signal, jobs.map(job => job.id)), signal);
      signal?.throwIfAborted();
      insist(results.length === jobs.length && results.every(r => r?.text?.trim() && bytes(r.text) <= 512), "SUMMARY_BATCH_INVALID", "Every parent requires a bounded summary");
      const committed: Job[] = [];
      this.store.transaction(() => {
        for (const [index, job] of jobs.entries()) {
          // Peer claims belong to one serialized provider request. Never accept a replaced fence.
          if (!this.store.recoverLease(job, this.options.leaseMs, Date.now(), Math.min(Number.MAX_SAFE_INTEGER, this.options.maxRunningJobs + jobs.length - 1))) { report(job, "job.unowned"); continue; }
          insist(job.input.type === "parent", "JOB_SHAPE", "Expected a parent job");
          job.input.children.forEach(id => this.node(id));
          const result = results[index]!;
          this.writeNode({ id: hash(key(job.id, result, evidenceStart, evidenceEnd)), tree: job.input.tree, start: job.input.start, count: job.input.count, children: job.input.children, inputs: [hash(inputs[index]!), hash(JSON.stringify(inputs))], evidenceStart, evidenceEnd, ...result, bytes: bytes(result.text) });
          this.store.db.query("UPDATE jobs SET status='done' WHERE id=? AND fence=?").run(job.id, job.fence);
          committed.push(job);
        }
      });
      for (const job of committed) report(job, "job.done");
    } catch (error) {
      for (const job of jobs) {
        if (signal?.aborted) { this.store.release(job); report(job, "job.release"); }
        else { this.store.fail(job, error); report(job, "job.failed", error); }
      }
      throw signal?.aborted ? signal.reason : error;
    } finally { clearInterval(renewal); }
    return true;
  }
  private parentInput(children: string[]): string {
    return children.map(id => {
      const node = this.node(id);
      if (this.options.compactEvidence && node.source) {
        const record = this.source(node.source);
        if (record.kind === "report") return evidenceInput(record);
        // Older lossless call leaves still contain executed/status audit flags.
        // Project those originals again without expanding a large summarized call.
        if (record.kind === "tool_call") {
          const projected = evidenceInput(record);
          if (node.model === "lossless-local" || bytes(projected) <= 512) return projected;
        }
      }
      return node.text;
    }).join("\n");
  }
  async workOne(signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted();
    const job = this.store.claim(Date.now(), this.options.leaseMs, this.options.maxRunningJobs);
    if (!job) return false;
    if (job.input.type === "parent" && this.summarizer.summarizeBatch && this.options.parentBatchSize > 1) {
      const input = job.input, tree = JSON.parse(input.tree);
      const row = tree[0] === "session" ? this.store.db.query("SELECT value FROM entities WHERE bucket='turns' AND json_extract(value,'$.sessionId')=? AND json_extract(value,'$.generation')=? AND json_extract(value,'$.end') IS NOT NULL AND json_extract(value,'$.start')<=? AND json_extract(value,'$.end')>=? LIMIT 1").get(tree[1], tree[2], input.start, input.start + input.count) as { value: string } | null : null;
      const turn = row ? JSON.parse(row.value) as Turn : undefined;
      const peers = turn ? this.store.claimParentPeers(job, this.options.parentBatchSize - 1, this.options.leaseMs, turn.start, turn.end!) : [];
      if (peers.length) return this.workParentBatch([job, ...peers], signal);
    }
    const report = (event: string, error?: unknown) => { try { this.options.jobEvent?.(event, { jobId: job.id, kind: job.input.type, fence: job.fence, leaseUntil: job.leaseUntil, ...(job.input.type === "leaf" ? { sourceId: job.input.source, tree: job.input.tree, start: job.input.start, count: 1 } : job.input.type === "parent" ? { tree: job.input.tree, start: job.input.start, count: job.input.count } : {}), ...(error === undefined ? {} : { errorCode: jobFailureCode(error) }) }); } catch {} };
    report("job.claim");
    const renewal = setInterval(() => {
      try { if (!this.store.renew(job, this.options.leaseMs)) report("job.renew.unowned"); }
      catch { report("job.renew.error"); /* The commit transaction checks the current fence again. */ }
    }, Math.max(1, Math.floor(this.options.leaseMs / 3)));
    renewal.unref();
    try {
      let text: string, tree: string, start: number, count: number, children: string[] = [], source: string | undefined;
      const input = job.input;
      if (input.type === "leaf") {
        const r = this.source(input.source); source = input.source; tree = input.tree; start = input.start; count = 1;
        text = this.options.compactEvidence ? evidenceInput(r) : JSON.stringify({ kind: r.kind, timestamp: r.timestamp, turnId: r.turnId, callId: r.callId, truncated: r.truncated ?? false, payload: r.payload });
      } else if (input.type === "parent") {
        tree = input.tree; start = input.start; count = input.count; children = input.children;
        text = this.parentInput(children);
      } else {
        const turn = this.store.get<Turn>("turns", input.turnKey);
        insist(turn?.outcome, "JOB_REVOKED", "Publication turn was retired");
        tree = ""; start = 0; count = 1; children = input.cover;
        text = JSON.stringify({ sessionId: turn.sessionId, generation: turn.generation, turnId: turn.id, outcome: turn.outcome, completedAt: turn.completedAt, historicalEvidence: children.map(id => this.node(id).text) });
      }
      const result = await this.summarizeFull(text, job, signal);
      signal?.throwIfAborted();
      this.store.transaction(() => {
        insist(this.store.recoverLease(job, this.options.leaseMs, Date.now(), this.options.maxRunningJobs), "LEASE_LOST", "Another worker or retention change replaced this job");
        const n: Node = { id: hash(key(job.id, result)), tree, start, count, children, source, ...result, inputs: [hash(text), ...result.inputs], bytes: bytes(result.text) };
        if (input.type === "publication") {
          const t = this.store.get<Turn>("turns", input.turnKey), s = t && this.session(t.sessionId);
          insist(t && s?.generation === t.generation && s.broadcast !== false && t.outcome && t.end !== undefined, "JOB_REVOKED", "Turn generation or its publication permission is no longer retained");
          if (!this.store.get("publicationsByTurn", input.turnKey)) {
            const scope = this.scope(input.scopeId), view = this.view(sharedTree(scope.id, scope.epoch));
            n.tree = view.tree; n.start = view.prefix;
            const pub: Publication = { id: hash(input.turnKey), scopeId: scope.id, publicationSeq: ++scope.highWater, sessionId: t.sessionId, generation: t.generation, turnId: t.id, start: t.start, end: t.end, outcome: t.outcome, completedAt: t.completedAt!, publishedAt: new Date().toISOString(), sourceCover: input.cover, nodeId: n.id };
            n.publicationId = pub.id;
            this.store.set("publications", pub.id, pub); this.store.set("publicationsByTurn", input.turnKey, pub.id); this.store.set("scopes", scope.id, scope);
            this.writeNode(n);
          }
        } else {
          if (input.type === "leaf") this.source(input.source);
          if (input.type === "parent") input.children.forEach(id => this.node(id));
          this.writeNode(n);
        }
        this.store.db.query("UPDATE jobs SET status='done' WHERE id=? AND fence=?").run(job.id, job.fence);
      });
      report("job.done");
    } catch (error) {
      // Losing ownership is coordination, not a failed model call. Never fail the replacement job.
      if (signal?.aborted) { this.store.release(job); report("job.release"); throw signal.reason; }
      if (!(error instanceof MemoryError && error.code === "LEASE_LOST")) { this.store.fail(job, error); report("job.failed", error); throw error; }
      report("job.unowned");
    }
    finally { clearInterval(renewal); }
    return true;
  }
  async drain(max = 100000, signal?: AbortSignal) {
    for (let i = 0; i < max; i++) if (!await this.workOne(signal)) return;
    throw new Error("Job drain exceeded its bound");
  }
  retryFailed() { this.store.db.query("UPDATE jobs SET status='pending',error=NULL WHERE status='failed'").run(); }
  recoverRejectedBatches(scopeId: string): number {
    return this.store.transaction(() => {
      const marker = key("batch-recovery", scopeId, "feedback-2");
      if (this.store.get("settings", marker)) return 0;
      let count = 0; const sessions = new Set<string>();
      for (const row of this.store.db.query("SELECT id,input FROM jobs WHERE status='failed' AND error LIKE 'MemoryError: SUMMARY_BATCH_INVALID:%'").all() as { id: string; input: string }[]) {
        const input = JSON.parse(row.input) as Job["input"];
        if (input.type !== "parent") continue;
        const [type, sessionId] = JSON.parse(input.tree);
        const session = this.store.get<Session>("sessions", sessionId);
        if (type !== "session" || session?.scopeId !== scopeId || session.disabled || input.tree !== sessionTree(sessionId, session.generation)) continue;
        this.store.db.query("UPDATE jobs SET status='pending',fence=fence+1,leaseUntil=0,error=NULL,ownerPid=NULL,ownerToken=NULL WHERE id=? AND status='failed'").run(row.id);
        count++; sessions.add(sessionId);
      }
      for (const id of sessions) if (!this.preparationStatus(id).failed && this.store.get<{ code: string }>("adapterErrors", id)?.code === "COMPACTION_FAILED") this.store.remove("adapterErrors", id);
      if (count) this.store.set("settings", marker, { recovered: count });
      return count;
    });
  }
  repairInvalidSummaries(scopeId: string): number {
    return this.store.transaction(() => {
      const nodes = (this.store.db.query("SELECT value FROM nodes").all() as { value: string }[]).map(r => JSON.parse(r.value) as Node);
      const belongs = (n: Node) => { const tree = JSON.parse(n.tree); return tree[0] === "shared" ? tree[1] === scopeId : tree[0] === "session" && this.store.get<Session>("sessions", tree[1])?.scopeId === scopeId; };
      const bad = new Set(nodes.filter(n => {
        if (!belongs(n) || ["lossless-local", "deterministic-fixture"].includes(n.model)) return false;
        if (!validSummary(n.text, "")) return true;
        if (!n.tree.startsWith('["session"') || validSummary(n.text, "tool_call")) return false;
        const [, sessionId, generation] = JSON.parse(n.tree);
        return !!this.store.db.query("SELECT 1 FROM sources WHERE session=? AND generation=? AND seq>=? AND seq<? AND json_extract(value,'$.kind')='tool_call' LIMIT 1").get(sessionId, generation, n.evidenceStart ?? n.start, n.evidenceEnd ?? n.start + n.count);
      }).map(n => n.id));
      if (!bad.size) return 0;
      let changed = true;
      while (changed) { changed = false; for (const n of nodes) if (!bad.has(n.id) && [...n.children, ...n.inputs].some(id => bad.has(id))) { bad.add(n.id); changed = true; } }
      const scope = this.scope(scopeId), oldTree = sharedTree(scopeId, scope.epoch);
      const publications = this.store.all<Publication>("publications").filter(p => p.scopeId === scopeId);
      const retired = publications.filter(p => bad.has(p.nodeId) || p.sourceCover.some(id => bad.has(id)));
      const retained = publications.filter(p => !retired.includes(p)).sort((a, b) => a.publicationSeq - b.publicationSeq).map(p => ({ p, n: this.node(p.nodeId) }));
      const ranges = new Set(nodes.filter(n => bad.has(n.id)).map(n => key(n.tree, n.start, n.count)));
      for (const row of this.store.db.query("SELECT id,input FROM jobs").all() as { id: string; input: string }[]) {
        const input = JSON.parse(row.input) as Job["input"];
        const dependencyChanged = input.type === "parent" ? input.children.some(id => bad.has(id)) : input.type === "publication" && input.cover.some(id => bad.has(id));
        const rebuild = dependencyChanged || (input.type === "publication" ? retired.some(p => key(p.sessionId, p.generation, p.turnId) === input.turnKey)
          : ranges.has(key(input.tree, input.start, input.type === "leaf" ? 1 : input.count)));
        if (rebuild) {
          this.store.db.query("UPDATE jobs SET status=?,fence=fence+1,leaseUntil=0,error=NULL WHERE id=?").run(dependencyChanged ? "revoked" : "pending", row.id);
          this.store.db.query("DELETE FROM nodes WHERE tree LIKE ?").run(`["chunk","${row.id}",%`);
        } else if (input.type === "parent" && input.tree === oldTree) this.store.db.query("UPDATE jobs SET status='revoked',fence=fence+1 WHERE id=?").run(row.id);
      }
      for (const p of retired) { this.store.remove("publications", p.id); this.store.remove("publicationsByTurn", key(p.sessionId, p.generation, p.turnId)); }
      for (const id of bad) this.store.db.query("DELETE FROM nodes WHERE id=?").run(id);
      this.store.db.query("DELETE FROM nodes WHERE tree=?").run(oldTree); this.store.remove("views", oldTree);
      for (const snap of this.store.all<Snapshot>("snapshots")) if (snap.scopeId === scopeId) this.store.remove("snapshots", snap.id);
      scope.epoch++; this.store.set("scopes", scope.id, scope);
      const trees = new Set(nodes.filter(n => bad.has(n.id) && n.tree !== oldTree && belongs(n)).map(n => n.tree));
      for (const tree of trees) {
        const revision = this.view(tree).revision + 1;
        this.store.set("views", tree, { tree, revision, prefix: 0, nodes: [], shrinking: false });
        for (const n of nodes.filter(n => n.tree === tree && !bad.has(n.id)).sort((a, b) => a.count - b.count || a.start - b.start)) this.writeNode(n);
      }
      for (const { p, n } of retained) {
        const tree = sharedTree(scope.id, scope.epoch), rebuilt = { ...n, id: hash(key(n.id, tree)), tree, start: this.view(tree).prefix };
        p.nodeId = rebuilt.id; this.store.set("publications", p.id, p); this.writeNode(rebuilt);
      }
      this.schedulePublications();
      return bad.size;
    });
  }
  markInherited(sessionId: string, id: string) {
    const s = this.session(sessionId), tk = key(sessionId, s.generation, id);
    const turn = this.store.get<Turn>("turns", tk);
    insist(turn && !turn.outcome, "TURN_CLOSED", "Mark inherited history before sealing its boundary");
    turn.inherited = true; this.store.set("turns", tk, turn);
  }
  projection(view: View, budget: number): Node[] {
    return project(view, id => this.node(id), (start, count) => this.findNode(view.tree, start, count), budget);
  }
  ownView(snapshot: Snapshot): View {
    this.validateSnapshot(snapshot);
    const tree = sessionTree(snapshot.sessionId, snapshot.generation);
    const cover = rangeCover(0, snapshot.ownBoundary).map(r => this.findNode(tree, r.start, r.count));
    insist(cover.every(Boolean), "MEMORY_NOT_READY", "Own history has missing durable summaries");
    return { tree, revision: 0, prefix: snapshot.ownBoundary, nodes: cover.map(n => n!.id), shrinking: false };
  }
  // Preserve only the unchanged prefix. All generation-bound IDs and snapshots change.
  retire(sessionId: string, mode: "edit" | "delete", preserve = 0, retainPublications = true) {
    this.store.transaction(() => {
      const session = this.session(sessionId), scope = this.scope(session.scopeId);
      const retiredSources = this.sources(sessionId, session.generation);
      insist(Number.isSafeInteger(preserve) && preserve >= 0 && preserve <= retiredSources.length && (mode !== "delete" || preserve === 0), "INVALID_BOUNDARY", "Invalid retirement prefix");
      const prefix = retiredSources.slice(0, preserve);
      const prefixNodes = (this.store.db.query("SELECT value FROM nodes WHERE tree=? ORDER BY count,start").all(sessionTree(sessionId, session.generation)) as { value: string }[]).map(r => JSON.parse(r.value) as Node).filter(n => (n.evidenceEnd ?? n.start + n.count) <= preserve);
      const prefixTurns = this.store.all<Turn>("turns").filter(t => t.sessionId === sessionId && t.generation === session.generation && t.start < preserve);
      for (const checkpoint of this.store.all<{ id: string; sessionId: string }>("checkpoints")) if (checkpoint.sessionId === sessionId) this.store.remove("checkpoints", checkpoint.id);
      this.store.remove("adapterErrors", sessionId);
      for (const row of this.store.db.query("SELECT id,value FROM entities WHERE bucket='checkpointAliases'").all() as { id: string; value: string }[]) if (JSON.parse(row.value).sessionId === sessionId) this.store.remove("checkpointAliases", row.id);
      if (mode === "delete") {
        this.store.remove("forks", sessionId); this.store.remove("nativeActive", sessionId); this.store.remove("preparingSessions", sessionId);
      }
      const retained = this.store.all<Publication>("publications").filter(p => p.scopeId === scope.id && (p.sessionId !== sessionId || retainPublications && p.end <= preserve && preserve > 0)).sort((a, b) => a.publicationSeq - b.publicationSeq).map(p => ({ publication: p, node: this.node(p.nodeId) }));
      const retainedChunks = new Map<string, Node>();
      for (const n of [...prefixNodes, ...retained.map(r => r.node)]) for (const id of n.inputs) {
        const row = this.store.db.query("SELECT value FROM nodes WHERE id=?").get(id) as { value: string } | null;
        if (row) { const chunk = JSON.parse(row.value) as Node; if (chunk.tree.startsWith('["chunk"')) retainedChunks.set(id, chunk); }
      }
      for (const r of retiredSources) this.store.db.query("DELETE FROM source_fts WHERE id=?").run(sourceKey(r));
      this.store.db.query("DELETE FROM sources WHERE session=?").run(sessionId);
      for (const t of this.store.all<Turn>("turns")) if (t.sessionId === sessionId) this.store.remove("turns", turnKey(t));
      for (const p of this.store.all<Publication>("publications")) if (p.sessionId === sessionId) { this.store.remove("publications", p.id); this.store.remove("publicationsByTurn", key(p.sessionId, p.generation, p.turnId)); }
      for (const r of this.store.all<SourceInput>("staging")) if (r.sessionId === sessionId) this.store.remove("staging", key(r.sessionId, r.generation, r.eventKey));
      // Shared derived nodes and snapshots are scoped and revoked as one atomic epoch change.
      const oldTree = sharedTree(scope.id, scope.epoch);
      this.store.db.query("DELETE FROM nodes WHERE tree=? OR tree=?").run(oldTree, sessionTree(sessionId, session.generation));
      this.store.remove("views", oldTree); this.store.remove("views", sessionTree(sessionId, session.generation));
      for (const snap of this.store.all<Snapshot>("snapshots")) if (snap.scopeId === scope.id) this.store.remove("snapshots", snap.id);
      scope.epoch++; this.store.set("scopes", scope.id, scope);
      // Revoke only work that can derive from the affected session or shared epoch.
      for (const job of this.store.db.query("SELECT id,input FROM jobs").all() as { id: string; input: string }[]) {
        const input = JSON.parse(job.input);
        if (input.tree === oldTree || input.tree === sessionTree(sessionId, session.generation) || (input.type === "publication" && input.scopeId === scope.id)) {
          this.store.db.query("UPDATE jobs SET status='revoked',fence=fence+1,error=NULL WHERE id=?").run(job.id);
          this.store.db.query("DELETE FROM nodes WHERE tree LIKE ?").run(`["chunk","${job.id}",%`);
        }
      }
      if (mode === "delete") this.store.remove("sessions", sessionId);
      else { session.generation++; this.store.set("sessions", sessionId, session); }
      for (const chunk of retainedChunks.values()) this.writeNode(chunk);
      const mapped = new Map<string, string>();
      for (const r of prefix) {
        const copy = { ...r, generation: session.generation }, id = sourceKey(copy);
        this.store.db.query("INSERT INTO sources VALUES(?,?,?,?,?,?,?)").run(id, copy.sessionId, copy.generation, copy.seq, copy.eventKey, copy.turnId, JSON.stringify(copy));
        this.store.db.query("INSERT INTO source_fts VALUES(?,?)").run(id, copy.payload);
      }
      for (const n of prefixNodes) {
        const id = hash(key(n.id, session.generation)); mapped.set(n.id, id);
        this.writeNode({ ...n, id, tree: sessionTree(sessionId, session.generation), children: n.children.map(child => mapped.get(child)!), source: n.source ? sourceKey({ sessionId, generation: session.generation, seq: n.start }) : undefined });
      }
      for (const t of prefixTurns) {
        const copy: Turn = { ...t, generation: session.generation, end: Math.min(t.end ?? preserve, preserve), outcome: t.end !== undefined && t.end <= preserve ? t.outcome : "interrupted", inherited: t.inherited || !retainPublications || t.end === undefined || t.end > preserve };
        this.store.set("turns", turnKey(copy), copy);
      }
      for (let i = 0; i < retained.length; i++) {
        const { publication: p, node: oldNode } = retained[i];
        if (p.sessionId === sessionId) {
          p.generation = session.generation; p.id = hash(key(p.sessionId, p.generation, p.turnId));
          p.sourceCover = p.sourceCover.map(id => mapped.get(id)!);
          this.store.set("publicationsByTurn", key(p.sessionId, p.generation, p.turnId), p.id);
        }
        const cover = p.sourceCover.map(id => this.node(id)); validateCover(cover, p.start, p.end);
        const n: Node = { ...oldNode, id: hash(key(oldNode.id, scope.epoch)), tree: sharedTree(scope.id, scope.epoch), start: i, children: p.sourceCover, publicationId: p.id };
        p.nodeId = n.id; this.store.set("publications", p.id, p); this.writeNode(n);
      }
      this.schedulePublications();
      for (const s of this.store.all<Session>("sessions")) for (const r of this.sources(s.id, s.generation)) {
        if (!this.findNode(sessionTree(s.id, s.generation), r.seq, 1)) {
          const jobId = this.store.enqueue({ type: "leaf", tree: sessionTree(s.id, s.generation), start: r.seq, source: sourceKey(r) });
          this.store.db.query("UPDATE jobs SET status='pending' WHERE id=? AND status='revoked'").run(jobId);
        }
      }
      // Unpublished retained turns can safely retry in the new retention epoch.
      for (const job of this.store.db.query("SELECT id,input FROM jobs WHERE status IN ('done','revoked')").all() as { id: string; input: string }[]) {
        const input = JSON.parse(job.input);
        if (input.type === "publication" && this.store.get("turns", input.turnKey) && !this.store.get("publicationsByTurn", input.turnKey)) this.store.db.query("UPDATE jobs SET status='pending' WHERE id=?").run(job.id);
      }
    });
  }
}
