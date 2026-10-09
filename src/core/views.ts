import { bytes, insist, type Node, type View } from "./types.ts";
import { validateCover } from "./tree.ts";
export const escapeData = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export const renderNode = (n: Node) => `${n.id} | ${escapeData(n.text)}\n`;
export const renderedBytes = (nodes: Node[]) => nodes.reduce((n, node) => n + bytes(renderNode(node)), 0);

export function mergeView(view: View, get: (id: string) => Node, find: (start: number, count: number) => Node | undefined, high: number, low: number): View {
  insist(low >= 0 && high > low, "CONFIG", "View requires 0 <= L < H");
  let nodes = view.nodes.map(get);
  validateCover(nodes, 0, view.prefix);
  let shrinking = view.shrinking || renderedBytes(nodes) > high;
  while (shrinking && renderedBytes(nodes) > low) {
    const candidates: { index: number; parent: Node; priority: number }[] = [];
    for (let i = 0; i + 1 < nodes.length; i++) {
      const a = nodes[i], b = nodes[i + 1];
      if (a.count !== b.count || a.start + a.count !== b.start || a.start % (2 * a.count)) continue;
      const parent = find(a.start, a.count * 2);
      if (!parent || renderedBytes([parent]) >= renderedBytes([a, b])) continue;
      candidates.push({ index: i, parent, priority: (view.prefix - b.start - b.count) / a.count });
    }
    candidates.sort((a, b) => b.priority - a.priority || a.parent.start - b.parent.start);
    if (!candidates.length) break;
    const best = candidates[0]; nodes.splice(best.index, 2, best.parent);
  }
  if (renderedBytes(nodes) <= low) shrinking = false;
  return { ...view, nodes: nodes.map(n => n.id), shrinking };
}
export function project(view: View, get: (id: string) => Node, find: (start: number, count: number) => Node | undefined, budget: number): Node[] {
  if (!view.prefix) return [];
  const merged = mergeView(view, get, find, Math.max(1, budget), Math.max(0, budget - 1));
  const nodes = merged.nodes.map(get);
  insist(renderedBytes(nodes) <= budget, "MEMORY_NOT_READY", "No durable covering projection fits the request budget");
  return nodes;
}
