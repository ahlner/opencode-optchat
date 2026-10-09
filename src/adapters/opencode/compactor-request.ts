import { abortable } from "../../core/abort.ts";
// Retry only explicit rate limits. Other failures retain their original error.
export async function compactorRequest<T>(generate: (signal: AbortSignal) => Promise<T>, waitMs: number,
  sleep: (ms: number, signal: AbortSignal) => Promise<void> = pause, parent?: AbortSignal, backoff?: (attempt: number, delayMs: number) => void): Promise<T> {
  const signal = parent ? AbortSignal.any([parent, AbortSignal.timeout(waitMs)]) : AbortSignal.timeout(waitMs);
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await abortable(() => generate(signal), signal); }
    catch (error) {
      const message = String(error);
      if (signal.aborted || attempt >= 3 || !/rate[ -]?limit|too many requests|\b429\b/i.test(message)) throw error;
      const seconds = /retry after\s+(\d+(?:\.\d+)?)\s*(?:seconds?|s)\b/i.exec(message);
      const delay = Math.max(1000 * 2 ** attempt, seconds ? Number(seconds[1]) * 1000 : 0);
      // Do not shorten a provider's requested delay to fit the retry bound.
      if (!Number.isFinite(delay) || delay > 30000) throw error;
      try { backoff?.(attempt + 1, delay); } catch { /* Diagnostics must not change provider retries. */ }
      await abortable(() => sleep(delay, signal), signal);
    }
  }
}
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
