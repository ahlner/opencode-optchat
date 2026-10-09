import { Database } from "bun:sqlite";
import { type Job, type JobInput } from "../core/types.ts";
export declare class Store {
    readonly db: Database;
    constructor(path?: string);
    transaction<T>(fn: () => T): T;
    get<T>(bucket: string, id: string): T | undefined;
    set(bucket: string, id: string, value: unknown): void;
    remove(bucket: string, id: string): void;
    all<T>(bucket: string): T[];
    enqueue(input: JobInput): string;
    claim(now?: number, leaseMs?: number): Job | undefined;
    owns(job: Job): boolean;
    renew(job: Job, leaseMs: number, now?: number): boolean;
    fail(job: Job, error: unknown): void;
    close(): void;
}
