# Verification

Review date: 9 October 2026.
Runtime: Bun 1.4.2.
Host: OpenCode 2.0.26.

## Completed checks

| Check | Result before the documentation language change |
| --- | --- |
| `bun install --frozen-lockfile` | Installation passed without lockfile changes |
| `bun run check` | TypeScript passed. All 42 tests and 11,554 assertions passed |
| `bun run test:coverage` | Loaded modules reached 94.62% line coverage. All tests passed |
| `bun run test:package` | Archive, public runtime exports, TypeScript consumer, and actual host integration passed |
| Packaged host integration | 23 check groups and 276 captured model requests |

The deterministic run covered all lines in the core modules and SQLite storage.
It covered 61.90% of adapter lines.
The private host integration also checks native adapter lifecycle paths.
The coverage report does not include those separate host processes.

## Documentation language change

The repository now uses English for original documentation.
The writing guide defines ASD-STE100 rules, technical terms, and explicit exceptions.
`AGENTS.md` requires these rules for future changes.

| Check after the language change | Result |
| --- | --- |
| `bun run test:docs` | Selected structural checks passed for eight Markdown files |
| `bun run check` | TypeScript passed. All 46 tests and 11,569 assertions passed |
| `bun run test:coverage` | Loaded modules reached 93.85% line coverage. All tests passed |
| `bun run audit:licenses` | Installed inventory and bundle source checks passed |
| `bun run test:package` | Packaged documentation, exports, types, and 23 host check groups passed |

The new coverage total includes the documentation checker.
Core and storage line coverage remain at 100%.
The documentation check does not certify official ASD-STE100 dictionary compliance.

## Public repository preparation

The owner requested a public GitHub repository and inclusion of the implementation paper.
The archive retains the supplied paper byte for byte.
The documentation and package checks verify its SHA-256 hash.
The documentation check now discovers original Markdown files in nested directories.

| Check before the initial push | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Installation passed without lockfile changes |
| `bun run check` | TypeScript passed. All 47 tests and 11,572 assertions passed |
| `bun run test:docs` | Selected structural checks passed for nine original Markdown files |
| `bun run audit:licenses` | All 288 installed instances passed the inventory check |
| `bun run test:package` | Original paper, documentation, exports, types, and 23 host check groups passed |
| Packaged host integration | 273 captured requests to the controlled local model |

The repository excludes private diagnostics, credentials, databases, dependencies, and generated build files.

## Checked boundaries

- Automatic evidence across sessions without foreign conversation messages in the live transcript.
- Source, search, and zoom access within the registered turn snapshot only.
- Complete tool call/result pairs in captured host requests.
- Publication deduplication and recovery after forced exit of the private service.
- Accurate completed, failed, and interrupted outcomes with the original host completion time.
- Repeated native compaction, original checkpoints, and restart.
- Regular and compacted forks without repeated inherited publication.
- Independent fork retention after parent deletion and original provenance across worktree moves.
- Private subagent sessions, partial rewinds, and stable native project identity.
- Native agent/session rules, read/share revocation, and interruption of an active turn.
- Explicit stop of an oversized active turn before the primary model call.
- Concurrent SQLite workers, lease renewal, fencing, and bounded waiting for complete summary coverage.
- Exact dyadic coverage, 512-byte limits, UTF-8 pages, and archives above ten context windows.
- Deletion of originals, derived data, search data, and owned checkpoints.
- No import of unknown sessions from foreign locations through server-wide events.
- Preservation of originals and retryable jobs after a compactor failure.

The package run after this language change stored host diagnostics here:

```text
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-2cjqXA
```

These files are temporary local diagnostics.
They do not belong in the repository and can contain private service data.

## Real model in the existing OpenCode service

The user authorized real model calls.
The test used the configured default model, `edenai/greenference/glm-5.3-flash`, for answers and compaction.
The test did not read or copy credentials.
Global configuration and existing sessions remained unchanged.

The passing two-session report is here:

```text
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-real-host-tLBqIx/report.json
```

Session B did not receive a copied dialogue from A.
It used two search calls and one source read within three primary model steps.
It read A's original `tool_result` and reported these facts correctly:

- `OPTCHAT_RETRY_WINDOW_MS=88852`.
- Error code `E_TEST_3b7f0e3ec8`.
- 23 passing tests and zero test failures.
- A proposal that remained unimplemented.

The session actually read the cited source identifier.
The offline check observed 47 summary calls.
This count is not a complete cost report.

There were four development runs, not four successful benchmark trials:

1. The first run exposed oversized summaries and an adapter defect.
   Compactor failures incorrectly deleted memory.
   Retry and retention tests now protect the corrected behavior.
2. The second run returned correct facts but used Markdown and invalid summary identifiers as original citations.
   It failed the test.
   Tool descriptions now distinguish phrase search, summaries, and originals explicitly.
