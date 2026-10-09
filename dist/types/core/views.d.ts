import { type Node, type View } from "./types.ts";
export declare const escapeData: (s: string) => string;
export declare const renderNode: (n: Node) => string;
export declare const renderedBytes: (nodes: Node[]) => number;
export declare function mergeView(view: View, get: (id: string) => Node, find: (start: number, count: number) => Node | undefined, high: number, low: number): View;
export declare function project(view: View, get: (id: string) => Node, find: (start: number, count: number) => Node | undefined, budget: number): Node[];
