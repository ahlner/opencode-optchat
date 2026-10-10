export interface MemoryCandidate {
    database: string;
    scopeId: string;
    sessions: number;
    publications: number;
    modified: number;
}
export declare function memoryRoot(): string;
export declare function memoryCandidates(root: string, currentDatabase: string): MemoryCandidate[];
export declare function adoptMemory(sourceDatabase: string, targetDatabase: string, targetScopeId: string): number;
