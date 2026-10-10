// Retry only recognizable temporary provider failures, never configuration or permission errors.
export function temporaryProviderError(error: unknown): boolean {
  const parts: string[] = []; const seen = new Set<unknown>();
  for (let current: unknown = error; current !== undefined && !seen.has(current) && seen.size < 8;) {
    seen.add(current); parts.push(String(current));
    if (!current || typeof current !== "object") break;
    const value = current as { status?: unknown; statusCode?: unknown; cause?: unknown; message?: unknown; _tag?: unknown };
    if (typeof value.message === "string") parts.push(value.message);
    if (typeof value._tag === "string") parts.push(value._tag);
    if (value.status !== undefined) parts.push(`HTTP ${value.status}`);
    if (value.statusCode !== undefined) parts.push(`HTTP ${value.statusCode}`);
    current = value.cause;
  }
  const text = parts.join("\n");
  if (/unauthori[sz]ed|forbidden|invalid.*(?:api[ -]?key|credentials?|model)|model.*(?:not found|does not exist|not supported|unsupported|disabled)|insufficient.*(?:quota|credit)|payment required|\b40[0-4]\b/i.test(text)) return false;
  return /rate[ -]?limit|too many requests|\b429\b|temporar(?:ily)? unavailable|service unavailable|overloaded|bad gateway|gateway timeout|\b50[234]\b|UnavailableError|PROVIDER_UNAVAILABLE|ECONNRESET|ETIMEDOUT|socket (?:connection )?closed/i.test(text);
}

// Read only retry metadata. Do not retain provider objects or headers.
export function providerRetryDelay(error: unknown, now = Date.now()): number {
  let delay = 0;
  const seen = new Set<unknown>();
  for (let current = error; current && !seen.has(current) && seen.size < 8;) {
    seen.add(current);
    const message = typeof current === "object" && "message" in current ? String(current.message) : String(current);
    const match = /retry after\s+(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s)\b/i.exec(message);
    if (match) delay = Math.max(delay, Number(match[1]) * (/^m/i.test(match[2]!) ? 1 : 1000));
    if (typeof current !== "object") break;
    const value = current as { retryAfterMs?: unknown; headers?: unknown; cause?: unknown };
    if (typeof value.retryAfterMs === "number" && value.retryAfterMs >= 0) delay = Math.max(delay, value.retryAfterMs);
    const headers = value.headers;
    const after = headers instanceof Headers ? headers.get("retry-after") : headers && typeof headers === "object"
      ? Object.entries(headers).find(([name]) => name.toLowerCase() === "retry-after")?.[1] : undefined;
    if (typeof after === "string" || typeof after === "number") {
      const seconds = Number(after);
      const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(after)) - now;
      if (!Number.isNaN(ms)) delay = Math.max(delay, ms);
    }
    current = value.cause;
  }
  return delay;
}
