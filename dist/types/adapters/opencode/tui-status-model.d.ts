import type { MemoryStatus } from "./settings-status.ts";
export interface StatusIndicator {
    text: string;
    tone: "muted" | "success" | "warning" | "error";
}
export declare function statusIndicator(status: MemoryStatus): StatusIndicator;
export declare function createStatusReader<Location>(options: {
    location: () => Location | undefined;
    read: (location: Location, signal: AbortSignal) => Promise<MemoryStatus>;
    update: (indicator: StatusIndicator) => void;
}): {
    refresh(): Promise<void>;
    dispose(): void;
};
