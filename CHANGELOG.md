# Changelog

## 0.1.4 — 2026-10-29

- Add support for OpenCode 2.2.x and pin the plugin API to 2.2.0.
- Use `experimental.generate.text` when available. Retain `generate.text` for older hosts.
- Preserve the package checks from version 0.1.3.
- Refresh the installed dependency license inventory.


The macOS terminal fixture on OpenCode 2.2.1 did not display the OptChat status indicator.
The native terminal dialog remains unverified. Private settings RPC checks remain separate.

## 0.1.3 — 2026-10-20

- Add support for OpenCode 2.1.x. A private host integration tested OpenCode 2.1.1 on Linux x64.
- Pin the OpenCode plugin and theme packages to 2.1.1.
- Update the terminal package pins for the OpenCode 2.1.1 peer requirements.
- Accept temporary provider retries from the adapter or host in the integration fixture.
- Keep the OpenCode 2.0.x compatibility path.

These tests do not establish production readiness or model answer quality.
