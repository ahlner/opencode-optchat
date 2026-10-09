export declare function compactorRequest<T>(generate: (signal: AbortSignal) => Promise<T>, waitMs: number, sleep?: (ms: number, signal: AbortSignal) => Promise<void>): Promise<T>;
