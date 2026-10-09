import { expect, test } from "bun:test";
import { mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { Diagnostics, diagnosticCode } from "../src/adapters/opencode/diagnostics.ts";
import { MemoryError, Engine, Store } from "../src/index.ts";

test("diagnostics show waiting phases and counters without retaining payloads or raw errors", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-diagnostic-"));
  const diagnostic = new Diagnostics(join(root, "memory.sqlite"), () => ({ pending: 2, running: 1 }), 5);
  try {
    diagnostic.emit("fixture", { pending: 2, prompt: "PRIVATE_PROMPT", error: "SECRET_KEY", payload: "PRIVATE_ORIGINAL", inputBytes: 17 });
    Bun.sleepSync(25); await Bun.sleep(8);
    await expect(diagnostic.span("host.session.context", async () => { await Bun.sleep(20); throw new Error("SECRET_PROVIDER_RESPONSE"); })).rejects.toThrow("SECRET_PROVIDER_RESPONSE");
    diagnostic.close();
    const text = await Bun.file(diagnostic.path).text(), rows = text.trim().split("\n").map(line => JSON.parse(line));
    expect(rows.some(r => r.event === "waiting" && r.phase === "host.session.context" && r.elapsedMs >= 5)).toBe(true);
    expect(rows.some(r => r.event === "heartbeat" && r.pending === 2 && r.running === 1)).toBe(true);
    expect(rows.some(r => r.event === "heartbeat" && r.driftMs >= 15)).toBe(true);
    expect(rows.some(r => r.event === "phase.end" && r.errorCode === "ERROR")).toBe(true);
    for (const secret of ["PRIVATE_PROMPT", "SECRET_KEY", "PRIVATE_ORIGINAL", "SECRET_PROVIDER_RESPONSE"]) expect(text).not.toContain(secret);
    expect((await stat(diagnostic.path)).mode & 0o777).toBe(0o600);
    expect(new Set(rows.map(r => r.runId)).size).toBe(1);
    expect(rows.find(r => r.event === "runtime.start").moduleHash).toMatch(/^[0-9a-f]{64}$/);
    expect(diagnosticCode(new MemoryError("MEMORY_NOT_READY", "PRIVATE_ORIGINAL"))).toBe("MEMORY_NOT_READY");
    const before = text; diagnostic.emit("after.close"); expect(await Bun.file(diagnostic.path).text()).toBe(before);
  } finally { diagnostic.close(); await rm(root, { recursive: true, force: true }); }
});

test("diagnostics rotate one bounded backup and reject symlink destinations without failing work", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, "optchat-diagnostic-"));
  const diagnostic = new Diagnostics(join(root, "memory.sqlite"), undefined, 5000, 400);
  try {
    for (let i = 0; i < 100; i++) diagnostic.emit("fixture", { pending: i });
    diagnostic.close();
    expect((await stat(diagnostic.path)).size).toBeLessThan(800);
    expect((await stat(`${diagnostic.path}.1`)).size).toBeLessThan(800);
    expect((await stat(`${diagnostic.path}.1`)).mode & 0o777).toBe(0o600);
    const first = new Diagnostics(join(root, "shared.sqlite"), undefined, 5000, 400);
    const second = new Diagnostics(join(root, "shared.sqlite"), undefined, 5000, 400);
    try {
      for (let i = 0; i < 10; i++) second.emit("fixture", { pending: i });
      first.emit("after.rotation.first"); second.emit("after.rotation.second");
      const combined = await Bun.file(first.path).text() + await Bun.file(`${first.path}.1`).text();
      expect(combined).toContain("after.rotation.first"); expect(combined).toContain("after.rotation.second");
    } finally { first.close(); second.close(); }
    const target = join(root, "target"), database = join(root, "symlink.sqlite"); await Bun.write(target, "UNCHANGED");
    await symlink(target, `${database}.diagnostics.ndjson`);
    const rejected = new Diagnostics(database); expect(await rejected.span("fixture", async () => 7)).toBe(7); rejected.close();
    expect(await Bun.file(target).text()).toBe("UNCHANGED");
  } finally { diagnostic.close(); await rm(root, { recursive: true, force: true }); }
});

test("job diagnostics cannot change worker results when an observer fails", async () => {
  const store = new Store(), events: string[] = [];
  const engine = new Engine(store, undefined, { jobEvent: event => { events.push(event); throw new Error("Observer unavailable"); } });
  try {
    engine.register("session", "scope", "project"); engine.admit("session", "turn");
    engine.append({ sessionId: "session", generation: 0, projectId: "project", turnId: "turn", eventKey: "source", kind: "user", timestamp: "2026-10-09T00:00:00Z", payload: "Original" });
    engine.finish("session", "turn", "completed"); await engine.drain();
    expect(events).toContain("job.claim"); expect(events).toContain("job.done"); expect(store.all("publications")).toHaveLength(1);
  } finally { store.close(); }
});
