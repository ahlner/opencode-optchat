import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../src/storage/store.ts";
import { Engine } from "../src/core/engine.ts";
import { compactorRequest } from "../src/adapters/opencode/compactor-request.ts";

test("rate limits retry with bounded delays and one shared deadline", async () => {
  let calls = 0;
  const delays: number[] = [], signals: AbortSignal[] = [];
  const result = await compactorRequest(async signal => {
    signals.push(signal);
    if (++calls < 4) throw new Error("Generate.UnavailableError: Rate limit exceeded. Retry after 3 seconds.");
    return "summary";
  }, 30000, async delay => { delays.push(delay); });
  expect(result).toBe("summary");
  expect(delays).toEqual([3000, 3000, 4000]);
  expect(signals.every(signal => signal === signals[0])).toBe(true);
});

test("permanent errors and excessive provider delays do not retry", async () => {
  for (const message of ["Unauthorized", "Rate limit exceeded. Retry after 60 seconds."]) {
    let calls = 0;
    const error = new Error(message);
    await expect(compactorRequest(async () => { calls++; throw error; }, 30000)).rejects.toBe(error);
    expect(calls).toBe(1);
  }
  let calls = 0;
  await expect(compactorRequest(async () => { calls++; throw new Error("HTTP 429"); }, 30000, async () => {})).rejects.toThrow("HTTP 429");
  expect(calls).toBe(4);
});

test("deadline interrupts the retry delay without another model call", async () => {
  let calls = 0;
  await expect(compactorRequest(async () => { calls++; throw new Error("Too many requests"); }, 10)).rejects.toThrow();
  expect(calls).toBe(1);
});

test("temporary provider failures retry with exponential delays and a shared deadline", async () => {
  for (const message of ["Generate.UnavailableError: model is temporarily unavailable", "HTTP 503", "Bad gateway", "ECONNRESET"]) {
    let calls = 0; const delays: number[] = [];
    expect(await compactorRequest(async () => { if (++calls < 4) throw new Error(message); return "recovered"; }, 30000, async ms => { delays.push(ms); })).toBe("recovered");
    expect(delays).toEqual([1000, 2000, 4000]); expect(calls).toBe(4);
  }
  let calls = 0;
  await expect(compactorRequest(async () => { calls++; throw new Error("HTTP 503"); }, 30000, async () => {})).rejects.toThrow("503");
  expect(calls).toBe(4);
  for (const message of ["Generate.UnavailableError: HTTP 401 Unauthorized", "HTTP 403 Forbidden", "Invalid API key", "model does not exist", "Generate.UnavailableError: model is disabled", "Rate limit HTTP 401 Unauthorized"]) {
    let calls = 0; await expect(compactorRequest(async () => { calls++; throw new Error(message); }, 30000, async () => {})).rejects.toThrow(message); expect(calls).toBe(1);
  }
});

test("temporary provider retries stop during cancellation and never issue a later call", async () => {
  const controller = new AbortController(); let calls = 0;
  await expect(compactorRequest(async () => { calls++; throw new Error("Service unavailable"); }, 30000, async (_ms, signal) => { controller.abort(new Error("stop")); signal.throwIfAborted(); }, controller.signal)).rejects.toThrow("stop");
  expect(calls).toBe(1);
});

test("database claim limit spans connections and permits fenced crash recovery", () => {
  const directory = mkdtempSync(join(tmpdir(), "optchat-claims-"));
  const first = new Store(join(directory, "memory.sqlite")), second = new Store(join(directory, "memory.sqlite"));
  try {
    first.enqueue({ type: "leaf", tree: "tree", start: 0, source: "a" });
    first.enqueue({ type: "leaf", tree: "tree", start: 1, source: "b" });
    const job = first.claim(1000, 100, 1)!;
    expect(second.claim(1001, 100, 1)).toBeUndefined();
    const replacement = second.claim(1100, 100, 1)!;
    expect(replacement.id).toBe(job.id);
    expect(replacement.fence).toBe(job.fence + 1);
    expect(first.recoverLease(job, 100, 1101)).toBe(false);
    second.fail(replacement, "fixture");
    expect(first.claim(1101, 100, 1)?.id).not.toBe(job.id);
    expect(() => new Engine(first, undefined, { maxRunningJobs: 0 })).toThrow("CONFIG");
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("lease recovery cannot bypass the database concurrency limit", () => {
  const store = new Store();
  try {
    store.enqueue({ type: "leaf", tree: "tree", start: 0, source: "a" });
    store.enqueue({ type: "leaf", tree: "tree", start: 1, source: "b" });
    const first = store.claim(1000, 100, 2)!, second = store.claim(1000, 200, 2)!;
    expect(store.recoverLease(first, 100, 1100, 1)).toBe(false);
    store.fail(second, "fixture");
    expect(store.recoverLease(first, 100, 1100, 1)).toBe(true);
  } finally { store.close(); }
});
