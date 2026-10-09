export type Outcome = "completed" | "interrupted" | "failed";
export type Kind = "user" | "assistant" | "tool_call" | "tool_result" | "report";
export interface SourceInput {
    sessionId: string;
    generation: number;
    eventKey: string;
    turnId: string;
    kind: Kind;
    timestamp: string;
    payload: string;
    projectId: string;
    worktreeId?: string;
    commit?: string;
    callId?: string;
    truncated?: boolean;
    inheritedFrom?: {
        sessionId: string;
        generation: number;
        seq: number;
    };
}
export interface SourceRecord extends SourceInput {
    seq: number;
    payloadHash: string;
}
export interface Session {
    id: string;
    scopeId: string;
    projectId: string;
    generation: number;
    disabled?: string;
    broadcast?: boolean;
    parentId?: string;
}
export interface Node {
    id: string;
    tree: string;
    start: number;
    count: number;
    text: string;
    inputs: string[];
    children: string[];
    source?: string;
    publicationId?: string;
    model: string;
    promptVersion: string;
    bytes: number;
    fallback: boolean;
}
export interface Publication {
    id: string;
    scopeId: string;
    publicationSeq: number;
    sessionId: string;
    generation: number;
    turnId: string;
    start: number;
    end: number;
    outcome: Outcome;
    completedAt: string;
    publishedAt: string;
    sourceCover: string[];
    nodeId: string;
}
export interface View {
    tree: string;
    revision: number;
    prefix: number;
    nodes: string[];
    shrinking: boolean;
}
export interface Snapshot {
    id: string;
    scopeId: string;
    epoch: number;
    policy: number;
    highWater: number;
    view: View;
    sessionId: string;
    generation: number;
    ownBoundary: number;
}
export interface Turn {
    id: string;
    sessionId: string;
    generation: number;
    start: number;
    end?: number;
    outcome?: Outcome;
    completedAt?: string;
    snapshot: Snapshot;
    inherited?: boolean;
}
export type JobInput = {
    type: "leaf";
    tree: string;
    start: number;
    source: string;
} | {
    type: "parent";
    tree: string;
    start: number;
    count: number;
    children: string[];
} | {
    type: "publication";
    turnKey: string;
    scopeId: string;
    cover: string[];
};
export interface Job {
    id: string;
    input: JobInput;
    status: string;
    fence: number;
    leaseUntil: number;
    attempts: number;
}
export declare class MemoryError extends Error {
    code: string;
    constructor(code: string, message: string);
}
export declare function insist(condition: unknown, code: string, message: string): asserts condition;
export declare const bytes: (text: string) => number;
export declare const hash: (text: string) => string;
export declare const key: (...parts: unknown[]) => string;
export declare const sessionTree: (sessionId: string, generation: number) => string;
export declare const sharedTree: (scope: string, epoch: number) => string;
export declare const sourceKey: (r: Pick<SourceRecord, "sessionId" | "generation" | "seq">) => string;
export declare const turnKey: (t: Pick<Turn, "sessionId" | "generation" | "id">) => string;
