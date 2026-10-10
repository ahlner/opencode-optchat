import { Database } from "bun:sqlite";
import { type Job, type JobInput } from "../core/types.ts";
export declare class Store {
    readonly db: Database;
    private readonly owner;
    constructor(path?: string);
    transaction<T>(fn: () => T): T;
    get<T>(bucket: string, id: string): T | undefined;
    set(bucket: string, id: string, value: unknown): void;
    remove(bucket: string, id: string): void;
    all<T>(bucket: string): T[];
    enqueue(input: JobInput): string;
    claim(now?: number, leaseMs?: number, maxRunning?: number): Job | undefined;
    owns(job: Job): boolean;
    claimParentPeers(anchor: Job, limit: number, leaseMs: number, start: number, end: number): Job[];
    claimLeafPeers(anchor: Job, limit: number, leaseMs: number, start: number, end: number): Job[];
    private claimEvidencePeers;
    renew(job: Job, leaseMs: number, now?: number): boolean;
    recoverLease(job: Job, leaseMs: number, now?: number, maxRunning?: number): boolean;
    release(job: Job): boolean;
    fail(job: Job, error: unknown): void;
    close(): void;
}
