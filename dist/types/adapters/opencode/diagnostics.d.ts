export declare function diagnosticCode(error: unknown): string;
export declare class Diagnostics {
    private counters;
    private maxBytes;
    private captureContent;
    private maxContentBytes;
    readonly path: string;
    readonly contentPath: string;
    private fd?;
    private contentFd?;
    private sequence;
    private closed;
    private spans;
    private timer;
    constructor(database: string, counters?: () => Record<string, number>, intervalMs?: number, maxBytes?: number, captureContent?: boolean, maxContentBytes?: number);
    content(event: "compactor.request" | "compactor.response", details: {
        requestId: string;
        jobId?: string;
        parentId?: number;
        model?: {
            providerID: string;
            id: string;
        };
        prompt?: string;
        response?: string;
    }): void;
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
