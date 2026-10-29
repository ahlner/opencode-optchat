import { insist } from "../../core/types.ts";

// The adapter supports the OpenCode 2.0.x, 2.1.x, and 2.2.x plugin contracts.
// A newer minor can change plugin payloads, so the adapter rejects it.
const supportedHost = /^2\.(?:0|1|2)\.\d+$/;

export function insistSupportedHost(version: string): void {
  insist(supportedHost.test(version), "UNSUPPORTED_HOST", "OptChat supports OpenCode 2.0.x, 2.1.x, and 2.2.x only");
}
