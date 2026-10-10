// Retry only recognizable temporary provider failures, never configuration or permission errors.
export function temporaryProviderError(error: unknown): boolean {
  const parts: string[] = []; const seen = new Set<unknown>();
  for (let current: unknown = error; current !== undefined && !seen.has(current) && parts.length < 4;) {
    seen.add(current); parts.push(String(current));
    if (!current || typeof current !== "object") break;
    const value = current as { status?: unknown; statusCode?: unknown; cause?: unknown };
    if (value.status !== undefined) parts.push(`HTTP ${value.status}`);
    if (value.statusCode !== undefined) parts.push(`HTTP ${value.statusCode}`);
    current = value.cause;
  }
  const text = parts.join("\n");
  if (/unauthori[sz]ed|forbidden|invalid.*(?:api[ -]?key|credentials?|model)|model.*(?:not found|does not exist|not supported|unsupported|disabled)|insufficient.*(?:quota|credit)|payment required|\b40[0-4]\b/i.test(text)) return false;
  return /rate[ -]?limit|too many requests|\b429\b|temporar(?:ily)? unavailable|service unavailable|overloaded|bad gateway|gateway timeout|\b50[234]\b|UnavailableError|PROVIDER_UNAVAILABLE|ECONNRESET|ETIMEDOUT|socket (?:connection )?closed/i.test(text);
}
