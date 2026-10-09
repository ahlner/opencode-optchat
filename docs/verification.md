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

## Limits of the evidence

The private package and lifecycle integration still uses a controlled local model.
The real host test establishes one concrete two-session semantic case after the documented corrections.
It does not establish a general recall or hallucination rate.
We did not run a repeated baseline benchmark with isolated, merged, and OptChat sessions.

These tests do not certify other OpenCode versions or external organization policy engines.
The conservative budget does not require provider-specific tokenizers.
Those tokenizers could improve budget use.
SQLite search work remains data-dependent despite bounded result materialization and pagination.
