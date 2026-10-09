import { Store } from "../storage/store.ts";
import { chunks, FakeSummarizer, type Summarizer } from "../compactor/summarizer.ts";
import { MemoryError, bytes, hash, insist, key, sessionTree, sharedTree, sourceKey, turnKey, type Job, type Node, type Outcome, type Publication, type Session, type Snapshot, type SourceInput, type SourceRecord, type Turn, type View } from "./types.ts";
import { rangeCover, validateCover } from "./tree.ts";
import { mergeView, project } from "./views.ts";

interface Scope { id: string; epoch: number; policy: number; highWater: number }
export interface EngineOptions { high: number; low: number; chunkBytes: number; leaseMs: number; broadcastSubagents: boolean }
const defaults: EngineOptions = { high: 16000, low: 12000, chunkBytes: 10000, leaseMs: 300000, broadcastSubagents: false };
export class Engine {
  readonly options: EngineOptions;
  constructor(readonly store: Store, readonly summarizer: Summarizer = new FakeSummarizer(), options: Partial<EngineOptions> = {}) {
    this.options = { ...defaults, ...options };
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
  private async summarizeFull(text: string, job: Job): Promise<{ text: string; model: string; promptVersion: string; fallback: boolean; inputs: string[] }> {
    let inputs: string[] = [], depth = 0, fallback = false;
    while (bytes(text) > this.options.chunkBytes) {
      const parts = chunks(text, this.options.chunkBytes), summaries: string[] = [], ids: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const tree = key("chunk", job.id, depth, i), existing = this.findNode(tree, 0, 1);
        if (existing) { summaries.push(existing.text); ids.push(existing.id); fallback ||= existing.fallback; continue; }
        const result = await this.summarizer.summarize(parts[i]); fallback ||= result.fallback;
        const n: Node = { id: hash(key(tree, hash(parts[i]), result)), tree, start: 0, count: 1, children: [], inputs: [hash(parts[i])], ...result, bytes: bytes(result.text) };
        this.store.transaction(() => { insist(this.store.recoverLease(job, this.options.leaseMs), "LEASE_LOST", "Another worker or retention change replaced this job"); this.writeNode(n); });
        summaries.push(n.text); ids.push(n.id);
      }
      text = summaries.join("\n"); inputs = ids; depth++;
    }
    const result = await this.summarizer.summarize(text);
    return { ...result, fallback: fallback || result.fallback, inputs };
  }
  async workOne(): Promise<boolean> {
    const job = this.store.claim(Date.now(), this.options.leaseMs);
    if (!job) return false;
    const renewal = setInterval(() => {
      try { this.store.renew(job, this.options.leaseMs); }
      catch { /* The commit transaction checks the current fence again. */ }
    }, Math.max(1, Math.floor(this.options.leaseMs / 3)));
    renewal.unref();
    try {
      let text: string, tree: string, start: number, count: number, children: string[] = [], source: string | undefined;
      const input = job.input;
      if (input.type === "leaf") {
        const r = this.source(input.source); source = input.source; tree = input.tree; start = input.start; count = 1;
        text = JSON.stringify({ kind: r.kind, timestamp: r.timestamp, turnId: r.turnId, callId: r.callId, truncated: r.truncated ?? false, payload: r.payload });
      } else if (input.type === "parent") {
        tree = input.tree; start = input.start; count = input.count; children = input.children;
        text = children.map(id => this.node(id).text).join("\n");
      } else {
        const turn = this.store.get<Turn>("turns", input.turnKey);
        insist(turn?.outcome, "JOB_REVOKED", "Publication turn was retired");
        tree = ""; start = 0; count = 1; children = input.cover;
        text = JSON.stringify({ sessionId: turn.sessionId, generation: turn.generation, turnId: turn.id, outcome: turn.outcome, completedAt: turn.completedAt, historicalEvidence: children.map(id => this.node(id).text) });
      }
      const result = await this.summarizeFull(text, job);
      this.store.transaction(() => {
        insist(this.store.recoverLease(job, this.options.leaseMs), "LEASE_LOST", "Another worker or retention change replaced this job");
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
    } catch (error) {
      // Losing ownership is coordination, not a failed model call. Never fail the replacement job.
      if (!(error instanceof MemoryError && error.code === "LEASE_LOST")) { this.store.fail(job, error); throw error; }
    }
    finally { clearInterval(renewal); }
    return true;
  }
  async drain(max = 100000) {
    for (let i = 0; i < max; i++) if (!await this.workOne()) return;
    throw new Error("Job drain exceeded its bound");
  }
  retryFailed() { this.store.db.query("UPDATE jobs SET status='pending',error=NULL WHERE status='failed'").run(); }
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
      const prefixNodes = (this.store.db.query("SELECT value FROM nodes WHERE tree=? ORDER BY count,start").all(sessionTree(sessionId, session.generation)) as { value: string }[]).map(r => JSON.parse(r.value) as Node).filter(n => n.start + n.count <= preserve);
      const prefixTurns = this.store.all<Turn>("turns").filter(t => t.sessionId === sessionId && t.generation === session.generation && t.start < preserve);
      for (const checkpoint of this.store.all<{ id: string; sessionId: string }>("checkpoints")) if (checkpoint.sessionId === sessionId) this.store.remove("checkpoints", checkpoint.id);
      this.store.remove("adapterErrors", sessionId);
      for (const row of this.store.db.query("SELECT id,value FROM entities WHERE bucket='checkpointAliases'").all() as { id: string; value: string }[]) if (JSON.parse(row.value).sessionId === sessionId) this.store.remove("checkpointAliases", row.id);
      if (mode === "delete") this.store.remove("forks", sessionId);
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
