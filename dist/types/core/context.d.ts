import { Engine } from "./engine.ts";
import { type Snapshot } from "./types.ts";
export interface ModelBudget {
    contextTokens: number;
    outputTokens: number;
    safetyTokens: number;
    memoryBytes: number;
}
export interface ContextInput<T> {
    system: unknown[];
    tools: unknown;
    live: T[];
    snapshot: Snapshot;
    budget: ModelBudget;
    countTokens?: (value: unknown) => number;
}
export declare const conservativeTokens: (value: unknown) => number;
export declare function assembleContext<T>(engine: Engine, input: ContextInput<T>): {
    system: unknown[];
    messages: T[];
    memory: string;
    tokenUpperBound: number;
};
