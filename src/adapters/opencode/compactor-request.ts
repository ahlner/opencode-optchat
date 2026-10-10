import { abortable } from "../../core/abort.ts";
import { providerRetryDelay, temporaryProviderError } from "../../core/provider-error.ts";
// Retry explicit rate limits and temporary provider failures within one shared deadline.
export async function compactorRequest<T>(generate: (signal: AbortSignal) => Promise<T>, waitMs: number,
  sleep: (ms: number, signal: AbortSignal) => Promise<void> = pause, parent?: AbortSignal, backoff?: (attempt: number, delayMs: number) => void): Promise<T> {
  const signal = parent ? AbortSignal.any([parent, AbortSignal.timeout(waitMs)]) : AbortSignal.timeout(waitMs);
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await abortable(() => generate(signal), signal); }
    catch (error) {
      if (signal.aborted || attempt >= 3 || !temporaryProviderError(error)) throw error;
      const delay = Math.max(1000 * 2 ** attempt, providerRetryDelay(error));
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