3. The third run returned a numeric value as a string and added commentary to the error field.
   It cited only A's answer instead of the original tool result.
   It failed the stricter source and format checks.
4. The fourth run read the correct original and returned all facts correctly.
   The initial harness rejected only `bun` instead of `Bun`.
   The offline check now ignores only runtime-name case.
   Values, error codes, status, and original citations remain exact checks.
   The original failure report remains beside the passing offline report.

The test questions do not contain the random target values or error codes.
The deployment failure is controlled fixture evidence, not a real deployment.
The test sessions remain available for diagnosis.

## Git distribution preparation

The package now exports the OpenCode plugin by default.
The standalone engine uses `opencode-optchat/core`.
Git retains the compiled JavaScript and declarations. Installation does not require a build hook.
`bun run check:dist` rebuilt those files without changes.

`bun run check` passed 48 tests with 11,590 assertions and the TypeScript check.
The local archive passed its runtime exports, declaration consumer, and 23 private host integration groups.
The license audit found no bundled third-party source.
These checks do not establish support for an untested host version.

The first fresh-cache Git attempt failed during dependency preparation.
The `build` script triggered that preparation in the pinned host.
Renaming the development command to `compile` removed the trigger.
The next installation of `github:ahlner/opencode-optchat#main` passed all 23 integration groups.
The host loaded the compiled root entry from its isolated Git package cache.
The test did not use a local adapter wrapper or user configuration.

The distribution test imports compiled modules separately from source modules.
The unit coverage report now includes those compiled copies.
It reports 82.56% line coverage and 84.45% function coverage across loaded modules.
The core source and storage modules retain 100% line coverage.
Private host integration runs separately from the unit coverage process.

Branch-test diagnostics:

```text
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-2KxgfW
```

The full-commit installation also passed all 23 integration groups with a fresh cache.
The tested package specification was:

```text
github:ahlner/opencode-optchat#8726f4456dc8e7218f92863c1a701c4c5cc8aea1
```

Two preliminary pinned attempts failed in the harness before plugin setup.
The harness needed to start Location services and use the endpoint's nested query format.
The corrected harness starts those services without a model call before the first prompt.
It then checks the actual Git cache entry in the private host log.
The local archive also passed all 23 groups after these distribution changes.

Pinned Git and local archive diagnostics:

```text
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-rYYBf9
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-Evw50d
```

## Terminal settings

The settings implementation passed TypeScript checks and 54 tests with 11,625 assertions.
The tests check inactive installation, model validation, active-turn rejection, persistence, rollback, and runtime disposal.
Dialog tests check Location routing, cost confirmation, and cancellation without saving.

The packed plugin passed all 23 lifecycle integration groups and 10 managed-settings groups.
Settings checks use a private host and a loopback model.
They cover activation, context injection, retrieval, crash recovery, persistent settings, disable without deletion, and budget changes.

A private macOS pseudo-terminal opened the native palette and settings dialog without submitting a model prompt.
Its fixture uses the same conditional TUI export shape as the package.
The public Git revision `ca6473f` also opened the native settings dialog from a fresh private cache.
That test used the Git package directly, without the local wrapper.
It submitted no model prompts.

Both the public branch and revision passed all 23 lifecycle groups in fresh private hosts.
One earlier branch attempt reached the installation timeout before plugin setup.
Its Git cache directory remained empty. The repeated branch installation passed without a source change.

Unit coverage reports 84.98% lines and 86.60% functions across loaded source and compiled modules.
The settings controller reports 93.33% line coverage. The dialog controller reports 100% line coverage.
Private host and terminal tests run outside that unit coverage process.

Local directory resolution differs from Git resolution in the pinned host.
An initial directory-only fixture did not load the plugin.
The local terminal fixture therefore uses an explicit wrapper package.

Packed lifecycle, managed settings, and terminal diagnostics:

```text
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-rYGG9f
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-CgS9pD
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-tui-3q90Sh
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-tui-h24WvI
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-vR4q6J
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-WJyLQ6
```

## Lease suspension regression and memory status

A reported `COMPACTION_FAILED` error contained `LEASE_LOST: Compactor lease expired`.
The previous intermediate commit checked lease expiry without recovering an unchanged fence.
The previous final commit also retained a renewal failure even after later successful renewal.
These checks could reject work after suspension or timer delays.
The report alone does not establish which delay or competing worker occurred on the user's host.

The correction refreshes an unchanged running fence atomically before intermediate and final commits.
A superseded or revoked worker discards its result without failing the replacement job.
Tests block the event loop beyond the lease, replace a worker, and delete originals during a model call.
The tests check that no stale result becomes visible.

