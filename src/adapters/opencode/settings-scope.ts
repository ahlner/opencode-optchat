import { homedir } from "node:os";
import { hash } from "../../core/types.ts";
import { realpathSync } from "node:fs";

export function automaticScope(projectId: string, canonical?: string): string {
  return `local:${hash(JSON.stringify([homedir(), projectId, projectId === "global" ? canonical : undefined]))}`;
}

export function sameDirectory(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  try { return realpathSync(left) === realpathSync(right); } catch { return false; }
}
