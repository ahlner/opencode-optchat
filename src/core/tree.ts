import { insist, type Node } from "./types.ts";

export function rangeCover(start: number, end: number): { start: number; count: number }[] {
  insist(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start, "INVALID_RANGE", "Expected a nonnegative safe half-open range");
  const result = [];
  while (start < end) {
    let count = 1;
    while (count <= (end - start) / 2 && start % (count * 2) === 0) count *= 2;
    result.push({ start, count }); start += count;
  }
  return result;
}
export function validateCover(nodes: Pick<Node, "start" | "count">[], start: number, end: number) {
  for (const n of nodes) {
    insist(n.start === start && Number.isSafeInteger(n.count) && n.count > 0 && Number.isInteger(Math.log2(n.count)) && n.start % n.count === 0, "INTEGRITY", "Invalid, overlapping or gapped frontier");
    start += n.count;
  }
  insist(start === end, "INTEGRITY", "Frontier does not cover its boundary");
}
