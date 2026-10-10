import { Store } from "../storage/store.ts";
import { type Summarizer } from "../compactor/summarizer.ts";
import { type Node, type Outcome, type Session, type Snapshot, type SourceInput, type SourceRecord, type Turn, type View } from "./types.ts";
interface Scope {
    id: string;
    epoch: number;
    policy: number;
    highWater: number;
}
export declare function evidenceInput(record: SourceRecord): string;
export interface EngineOptions {
    high: number;
    low: number;
    chunkBytes: number;
    leaseMs: number;
    broadcastSubagents: boolean;
    maxRunningJobs: number;
    parentBatchSize: number;
    leafBatchSize: number;
    compactEvidence: boolean;
    jobEvent?: (event: string, details: {
        jobId: string;
        kind: string;
        fence: number;
        leaseUntil: number;
        errorCode?: string;
        sourceId?: string;
        tree?: string;
        start?: number;
        count?: number;
        batchSize?: number;
    }) => void;
}
export declare class Engine {
    readonly store: Store;
    readonly summarizer: Summarizer;
    readonly options: EngineOptions;
    constructor(store: Store, summarizer?: Summarizer, options?: Partial<EngineOptions>);
    scope(id: string): Scope;
    register(id: string, scopeId: string, projectId: string, parentId?: string): Session;
    session(id: string): Session;
    sources(sessionId: string, generation: number): SourceRecord[];
    private sourceCount;
    source(id: string): SourceRecord;
    node(id: string): Node;
    findNode(tree: string, start: number, count: number): Node | undefined;
    view(tree: string): View;
    preparationStatus(sessionId: string): {
        boundary: number;
        prefix: number;
        pending: number;
        running: number;
        failed: number;
        failures: {
            jobId: string;
            kind: string;
            attempt: number;
            errorCode: string;
        }[];
    };
    admit(sessionId: string, id: string): Turn;
    validateSnapshot(snapshot: Snapshot): void;
    append(input: SourceInput): SourceRecord;
    stage(input: SourceInput): void;
    sealStaged(sessionId: string, generation: number, eventKey: string): SourceRecord;
    finish(sessionId: string, id: string, outcome: Outcome, completedAt?: string): Turn;
    private schedulePublications;
    private writeNode;
    private summarizeFull;
    private workEvidenceBatch;
    private leafInput;
    private parentInput;
    workOne(signal?: AbortSignal): Promise<boolean>;
    drain(max?: number, signal?: AbortSignal): Promise<void>;
    retryFailed(): void;
    recoverRejectedBatches(scopeId: string): number;
    recoverProviderFailures(scopeId: string): number;
    private recoverFailed;
    repairInvalidSummaries(scopeId: string): number;
    markInherited(sessionId: string, id: string): void;
    projection(view: View, budget: number): Node[];
    ownView(snapshot: Snapshot): View;
    retire(sessionId: string, mode: "edit" | "delete", preserve?: number, retainPublications?: boolean): void;
}
export {};
