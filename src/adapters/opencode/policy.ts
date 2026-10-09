import { hash, key } from "../../core/types.ts";
interface Rule { action: string; resource: string; effect: string }
const matches = (pattern: string, value: string) => new RegExp(`^${Array.from(pattern).map(p => p === "*" ? ".*" : p === "?" ? "." : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("")}$`).test(value);
// Explicit scope membership is the default grant. Ordered native denies can revoke it.
export function memoryPolicy(rules: readonly Rule[], scopeId: string) {
  const allowed = (action: string) => {
    let grant = true;
    for (const rule of rules) if (matches(rule.action, action) && matches(rule.resource, scopeId)) grant = rule.effect === "allow";
    return grant;
  };
  const read = allowed("optchat.read"), share = allowed("optchat.share");
  return { read, share, digest: hash(key(read, share)) };
}
