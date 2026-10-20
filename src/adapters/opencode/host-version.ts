import { insist } from "../../core/types.ts";

// A newer minor can change the plugin payloads, so the adapter rejects it.
const supportedHost = /^2\.(?:0|1)\.\d+$/;

export function insistSupportedHost(version: string): void {
  insist(supportedHost.test(version), "UNSUPPORTED_HOST", "OptChat supports OpenCode 2.0.x and 2.1.x only");
}
