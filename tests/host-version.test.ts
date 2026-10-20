import { expect, test } from "bun:test";
import { insistSupportedHost } from "../src/adapters/opencode/host-version.ts";

test("the adapter accepts the supported OpenCode host versions", () => {
  for (const version of ["2.0.0", "2.0.26", "2.0.99", "2.1.0", "2.1.1", "2.1.42"]) {
    expect(() => insistSupportedHost(version)).not.toThrow();
  }
});

test("the adapter rejects every other OpenCode host version", () => {
  for (const version of ["1.9.9", "2.2.0", "2.1", "2.1.0-rc1", "3.0.0", "", "v2.1.0"]) {
    expect(() => insistSupportedHost(version)).toThrow("UNSUPPORTED_HOST");
  }
});
