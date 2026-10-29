# Changelog

## 0.1.4 — 2026-10-29

- Add support for OpenCode 2.2.x and pin the plugin API to 2.2.0.
- Use `experimental.generate.text` when available. Retain `generate.text` for older hosts.
- Preserve the package checks from version 0.1.3.
- Refresh the installed dependency license inventory.


The corrected macOS terminal fixture passed six checks on OpenCode 2.2.0 with OpenTUI 0.7.0.
The earlier fixture did not recognize status text across terminal updates.
The native dialog remains unverified on OpenCode 2.2.1.

## 0.1.3 — 2026-10-20

- Add support for OpenCode 2.1.x. A private host integration tested OpenCode 2.1.1 on Linux x64.
- Pin the OpenCode plugin and theme packages to 2.1.1.
- Update the terminal package pins for the OpenCode 2.1.1 peer requirements.
- Accept temporary provider retries from the adapter or host in the integration fixture.
- Keep the OpenCode 2.0.x compatibility path.

These tests do not establish production readiness or model answer quality.
