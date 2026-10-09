import { Engine } from "./engine.ts";
import { type Snapshot } from "./types.ts";
export declare class Retrieval {
    readonly engine: Engine;
    constructor(engine: Engine);
    private visible;
    private authorized;
    private sourceAllowed;
    zoom(snapshot: Snapshot, id: string, offset?: number, limit?: number): {
        sourceId: string;
        children: never[];
        next: null;
    } | {
        sourceId?: undefined;
        children: {
            id: string;
            text: string;
            start: number;
            count: number;
            sourceId: string | undefined;
            publicationId: string | undefined;
        }[];
        next: number | null;
    };
    source(snapshot: Snapshot, id: string, offset?: number, maxBytes?: number): {
        sourceId: string;
        text: string;
        next: number | null;
        metadata: {
            sessionId: string;
            generation: number;
            seq: number;
            kind: import("./types.ts").Kind;
            turnId: string;
            timestamp: string;
            payloadHash: string;
            truncated: boolean;
            callId: string | undefined;
            projectId: string;
            worktreeId: string | undefined;
            commit: string | undefined;
            inheritedFrom: {
                sessionId: string;
                generation: number;
                seq: number;
            } | undefined;
        };
    };
    search(snapshot: Snapshot, query: string, offset?: number, limit?: number): {
        hits: ({
            id: string;
            type: string;
            kind: import("./types.ts").Kind;
            sessionId: string;
            text: string;
        } | {
            id: string;
            type: string;
            text: string;
        })[];
        next: number | null;
    };
}
