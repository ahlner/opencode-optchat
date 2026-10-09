import { describe, expect, test } from "bun:test";
import { createStatusReader, statusIndicator, type StatusIndicator } from "../src/adapters/opencode/tui-status-model.ts";
import type { MemoryStatus } from "../src/adapters/opencode/settings-status.ts";

const ready = (): MemoryStatus => ({ enabled: true, databaseExists: false, sessions: 0, originals: 0,
  summaries: 0, publications: 0, activeTurns: 0,
  jobs: { pending: 0, running: 0, expired: 0, failed: 0, done: 0, revoked: 0 } });

describe("terminal memory status", () => {
  test("shows disabled, ready, active, processing, and failed states", () => {
    const status = ready();
    expect(statusIndicator(status).text).toBe("OptChat: ready");
    status.lastError = "COMPACTION_FAILED";
    expect(statusIndicator(status).text).toBe("OptChat: ready");
    status.lastError = "BACKGROUND_PAUSED";
    expect(statusIndicator(status).text).toBe("OptChat: ready");
    delete status.lastError;
    status.activeTurns = 1;
    expect(statusIndicator(status).text).toBe("OptChat: active");
    status.jobs.pending = 2; status.jobs.running = 1;
    expect(statusIndicator(status).text).toBe("OptChat: processing 1");
    status.jobs.running = 0;
    expect(statusIndicator(status).text).toBe("OptChat: queued 2");
    status.lastError = "BACKGROUND_PAUSED";
    expect(statusIndicator(status).text).toBe("OptChat: paused");
    status.jobs.expired = 1;
    expect(statusIndicator(status).tone).toBe("error");
    status.jobs.expired = 0; status.jobs.failed = 1;
    expect(statusIndicator(status).text).toBe("OptChat: error");
    status.nativeTurns = 1;
    expect(statusIndicator(status).text).toBe("OptChat: native · failed");
    status.jobs.failed = 0; status.jobs.running = 1;
    expect(statusIndicator(status).text).toBe("OptChat: native · preparing 1");
    status.jobs.running = 0; delete status.lastError;
    expect(statusIndicator(status).text).toBe("OptChat: native · queued 2");
    status.jobs.pending = 0;
    expect(statusIndicator(status).text).toBe("OptChat: native");
    status.enabled = false;
    expect(statusIndicator(status)).toEqual({ text: "OptChat: off", tone: "muted" });
  });

  test("uses the current location and recovers after an unavailable status", async () => {
    let location: string | undefined;
    let fail = true;
    const updates: StatusIndicator[] = [];
    const reads: string[] = [];
    const reader = createStatusReader({ location: () => location, update: item => updates.push(item),
      read: async current => { reads.push(current); if (fail) throw new Error("offline"); return ready(); } });
    await reader.refresh();
    expect(reads).toEqual([]);
    expect(updates.at(-1)?.text).toBe("OptChat: unavailable");
    location = "first"; await reader.refresh();
    expect(updates.at(-1)?.text).toBe("OptChat: unavailable");
    fail = false; location = "second"; await reader.refresh();
    expect(reads).toEqual(["first", "second"]);
    expect(updates.at(-1)?.text).toBe("OptChat: ready");
    reader.dispose(); await reader.refresh();
    expect(reads).toHaveLength(2);
  });

  test("does not overlap requests or display a previous location's result", async () => {
    let location = "first";
    let resolve!: (status: MemoryStatus) => void;
    let calls = 0;
    const updates: StatusIndicator[] = [];
    const reader = createStatusReader({ location: () => location, update: item => updates.push(item),
      read: () => { calls++; return new Promise<MemoryStatus>(done => { resolve = done; }); } });
    const pending = reader.refresh();
    await reader.refresh(); expect(calls).toBe(1);
    location = "second"; resolve(ready()); await pending;
    expect(updates).toEqual([]);
    const next = reader.refresh(); resolve(ready()); await next;
    expect(updates.at(-1)?.text).toBe("OptChat: ready");
    reader.dispose();
  });

  test("aborts pending reads and discards results after disposal", async () => {
    let resolve!: (status: MemoryStatus) => void;
    let signal!: AbortSignal;
    const updates: StatusIndicator[] = [];
    const reader = createStatusReader({ location: () => "project", update: item => updates.push(item),
      read: (_, current) => { signal = current; return new Promise<MemoryStatus>(done => { resolve = done; }); } });
    const pending = reader.refresh(); reader.dispose();
    expect(signal.aborted).toBe(true);
    resolve(ready()); await pending;
    expect(updates).toEqual([]);
  });
});
