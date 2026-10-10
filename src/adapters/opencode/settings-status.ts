import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { Store, insist, type Turn } from "../../index.ts";

export interface MemoryStatus {
  enabled: boolean;
  databaseExists: boolean;
  sessions: number;
  originals: number;
  summaries: number;
  publications: number;
  activeTurns: number;
  nativeTurns?: number;
  remainingMessages?: number;
  totalMessages?: number;
  processedMessages?: number;
  inventoryComplete?: boolean;
  jobs: { pending: number; running: number; expired: number; failed: number; done: number; revoked: number };
  lastError?: string;
  jobError?: string;
  retryInSeconds?: number;
  retryAttempt?: number;
}
export function memoryStatus(database: string, enabled: boolean): MemoryStatus {
  const status: MemoryStatus = { enabled, databaseExists: existsSync(database), sessions: 0, originals: 0, summaries: 0, publications: 0, activeTurns: 0,
    jobs: { pending: 0, running: 0, expired: 0, failed: 0, done: 0, revoked: 0 } };
  if (!status.databaseExists) return status;
  const db = new Database(database, { readonly: true });
  try {
    return db.transaction(() => {
      const count = (sql: string) => (db.query(sql).get() as { count: number }).count;
      status.sessions = count("SELECT count(*) AS count FROM entities WHERE bucket='sessions'");
      status.originals = count("SELECT count(*) AS count FROM sources");
      status.summaries = count("SELECT count(*) AS count FROM nodes");
      status.publications = count("SELECT count(*) AS count FROM entities WHERE bucket='publications'");
      status.activeTurns = count("SELECT count(*) AS count FROM entities WHERE bucket='turns' AND json_extract(value,'$.outcome') IS NULL");
      status.nativeTurns = count("SELECT count(*) AS count FROM entities WHERE bucket='nativeActive'");
      status.inventoryComplete = count(`SELECT count(*) AS count FROM entities s
        WHERE s.bucket='sessions' AND json_extract(s.value,'$.disabled') IS NULL AND NOT EXISTS (
          SELECT 1 FROM entities i WHERE i.bucket='messageInventory' AND i.id=s.id
          AND json_extract(i.value,'$.generation')=json_extract(s.value,'$.generation'))`) === 0;
      const inventory = db.query(`SELECT i.id AS session,json_extract(i.value,'$.generation') AS generation,
          json_extract(m.value,'$.id') AS message,json_extract(m.value,'$.records') AS expected
        FROM entities i JOIN entities s ON s.bucket='sessions' AND s.id=i.id,
          json_each(i.value,'$.messages') m
        WHERE i.bucket='messageInventory' AND json_extract(s.value,'$.disabled') IS NULL
          AND json_extract(i.value,'$.generation')=json_extract(s.value,'$.generation')`).all() as { session: string; generation: number; message: string; expected: number }[];
      const complete = db.query(`SELECT count(*) AS count FROM sources s WHERE s.session=? AND s.generation=?
        AND substr(s.eventKey,1,instr(s.eventKey,':')-1)=? AND EXISTS (
          SELECT 1 FROM nodes n WHERE n.tree=json_array('session',s.session,s.generation) AND n.start=s.seq AND n.count=1)`);
      status.totalMessages = inventory.length;
      status.processedMessages = inventory.filter(m => (complete.get(m.session,m.generation,m.message) as { count: number }).count === m.expected).length;
      status.remainingMessages = count(`SELECT count(*) AS count FROM (
        SELECT DISTINCT s.session,s.generation,
          CASE WHEN instr(s.eventKey,':')>0 THEN substr(s.eventKey,1,instr(s.eventKey,':')-1) ELSE s.eventKey END AS message
        FROM sources s WHERE NOT EXISTS (
          SELECT 1 FROM nodes n WHERE n.tree=json_array('session',s.session,s.generation) AND n.start=s.seq AND n.count=1
        )
      )`);
      for (const row of db.query("SELECT status,count(*) AS count FROM jobs GROUP BY status").all() as { status: string; count: number }[])
        if (row.status in status.jobs) status.jobs[row.status as keyof typeof status.jobs] = row.count;
      status.jobs.expired = (db.query("SELECT count(*) AS count FROM jobs WHERE status='running' AND leaseUntil<=?").get(Date.now()) as { count: number }).count;
      const failure = db.query("SELECT error FROM jobs WHERE status='failed' ORDER BY rowid DESC LIMIT 1").get() as { error: string } | null;
      if (failure) {
        const codes = ["SUMMARY_SIZE", "SUMMARY_BATCH_INVALID", "TOOL_RESULT_ABSENCE", "DRAFTING_NOTES", "CONTROL_CHARACTERS", "ABSENT_CATEGORY_BOILERPLATE", "SUMMARY_INPUT_TOO_LARGE", "MODEL_LIMIT_UNKNOWN", "NOT_FOUND"];
        status.jobError = codes.find(code => failure.error.includes(code)) ?? (/429|rate[ -]?limit/i.test(failure.error) ? "RATE_LIMIT" : "COMPACTION_FAILED");
      }
      const retry = db.query(`SELECT json_extract(r.value,'$.retryAt') AS retryAt,json_extract(r.value,'$.attempt') AS attempt
        FROM entities r JOIN jobs j ON j.id=json_extract(r.value,'$.jobId')
        WHERE r.bucket='compactorRetry' AND j.status='running' AND j.leaseUntil>?
          AND j.fence=json_extract(r.value,'$.fence') AND json_extract(r.value,'$.retryAt')>?
        ORDER BY retryAt LIMIT 1`).get(Date.now(), Date.now()) as { retryAt: number; attempt: number } | null;
      if (enabled && retry) { status.retryInSeconds = Math.max(0, Math.ceil((retry.retryAt - Date.now()) / 1000)); status.retryAttempt = retry.attempt; }
      const error = db.query("SELECT json_extract(value,'$.code') AS code FROM entities WHERE bucket='adapterErrors' ORDER BY json_extract(value,'$.timestamp') DESC LIMIT 1").get() as { code: string } | null;
      if (error) status.lastError = ["COMPACTION_FAILED", "MEMORY_NOT_READY", "MEMORY_STALLED", "HOST_UNAVAILABLE", "BACKGROUND_PAUSED", "REVERT_PENDING", "TURN_ACTIVE"].includes(error.code) ? error.code : "MEMORY_ERROR";
      const paused = count("SELECT count(*) AS count FROM entities WHERE bucket='settings' AND id='backgroundRecovery' AND json_extract(value,'$.paused')=1");
      if (status.lastError === "BACKGROUND_PAUSED" && !paused) delete status.lastError;
      if (status.jobs.pending && paused) status.lastError = "BACKGROUND_PAUSED";
      return status;
    })();
  } finally { db.close(); }
}
export function retryMemoryJobs(database: string) {
  if (!existsSync(database)) return;
  const store = new Store(database);
  try { store.transaction(() => {
    insist(store.all<Turn>("turns").every(t => t.outcome), "SETTINGS_BUSY", "Finish or interrupt active turns before retrying compaction");
    store.db.query("UPDATE jobs SET status='pending',error=NULL WHERE status='failed'").run();
    store.db.query("DELETE FROM entities WHERE bucket='adapterErrors'").run();
    store.remove("settings", "backgroundRecovery");
  }); } finally { store.close(); }
}
