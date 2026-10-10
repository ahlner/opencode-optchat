import type { MemoryStatus } from "./settings-status.ts";

export interface StatusIndicator {
  text: string;
  tone: "muted" | "success" | "warning" | "error";
}

export function statusIndicator(status: MemoryStatus): StatusIndicator {
  const indicator = baseIndicator(status);
  if (status.totalMessages !== undefined && status.processedMessages !== undefined && status.enabled) {
    const mode = status.nativeTurns ? "N" : "M";
    const state = status.jobs.failed || status.jobs.expired ? "!" : status.lastError === "BACKGROUND_PAUSED" ? "P" : "";
    const jobs = status.jobs.pending + status.jobs.running + status.jobs.failed;
    const retry = status.retryInSeconds === undefined ? "" : ` · r${status.retryInSeconds}s`;
    return { text: `OC:${mode}${state} ${status.processedMessages}/${status.totalMessages}${status.inventoryComplete ? "" : "?"}m · ${jobs}j${retry}`, tone: indicator.tone };
  }
  if (!status.enabled || status.remainingMessages === undefined) return indicator;
  const jobs = status.jobs.pending + status.jobs.running + status.jobs.failed;
  if (status.remainingMessages || jobs) indicator.text += ` · ${status.remainingMessages} msgs left · ${jobs} jobs`;
  return indicator;
}

export function activityDetails(status: MemoryStatus): string {
  const total = status.totalMessages ?? 0, done = status.processedMessages ?? 0;
  const ratio = total ? Math.min(1, Math.max(0, done / total)) : 0;
  const filled = Math.floor(ratio * 12);
  const jobs = status.jobs.pending + status.jobs.running + status.jobs.failed;
  const state = !status.enabled ? "Disabled" : status.lastError === "BACKGROUND_PAUSED" ? "Paused"
    : status.jobs.failed || status.jobs.expired ? "Blocked" : jobs || done < total || !status.inventoryComplete ? "Preparing" : "Settled";
  return `${state}\nMessages: [${"#".repeat(filled)}${"-".repeat(12 - filled)}] ${done}/${total}${status.inventoryComplete ? "" : " (inventory incomplete)"}\nJobs: ${jobs} unfinished, ${status.jobs.done} completed\nJob error: ${status.jobError ?? "none"}\nProvider retry: ${status.retryInSeconds === undefined ? "none scheduled" : `${status.retryInSeconds}s (retry ${status.retryAttempt ?? 0}/3)`}\nCounts cover retained history. New history and derived jobs can increase totals.`;
}

function baseIndicator(status: MemoryStatus): StatusIndicator {
  if (!status.enabled) return { text: "OptChat: off", tone: "muted" };
  if (status.nativeTurns) {
    const preparation = status.jobs.failed ? "failed" : status.jobs.running ? `preparing ${status.jobs.running}`
      : status.jobs.pending && status.lastError === "BACKGROUND_PAUSED" ? "paused" : status.jobs.pending ? `queued ${status.jobs.pending}` : "";
    return { text: `OptChat: native${preparation ? ` · ${preparation}` : ""}`, tone: "warning" };
  }
  if (status.jobs.failed || status.jobs.expired) return { text: "OptChat: error", tone: "error" };
  if (status.jobs.running) return { text: `OptChat: processing ${status.jobs.running}`, tone: "warning" };
  if (status.jobs.pending && status.lastError === "BACKGROUND_PAUSED") return { text: "OptChat: paused", tone: "warning" };
  if (status.jobs.pending) return { text: `OptChat: queued ${status.jobs.pending}`, tone: "warning" };
  if (status.activeTurns) return { text: "OptChat: active", tone: "success" };
  return { text: "OptChat: ready", tone: "success" };
}

export function createStatusReader<Location>(options: {
  location: () => Location | undefined;
  read: (location: Location, signal: AbortSignal) => Promise<MemoryStatus>;
  update: (indicator: StatusIndicator) => void;
}) {
  let disposed = false;
  let pending = false;
  let controller: AbortController | undefined;
  return {
    async refresh() {
      if (disposed || pending) return;
      const location = options.location();
      if (!location) {
        options.update({ text: "OptChat: unavailable", tone: "muted" });
        return;
      }
      const key = JSON.stringify(location);
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 4000);
      try {
        const status = await options.read(location, controller.signal);
        if (!disposed && key === JSON.stringify(options.location())) options.update(statusIndicator(status));
      } catch {
        if (!disposed && key === JSON.stringify(options.location())) {
          options.update({ text: "OptChat: unavailable", tone: "muted" });
        }
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    },
    dispose() {
      disposed = true;
      controller?.abort();
    },
  };
}
