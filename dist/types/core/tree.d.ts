import { type Node } from "./types.ts";
export declare function rangeCover(start: number, end: number): {
    start: number;
    count: number;
}[];
export declare function validateCover(nodes: Pick<Node, "start" | "count">[], start: number, end: number): void;
