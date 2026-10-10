export interface RecoveryState {
    pending: number;
    running: number;
    expired: number;
    failed: number;
    progress: number;
    paused: boolean;
    attempts?: number;
}
export declare function createRecoveryLoop(options: {
    snapshot: () => RecoveryState;
    busy: () => boolean;
    run: (signal: AbortSignal) => Promise<void>;
    pause: (errorCode: string) => void;
    reset: () => void;
    completed?: (madeProgress: boolean) => void;
    intervalMs?: number;
    maxStalls?: number;
}): {
    tick: () => void;
    interrupt(): void;
    dispose(): Promise<void>;
};
