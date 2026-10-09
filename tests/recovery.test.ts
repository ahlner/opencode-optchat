import { expect, test } from "bun:test";
import { createRecoveryLoop, type RecoveryState } from "../src/adapters/opencode/recovery-loop.ts";

const state = (): RecoveryState => ({ pending: 1, running: 0, expired: 0, failed: 0, progress: 0, paused: false });
const settled = () => Bun.sleep(2);

test("recovery resumes pending work without an event and skips live, busy, failed, and paused workers", async () => {
  const s = state(); let calls = 0, busy = true;
  const loop = createRecoveryLoop({ snapshot: () => ({ ...s }), busy: () => busy, intervalMs: 5,
    run: async () => { calls++; s.pending = 0; s.progress++; }, pause() {}, reset() {} });
  try {
    loop.tick(); expect(calls).toBe(0); busy = false;
    s.running = 1; loop.tick(); expect(calls).toBe(0); s.running = 0;
    s.failed = 1; loop.tick(); expect(calls).toBe(0); s.failed = 0;
    s.paused = true; loop.tick(); expect(calls).toBe(0); s.paused = false;
    await Bun.sleep(20); expect(calls).toBe(1); expect(s.pending).toBe(0);
  } finally { await loop.dispose(); }
});

test("recovery pauses after three attempts without durable progress and allows an explicit retry", async () => {
  const s = state(); let calls = 0, progress = false;
  const loop = createRecoveryLoop({ snapshot: () => ({ ...s }), busy: () => false, intervalMs: 100000,
    run: async () => { calls++; if (progress) s.progress++; }, pause: () => { s.paused = true; }, reset: () => { s.paused = false; } });
  try {
    for (let i = 0; i < 3; i++) { loop.tick(); await settled(); }
    expect(calls).toBe(3); expect(s.paused).toBe(true);
    loop.tick(); await settled(); expect(calls).toBe(3);
    s.paused = false; progress = true;
    for (let i = 0; i < 4; i++) { loop.tick(); await settled(); }
    expect(calls).toBe(7); expect(s.paused).toBe(false);
    progress = false; loop.tick(); await settled(); expect(s.paused).toBe(false);
    s.pending = 0; s.paused = true; loop.tick(); expect(s.paused).toBe(false);
  } finally { await loop.dispose(); }
});

test("recovery does not overlap and aborts on primary preemption or shutdown", async () => {
  const s = state(); let calls = 0, signal!: AbortSignal;
  const loop = createRecoveryLoop({ snapshot: () => ({ ...s }), busy: () => false, intervalMs: 100000,
    run: current => { calls++; signal = current; return new Promise<void>(resolve => current.addEventListener("abort", () => resolve(), { once: true })); },
    pause: () => { s.paused = true; }, reset() {} });
  loop.tick(); loop.tick(); expect(calls).toBe(1);
  loop.interrupt(); expect(signal.aborted).toBe(true); await settled(); expect(s.paused).toBe(false);
  loop.tick(); expect(calls).toBe(2); await loop.dispose(); expect(signal.aborted).toBe(true);
  loop.tick(); expect(calls).toBe(2);
});

test("expired claims can resume while exceptions do not escape timer callbacks", async () => {
  const s = state(); s.running = s.expired = 1; let calls = 0, failRead = true;
  const loop = createRecoveryLoop({ snapshot: () => { if (failRead) throw new Error("read unavailable"); return { ...s }; }, busy: () => false, intervalMs: 100000,
    run: async () => { calls++; s.running = s.expired = s.pending = 0; s.progress++; }, pause() {}, reset() {} });
  try { expect(() => loop.tick()).not.toThrow(); failRead = false; loop.tick(); await settled(); expect(calls).toBe(1); }
  finally { await loop.dispose(); }
});

test("multiple runtimes can share a stall limit that survives loop replacement", async () => {
  const s = state(); s.attempts = 0; let calls = 0;
  const create = () => createRecoveryLoop({ snapshot: () => ({ ...s }), busy: () => false, intervalMs: 100000,
    run: async () => { calls++; }, pause() {}, reset: () => { s.attempts = 0; s.paused = false; },
    completed: progress => { s.attempts = progress ? 0 : s.attempts! + 1; s.paused = s.attempts >= 3; } });
  const first = create(), peer = create();
  first.tick(); await settled(); peer.tick(); await settled(); await first.dispose();
  const replacement = create();
  try {
    replacement.tick(); await settled(); expect(s.attempts).toBe(3); expect(s.paused).toBe(true);
    peer.tick(); replacement.tick(); await settled(); expect(calls).toBe(3);
    s.pending = 0; peer.tick(); expect(s.attempts).toBe(0); expect(s.paused).toBe(false);
  } finally { await peer.dispose(); await replacement.dispose(); }
});
