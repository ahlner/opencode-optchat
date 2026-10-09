import { Database } from "bun:sqlite";
import { chmodSync } from "node:fs";
import { hash, insist, type Job, type JobInput } from "../core/types.ts";

// JSON envelopes keep migrations small; indexed coordinates enforce critical uniqueness.
export class Store {
  readonly db: Database;
  constructor(path = ":memory:") {
    this.db = new Database(path, { create: true, strict: true });
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;");
    const version = (this.db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
    insist(version <= 1, "SCHEMA_VERSION", "Database requires a newer OptChat version");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (bucket TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(bucket,id));
      CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, session TEXT NOT NULL, generation INTEGER NOT NULL, seq INTEGER NOT NULL, eventKey TEXT NOT NULL, turnId TEXT NOT NULL, value TEXT NOT NULL, UNIQUE(session,generation,seq), UNIQUE(session,generation,eventKey));
      CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, tree TEXT NOT NULL, start INTEGER NOT NULL, count INTEGER NOT NULL, value TEXT NOT NULL, UNIQUE(tree,start,count));
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, input TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', fence INTEGER NOT NULL DEFAULT 0, leaseUntil INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, error TEXT);
      CREATE INDEX IF NOT EXISTS publications_visibility ON entities(bucket,json_extract(value,'$.scopeId'),json_extract(value,'$.sessionId'),json_extract(value,'$.generation'),json_extract(value,'$.publicationSeq')) WHERE bucket='publications';
      CREATE VIRTUAL TABLE IF NOT EXISTS source_fts USING fts5(id UNINDEXED, text, tokenize='unicode61');
      CREATE VIRTUAL TABLE IF NOT EXISTS node_fts USING fts5(id UNINDEXED, text, tokenize='unicode61');
      CREATE TRIGGER IF NOT EXISTS node_fts_insert AFTER INSERT ON nodes BEGIN
        INSERT INTO node_fts(id,text) VALUES(new.id,json_extract(new.value,'$.text'));
      END;
      CREATE TRIGGER IF NOT EXISTS node_fts_delete AFTER DELETE ON nodes BEGIN
        DELETE FROM node_fts WHERE id=old.id;
      END;
      INSERT INTO node_fts(id,text) SELECT id,json_extract(value,'$.text') FROM nodes WHERE id NOT IN (SELECT id FROM node_fts);
      PRAGMA user_version=1;
    `);
  }
  transaction<T>(fn: () => T): T { return this.db.transaction(fn).immediate(); }
  get<T>(bucket: string, id: string): T | undefined {
    const row = this.db.query("SELECT value FROM entities WHERE bucket=? AND id=?").get(bucket, id) as { value: string } | null;
    return row ? JSON.parse(row.value) : undefined;
  }
  set(bucket: string, id: string, value: unknown) {
    this.db.query("INSERT INTO entities VALUES(?,?,?) ON CONFLICT(bucket,id) DO UPDATE SET value=excluded.value").run(bucket, id, JSON.stringify(value));
  }
  remove(bucket: string, id: string) { this.db.query("DELETE FROM entities WHERE bucket=? AND id=?").run(bucket, id); }
  all<T>(bucket: string): T[] {
    return (this.db.query("SELECT value FROM entities WHERE bucket=? ORDER BY id").all(bucket) as { value: string }[]).map(r => JSON.parse(r.value));
  }
  enqueue(input: JobInput) {
    const value = JSON.stringify(input), id = hash(value);
    this.db.query("INSERT OR IGNORE INTO jobs(id,input) VALUES(?,?)").run(id, value);
    return id;
  }
  claim(now = Date.now(), leaseMs = 60000, maxRunning = Number.MAX_SAFE_INTEGER): Job | undefined {
    insist(Number.isSafeInteger(maxRunning) && maxRunning > 0, "CONFIG", "Job concurrency must be a positive integer");
    return this.transaction(() => {
      const live = this.db.query("SELECT count(*) AS n FROM jobs WHERE status='running' AND leaseUntil>?").get(now) as { n: number };
      if (live.n >= maxRunning) return;
      const row = this.db.query("SELECT * FROM jobs WHERE status='pending' OR (status='running' AND leaseUntil<=?) ORDER BY rowid LIMIT 1").get(now) as (Omit<Job, "input"> & { input: string }) | null;
      if (!row) return;
      const fence = row.fence + 1;
      this.db.query("UPDATE jobs SET status='running', fence=?, leaseUntil=?, attempts=attempts+1 WHERE id=?").run(fence, now + leaseMs, row.id);
      return { ...row, input: JSON.parse(row.input), fence, leaseUntil: now + leaseMs, attempts: row.attempts + 1, status: "running" };
    });
  }
  owns(job: Job) {
    const row = this.db.query("SELECT fence,status,leaseUntil FROM jobs WHERE id=?").get(job.id) as Pick<Job, "fence" | "status" | "leaseUntil"> | null;
    return row?.fence === job.fence && row.status === "running" && row.leaseUntil > Date.now();
  }
  renew(job: Job, leaseMs: number, now = Date.now()): boolean {
    return this.db.query("UPDATE jobs SET leaseUntil=? WHERE id=? AND fence=? AND status='running' AND leaseUntil>?").run(now + leaseMs, job.id, job.fence, now).changes === 1;
  }
  // Recover after suspension only if no other worker or retention change replaced this fence.
  recoverLease(job: Job, leaseMs: number, now = Date.now(), maxRunning = Number.MAX_SAFE_INTEGER): boolean {
    return this.db.query("UPDATE jobs SET leaseUntil=? WHERE id=? AND fence=? AND status='running' AND (SELECT count(*) FROM jobs WHERE status='running' AND leaseUntil>? AND id<>?)<?").run(now + leaseMs, job.id, job.fence, now, job.id, maxRunning).changes === 1;
  }
  fail(job: Job, error: unknown) {
    this.db.query("UPDATE jobs SET status='failed',error=? WHERE id=? AND fence=? AND status='running'").run(String(error), job.id, job.fence);
  }
  close() { this.db.close(); }
}