The terminal status reports counts and queue health without original payloads.
Confirmed retry requeues failed jobs without deleting memory or creating duplicate publications.
It rejects active turns. Later processing can incur model costs.

The updated code passed 58 tests with 11,645 assertions and TypeScript checks.
The packed plugin passed 23 lifecycle and 12 settings integration groups.
The native terminal opened the status dialog without a model prompt.
These tests did not activate or inspect the user's removed plugin.

The public Git revision `54239bc65fcf117b551dce47b8c97b0ffea9fed6` also passed the native status dialog and all 23 lifecycle groups.
Both tests used fresh private caches. The terminal test made no model calls.

Diagnostics:

```text
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-1WLJXO
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-YjG7Rc
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-tui-IzO9Aw
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-tui-5IIrBT
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-g2xRsw
```

## Limits of the evidence

### Agent reconciliation readiness regression

An operator reported repeated `SESSION_DISABLED` prefixes around an agent reconciliation `MEMORY_NOT_READY` error.
The adapter previously treated readiness as an uncertain original mapping and retired history.
It also replaced an existing disable reason with each later reconciliation error.

The correction records readiness and other temporary admission conditions without retiring history.
An existing disable reason remains unchanged across later events.
Startup removes only the exact known false readiness disable.
It still checks current native permissions, scope, originals, and checkpoints before admission.
The correction cannot recreate previously retired originals without an authorized retained source.

Regression tests hold a source job in another worker during agent, permission, and terminal events.
They check unchanged originals, generation, snapshots, and lease fences.
After release, admission summarizes both completed turns and resumes without mixed transcripts.
Recovery tests preserve permission revocations and unknown checkpoint mappings.

The corrected code passed 60 tests with 11,659 assertions and TypeScript checks.
Packed exports, TypeScript types, 23 native lifecycle groups, and 12 managed settings groups passed.
The lifecycle diagnostics are in `/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-VbOhy4`.
The settings diagnostics are in `/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-CSHx0f`.

### Managed service retest after the readiness correction

The operator requested a test with the actual configured OpenCode instance.
Four new two-session trials used the existing 2.0.26 service and enabled remote models.
Each trial used its own temporary project, database, and test sessions.
Existing sessions, global configuration, and credentials remained unchanged.

The first trial used `edenai/greenference/glm-5.3-flash`.
The provider reported that the model was temporarily unavailable.
The database retained originals and generation zero without permanently disabling the session.
This trial did not complete the semantic test.

The second trial used `edenai/mistral/devstral-small-latest`.
Session A published evidence. Session B searched and expanded summaries but passed a summary ID to the original-source tool.
The bounded trial failed before a valid final answer.

The third trial used `edenai/databricks/databricks-gpt-5-4-mini`.
Its final facts matched the fixture, but it read a tool call and user message instead of the original tool result.
The unchanged verifier rejected the trial.

The fourth trial used the same GPT model and passed the exact original-result requirement.
Tool descriptions now explain leaf `sourceId`, tool-result kinds, and searches for result identifiers or `callId`.
The test request names the fixed search identifier but does not supply random values, error codes, or proposal identifiers.
The harness permits 12 primary context attempts per session and retains its 80-summary-call limit.

Session B read the original tool result from A with `optchat_search` and `optchat_source`.
It reported retry value `80710`, failure code `E_TEST_3394ce71d8`, and proposal `P_3394ce71d8` as not implemented.
It also reported Bun, 23 passed checks, and zero failed checks.
The verifier checked all values, the read-original citation, and foreign transcript isolation.
Session B used three primary context calls. The report observed 13 summary calls at verification time.

A native agent-selection request and another message in B also completed successfully with the real model.
The follow-up retained all 15 existing originals, generation zero, and an enabled session.
Its separate `continuation-report.json` records those checks.
This test did not force the competing-worker readiness race on the managed service.
The deterministic held-lease regression remains the evidence for that exact race.

The corrected test harness passed 61 deterministic tests with 11,663 assertions and TypeScript checks.
The packed plugin passed all 23 private lifecycle groups and 12 managed settings groups.
The private integration model remains a loopback fixture, separate from these real-provider trials.

Diagnostics, in trial order, followed by the packed integration directories:

```text
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-real-host-9CMx0z
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-real-host-k5tDPv
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-real-host-2FqvKc
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-real-host-gFryNS
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-BkkkQi
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-oiO0rb
```

The private package and lifecycle integration still uses a controlled local model.
The real host test establishes one concrete two-session semantic case after the documented corrections.
It does not establish a general recall or hallucination rate.
We did not run a repeated baseline benchmark with isolated, merged, and OptChat sessions.

These tests do not certify other OpenCode versions or external organization policy engines.
The conservative budget does not require provider-specific tokenizers.
Those tokenizers could improve budget use.
SQLite search work remains data-dependent despite bounded result materialization and pagination.
