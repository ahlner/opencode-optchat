import { type Kind } from "../../core/types.ts";
export interface RawMessage {
    id: string;
    type: string;
    time: {
        created: number | string | Date;
        completed?: unknown;
    };
    [k: string]: unknown;
}
export interface Extracted {
    key: string;
    kind: Kind;
    payload: string;
    timestamp: string;
    callId?: string;
    truncated?: boolean;
}
export declare function extract(message: RawMessage): Extracted[];
export declare const fingerprint: (message: RawMessage) => string;
export declare const contentFingerprint: (message: RawMessage) => string;
export declare function retainedMessage(message: RawMessage): RawMessage;
export declare function liveSuffix<T extends {
    id?: string;
}>(messages: T[], activeIds: Set<string>): T[];
