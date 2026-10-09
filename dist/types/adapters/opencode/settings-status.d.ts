export interface MemoryStatus {
    enabled: boolean;
    databaseExists: boolean;
    sessions: number;
    originals: number;
    summaries: number;
    publications: number;
    activeTurns: number;
    nativeTurns?: number;
    jobs: {
        pending: number;
        running: number;
        expired: number;
        failed: number;
        done: number;
        revoked: number;
    };
    lastError?: string;
}
export declare function memoryStatus(database: string, enabled: boolean): MemoryStatus;
export declare function retryMemoryJobs(database: string): void;
