export declare function diagnosticCode(error: unknown): string;
export declare class Diagnostics {
    private counters;
    private maxBytes;
    readonly path: string;
    private fd?;
    private sequence;
    private closed;
    private spans;
    private timer;
    constructor(database: string, counters?: () => Record<string, number>, intervalMs?: number, maxBytes?: number);
    private counts;
    emit(event: string, details?: Record<string, unknown>): void;
    private readonly runId;
    begin(phase: string, details?: Record<string, unknown>): {
        operationId: number;
        end: (error?: unknown) => void;
    };
    span<T>(phase: string, work: () => Promise<T>, details?: Record<string, unknown>): Promise<T>;
    close(): void;
}
