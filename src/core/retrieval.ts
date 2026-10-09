import { Engine } from "./engine.ts";
import { bytes, insist, type Node, type Snapshot, type SourceRecord } from "./types.ts";

export class Retrieval {
  constructor(readonly engine: Engine) {}
  private visible(snapshot: Snapshot, r: SourceRecord) {
    const e = this.engine;
    const s = e.store.get<{ scopeId: string; generation: number; disabled?: string }>("sessions", r.sessionId);
    if (!s || s.disabled || s.scopeId !== snapshot.scopeId || s.generation !== r.generation) return false;
    if (r.sessionId === snapshot.sessionId && r.generation === snapshot.generation && r.seq < snapshot.ownBoundary) return true;
    return !!e.store.db.query(`SELECT 1 FROM entities WHERE bucket='publications'
      AND json_extract(value,'$.scopeId')=? AND json_extract(value,'$.sessionId')=?
      AND json_extract(value,'$.generation')=? AND json_extract(value,'$.publicationSeq')<=?
      AND json_extract(value,'$.start')<=? AND json_extract(value,'$.end')>? LIMIT 1`).get(snapshot.scopeId, r.sessionId, r.generation, snapshot.highWater, r.seq, r.seq);
  }
  private authorized(snapshot: Snapshot, node: Node): boolean {
    // Immutable tree coordinates authorize a shared range without traversing the archive.
    if (node.tree === snapshot.view.tree) return node.start >= 0 && node.start + node.count <= snapshot.view.prefix;
    const [type, sessionId, generation] = JSON.parse(node.tree);
    if (type !== "session") return false;
    const s = this.engine.store.get<{ scopeId: string; generation: number; disabled?: string }>("sessions", sessionId);
    if (!s || s.disabled || s.scopeId !== snapshot.scopeId || s.generation !== generation) return false;
    if (sessionId === snapshot.sessionId && generation === snapshot.generation && node.start + node.count <= snapshot.ownBoundary) return true;
    // Foreign session ranges can span several published turns, but not an unpublished gap.
    return !this.engine.store.db.query(`SELECT 1 FROM sources s WHERE s.session=? AND s.generation=? AND s.seq>=? AND s.seq<?
      AND NOT EXISTS (SELECT 1 FROM entities p WHERE p.bucket='publications'
        AND json_extract(p.value,'$.scopeId')=? AND json_extract(p.value,'$.publicationSeq')<=?
        AND json_extract(p.value,'$.sessionId')=s.session AND json_extract(p.value,'$.generation')=s.generation
        AND s.seq>=json_extract(p.value,'$.start') AND s.seq<json_extract(p.value,'$.end')) LIMIT 1`).get(sessionId, generation, node.start, node.start + node.count, snapshot.scopeId, snapshot.highWater);
  }
  private sourceAllowed(snapshot: Snapshot, id: string) {
    this.engine.validateSnapshot(snapshot); const r = this.engine.source(id);
    insist(this.visible(snapshot, r), "NOT_VISIBLE", "Source is outside the admitted snapshot"); return r;
  }
  zoom(snapshot: Snapshot, id: string, offset = 0, limit = 32) {
    this.engine.validateSnapshot(snapshot);
    insist(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit) && limit > 0 && limit <= 128, "INVALID_PAGE", "Invalid zoom pagination");
    const node = this.engine.node(id);
    insist(this.authorized(snapshot, node), "NOT_VISIBLE", "Node is outside the admitted snapshot");
    if (node.source) return { sourceId: node.source, children: [], next: null };
    const ids = node.children.slice(offset, offset + limit);
    return { children: ids.map(id => {
      const n = this.engine.node(id);
      insist(this.authorized(snapshot, n), "NOT_VISIBLE", "Child outside snapshot");
      return { id: n.id, text: n.text, start: n.start, count: n.count, sourceId: n.source, publicationId: n.publicationId };
    }), next: offset + limit < node.children.length ? offset + limit : null };
  }
  source(snapshot: Snapshot, id: string, offset = 0, maxBytes = 8192) {
    const r = this.sourceAllowed(snapshot, id);
    insist(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(maxBytes) && maxBytes >= 4 && maxBytes <= 32768, "INVALID_PAGE", "Invalid source page");
    // Offsets are Unicode code points, never byte slices that can corrupt UTF-8.
    let text = "", position = 0, length = 0, next: number | null = null;
    for (const point of r.payload) {
      if (position++ < offset) continue;
      const n = bytes(point);
      if (length + n > maxBytes) { next = position - 1; break; }
      text += point; length += n;
    }
    insist(offset <= position, "INVALID_PAGE", "Offset exceeds source");
    return { sourceId: id, text, next, metadata: { sessionId: r.sessionId, generation: r.generation, seq: r.seq, kind: r.kind, turnId: r.turnId, timestamp: r.timestamp, payloadHash: r.payloadHash, truncated: r.truncated ?? false, callId: r.callId, projectId: r.projectId, worktreeId: r.worktreeId, commit: r.commit, inheritedFrom: r.inheritedFrom } };
  }
  search(snapshot: Snapshot, query: string, offset = 0, limit = 20) {
    this.engine.validateSnapshot(snapshot);
    insist(query.trim() && query.length <= 1024 && Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit) && limit > 0 && limit <= 100, "INVALID_QUERY", "Invalid search or pagination");
    const literal = '"' + query.replaceAll('"', '""') + '"';
    // SQLite applies visibility before pagination. Only limit+1 IDs enter this process.
    const visible = `EXISTS (SELECT 1 FROM entities ss WHERE ss.bucket='sessions' AND ss.id=s.session
      AND json_extract(ss.value,'$.scopeId')=$scope AND json_extract(ss.value,'$.generation')=s.generation
      AND json_extract(ss.value,'$.disabled') IS NULL)
      AND ((s.session=$session AND s.generation=$generation AND s.seq<$boundary)
      OR EXISTS (SELECT 1 FROM entities p WHERE p.bucket='publications'
      AND json_extract(p.value,'$.scopeId')=$scope AND json_extract(p.value,'$.publicationSeq')<=$water
      AND json_extract(p.value,'$.sessionId')=s.session AND json_extract(p.value,'$.generation')=s.generation
      AND s.seq>=json_extract(p.value,'$.start') AND s.seq<json_extract(p.value,'$.end')))`;
    const rows = this.engine.store.db.query(`SELECT id,type FROM (
      SELECT source_fts.id AS id,'source' AS type,0 AS category,source_fts.rowid AS ordinal
      FROM source_fts JOIN sources s ON s.id=source_fts.id WHERE source_fts MATCH $query AND ${visible}
      UNION ALL
      SELECT n.id,'summary',1,node_fts.rowid FROM node_fts JOIN nodes n ON n.id=node_fts.id
      WHERE node_fts MATCH $query AND (
        (n.tree=$shared AND n.start+n.count<=$prefix)
        OR (json_extract(n.tree,'$[0]')='session' AND EXISTS (
          SELECT 1 FROM entities ss WHERE ss.bucket='sessions' AND ss.id=json_extract(n.tree,'$[1]')
          AND json_extract(ss.value,'$.scopeId')=$scope AND json_extract(ss.value,'$.generation')=json_extract(n.tree,'$[2]')
          AND json_extract(ss.value,'$.disabled') IS NULL)
          AND NOT EXISTS (SELECT 1 FROM sources s WHERE s.session=json_extract(n.tree,'$[1]')
            AND s.generation=json_extract(n.tree,'$[2]') AND s.seq>=n.start AND s.seq<n.start+n.count AND NOT (${visible}))))
      ) ORDER BY category,ordinal LIMIT $limit OFFSET $offset`).all({ query: literal, scope: snapshot.scopeId, session: snapshot.sessionId, generation: snapshot.generation, boundary: snapshot.ownBoundary, water: snapshot.highWater, shared: snapshot.view.tree, prefix: snapshot.view.prefix, limit: limit + 1, offset }) as { id: string; type: string }[];
    const hits = rows.slice(0, limit).map(row => {
      if (row.type === "source") { const r = this.sourceAllowed(snapshot, row.id); return { ...row, kind: r.kind, sessionId: r.sessionId, text: Array.from(r.payload).slice(0, 200).join("") }; }
      const n = this.engine.node(row.id); insist(this.authorized(snapshot, n), "NOT_VISIBLE", "Search summary is outside the snapshot");
      return { ...row, text: n.text };
    });
    return { hits, next: rows.length > limit ? offset + limit : null };
  }
}
