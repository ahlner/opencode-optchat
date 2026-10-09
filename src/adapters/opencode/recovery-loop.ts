export interface RecoveryState {
  pending: number;
  running: number;
  expired: number;
  failed: number;
  progress: number;
  paused: boolean;
  attempts?: number;
}

// Continue durable preparation without retrying failed jobs or overlapping live workers.
export function createRecoveryLoop(options: {
  snapshot: () => RecoveryState;
  busy: () => boolean;
  run: (signal: AbortSignal) => Promise<void>;
  pause: () => void;
  reset: () => void;
  completed?: (madeProgress: boolean) => void;
  intervalMs?: number;
  maxStalls?: number;
}) {
  let stopped = false, stalls = 0, observedPause = false, task: Promise<void> | undefined, controller: AbortController | undefined;
  const schedule = () => {
    if (stopped || task || options.busy()) return;
    const before = options.snapshot();
    if (!before.pending && !before.running) { stalls = 0; if (before.paused || before.attempts) options.reset(); return; }
    if (before.paused) { observedPause = true; return; }
    if (observedPause) { observedPause = false; stalls = 0; }
    if (before.failed || before.running > before.expired) return;
    controller = new AbortController();
    task = (async () => {
      try { await options.run(controller!.signal); }
      catch { /* The adapter records sanitized operational errors. */ }
      finally {
        if (!stopped && !controller!.signal.aborted) {
          const after = options.snapshot();
          if (after.progress > before.progress || !after.pending) { stalls = 0; options.completed?.(true); }
          else if (!after.running && !after.failed) {
            if (options.completed) options.completed(false);
            else if (++stalls >= (options.maxStalls ?? 3)) { observedPause = true; options.pause(); }
          }
        }
      }
    })().catch(() => {}).finally(() => { task = undefined; controller = undefined; });
  };
  const tick = () => { try { schedule(); } catch { /* Retry a transient database read on the next timer. */ } };
  const timer = setInterval(tick, options.intervalMs ?? 1000); timer.unref();
  return { tick, interrupt() { controller?.abort(); }, async dispose() { stopped = true; clearInterval(timer); controller?.abort(); await task; } };
}
