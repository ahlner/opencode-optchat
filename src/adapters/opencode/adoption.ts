import { Database } from "bun:sqlite";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Engine, Store, insist } from "../../index.ts";

// A user-controlled copy installs retained memory into a copied project.
// The source database stays unchanged for its original project.
export interface MemoryCandidate { database: string; scopeId: string; sessions: number; publications: number; modified: number }

export function memoryRoot(): string {
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "optchat");
}

export function memoryCandidates(root: string, currentDatabase: string): MemoryCandidate[] {
  if (!existsSync(root)) return [];
  const result: MemoryCandidate[] = [];
  for (const entry of readdirSync(root)) {
    const database = join(root, entry, "memory.sqlite");
    if (database === currentDatabase || !existsSync(database)) continue;
    try {
      const db = new Database(database, { readonly: true });
      try {
        const scope = (db.query("SELECT id FROM entities WHERE bucket='scopes' LIMIT 1").get() as { id: string } | null)?.id;
        if (!scope) continue;
        const sessions = (db.query("SELECT count(*) n FROM entities WHERE bucket='sessions'").get() as { n: number }).n;
        if (!sessions) continue;
        const publications = (db.query("SELECT count(*) n FROM entities WHERE bucket='publications'").get() as { n: number }).n;
        result.push({ database, scopeId: scope, sessions, publications, modified: statSync(database).mtimeMs });
      } finally { db.close(); }
    } catch { /* Skip a database this process cannot read. */ }
  }
  return result.sort((a, b) => b.modified - a.modified);
}

export function adoptMemory(sourceDatabase: string, targetDatabase: string, targetScopeId: string): number {
  insist(sourceDatabase !== targetDatabase, "CONFIG", "Select a different memory database");
  const source = new Store(sourceDatabase);
  let oldScopeId: string;
  try {
    const scopes = source.all<{ id: string }>("scopes");
    insist(scopes.length === 1 && scopes[0]!.id !== targetScopeId, "CONFIG", "The selected database must contain exactly one other scope");
    oldScopeId = scopes[0]!.id;
  } finally { source.close(); }
  // Build a consistent copy, including any committed write-ahead log content.
  for (const suffix of ["", "-wal", "-shm"]) if (existsSync(`${targetDatabase}${suffix}`)) rmSync(`${targetDatabase}${suffix}`);
  const reader = new Database(sourceDatabase, { readonly: true });
  try { reader.run("VACUUM INTO ?", [targetDatabase]); } finally { reader.close(); }
  const target = new Store(targetDatabase);
  try {
    new Engine(target).rescope(oldScopeId, targetScopeId);
    target.set("settings", "adapterScope", targetScopeId);
    return target.all<{ id: string }>("sessions").length;
  } finally { target.close(); }
}