# Verification

## Opt-in compactor content diagnostics

Content capture remains disabled by default and requires a separate confirmation in the terminal dialog.
The capture file contains the exact SDK compactor prompt and visible answer text.
It excludes provider objects, hidden reasoning, headers, and configured credentials.
User-supplied secrets can remain inside captured originals.

Request IDs correlate prompts, answers, job IDs, model identifiers, and metadata phases.
Leaf claim metadata includes source identifiers and tree coordinates.
The metadata log remains free of payloads, including when content capture is enabled.
Cancellation or provider failure can leave a request without an answer.

Tests cover consent, default inactivity, exact Unicode text, private file permissions, symlink rejection, rotation, and oversized-entry omission.
The deterministic suite passed 93 tests with 11,923 assertions. TypeScript and documentation checks passed.

The packed host lifecycle passed 23 groups in `optchat-integration-jrZpjH` with 125 loopback requests.
The packed settings and recovery test passed 25 groups in `optchat-integration-7NXIie` with 73 loopback requests.
The settings test also checked captured native SDK requests and answers with matching request and job identifiers.
The dependency audit passed for 428 installed package instances with no third-party bundle sources.
The native terminal test passed six groups in `optchat-tui-fRBfAK` without model calls.

These tests use private fixtures. No user configuration or existing conversation changed, and no real-provider calls ran.

## Lossless preparation optimization

The adapter stores complete inputs locally when they fit within the existing 512-byte summary limit.
It does not clip text, change originals, or bypass publication and lease transactions.
Existing immutable summaries remain unchanged.

A deterministic comparison uses the same 16 records and the same model response.
Model-only preparation requires 32 calls. Lossless preparation requires two calls and creates 30 local nodes.
Both paths retain every original and publish the recorded failed outcome once.
Boundary tests cover 512 UTF-8 bytes, oversized Unicode input, and cancellation before local processing.

The optimized private host lifecycle test passed 23 groups with 124 loopback requests.
Its diagnostics are in `optchat-integration-8NRzu2` under the reported temporary directory.
The packed managed settings test passed 25 groups with 73 loopback requests in `optchat-integration-l47vhG`.
These request counts include primary requests, not only compactor calls.
They do not establish a fixed cost reduction for arbitrary archives or real providers.

The first managed test expected a cancelled leaf job specifically.
Local processing completed that leaf before the held model request.
The test now injects failure into the actual pending dependency, regardless of its node type.
The cancellation, retry, retained-data, and native-input checks remain unchanged.

The deterministic suite passed 90 tests with 11,903 assertions.
TypeScript, documentation, packed exports, the consumer type check, and the dependency license audit passed.
No real-provider evaluation ran for this optimization. Real archive savings remain unmeasured.

## Native input during incomplete preparation

The operator reported that enabled memory prevented ordinary input from reaching the model.
Earlier deadline and recovery corrections did not remove summary generation from primary admission.
This correction separates new-turn mode selection from background summary generation.

New turns inspect host metadata for at most one second and generate no summaries during admission.
Unavailable memory selects explicit native mode with unchanged own messages and tool pairs.
That mode removes memory tools and adds a fixed unavailable notice.
It never exposes partial shared memory or changes mode during a continuation.
An already admitted memory turn instead retains its snapshot and stops if validation fails.

This is a deliberate difference from the paper's strict admission-stop policy.
Native mode does not claim complete OptChat coverage or cross-session awareness.
Background work can still incur costs and pause after repeated stalls.

Verification completed with these results:

- `bun run check`: 87 tests, 11,878 assertions, TypeScript checks, and nine original Markdown files passed.
- Packed-package exports and TypeScript consumer passed.
- Packed lifecycle integration passed 23 groups with 276 loopback requests in `optchat-integration-mpRplj`.
- Packed settings integration passed 25 groups with 157 loopback requests in `optchat-integration-qAhkxM`.
- Native TUI passed six checks without model calls in `optchat-tui-EqcOxf`.
- License checks passed for 428 installed package instances without bundled third-party source files.

The settings fixture holds summary responses while ordinary requests complete successfully.
It also checks native input with failed dependencies, independent background recovery, and preserved originals through cold native compaction and forks.
The unit tests check stable native continuations and prohibit fallback from an already admitted memory turn.

The authorized managed-service test used `edenai/databricks/databricks-gpt-5-4-mini` in two new sessions.
It seeded native history before activation and held auxiliary summaries during a continuation.
The continuation completed in 942 milliseconds with its own history, an unavailable notice, and no memory tools.
After complete preparation, a separate turn retrieved the exact original tool result from the other session.
It returned retry value `92126`, failure code `E_TEST_513ff29f9e`, counts `23/0`, and proposal `P_513ff29f9e` as unimplemented.

Saved reports are in `optchat-real-host-oJjEhR/cold-report.json` and `optchat-real-host-oJjEhR/report.json` under the reported private temporary directory.
The report observed 23 completed summary calls and three primary calls for the retrieval turn.
These counts do not establish total cost or general semantic accuracy.
The test did not alter existing user sessions or configuration.

The first real trial, `optchat-real-host-beBA3e`, passed its blocked-preparation continuation in 919 milliseconds.
Its later session started before all preparation finished, correctly remained native, and answered `unknown` instead of inventing shared facts.
The unchanged semantic verifier rejected that answer.
The harness now waits for complete preparation before testing a separate memory-enabled turn.

Cold native compaction first failed because the loopback model returned text without the host's required summary headings.
The fixture now returns the required native structure.
This does not relax original retention, fork isolation, or semantic source checks.

These controlled tests reproduce blocked auxiliary work, not the operator's entire individual session.
Real diagnostic logs remain necessary to confirm the updated behavior in that session.

## Admission cancellation after a reported session hang

The operator reported activity without a primary response after enabling the plugin in an existing session.
Read-only logs showed settings writes rejected with `SETTINGS_BUSY`.
Source inspection identified a deadline that rejected the caller without cancelling serialized preparation.
This establishes a code defect, not the complete cause of the operator's individual session failure.

The correction propagates cancellation through host waits, summary calls, chunk processing, and serialized admission.
Cancelled claims return to the pending queue only if their fence still matches.
Late results cannot commit. No original or completed summary is deleted.
The regression fixture includes 24 historical turns and a provider that ignores cancellation.
It checks bounded failure, unchanged request content, available settings, discarded late results, and successful retry.

Verification completed with the following results:

- `bun run check`: 73 tests, 11,726 assertions, TypeScript checks, and nine original Markdown files passed.
- Packed public exports and the TypeScript consumer passed.
- The private host passed 23 lifecycle groups with 275 loopback requests.
- Managed settings passed 15 groups with 57 loopback requests, including slow preparation cancellation and resumed admission.

Lifecycle diagnostics: `/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-0f6yE7`.
Settings diagnostics: `/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-RjYHJr`.
The tests did not change the operator's service, configuration, sessions, or memory database.

Initial historical reconciliation still runs before primary admission.
This correction does not establish acceptable large-session startup latency or a bounded total initialization cost.
Providers can charge for requests already submitted before cancellation.

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

## Metadata-only diagnostic logging

The owner reported apparent inactivity and requested logs from a real session.
Session size alone does not establish the cause of that behavior.
The new logger records queue waits, native API boundaries, ingestion, job ownership, model waits, and context assembly.
Five-second heartbeats record active phases, job counters, and event-loop delay.
Startup entries identify the loaded module by its SHA-256 hash.

Deterministic tests check these properties:

- A pending host request produces waiting entries and elapsed times.
- Event-loop blocking produces a heartbeat delay.
- Original payloads and raw provider errors do not enter the log.
- Files use mode `0600` and retain one bounded rotated backup.
- Concurrent runtimes reopen the current file after another runtime rotates it.
- Symlink destinations do not receive log writes.
- Observer failures do not change worker results.
- Cancelled model work logs claim release and the sanitized admission error.

`bun run check` passed TypeScript checks and 76 tests with 11,756 assertions.
The private packed-plugin test passed all 23 lifecycle groups and 15 settings groups.
The settings fixture also checked actual diagnostic model boundaries, claim release, admission failure, and payload exclusion.
The native terminal test passed six checks without model calls.
The dependency audit passed for 428 installed package instances with no bundled third-party source.

The packed test retained these private diagnostic directories:

```text
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-sZPByF
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-AXuwSA
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-tui-nrdbFm
```

The settings log recorded model waits, cancelled claims, and matching installed-module hashes.
After adding queue-to-session correlations, `bun run test:settings` passed all 15 groups again.
That final run retained `/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-NdvCZp`.
These tests do not establish the cause of the owner's session failure.
The real-session trace remains necessary for that diagnosis.
No existing user session, configuration, service, credential, or memory database changed during these tests.

## Real incident: blocked preparation and legacy project metadata

The owner's diagnostic trace showed repeated admission failures without model requests or runnable jobs.
Heartbeats continued with small delays. This did not show a blocked event loop or establish a mutex deadlock.
Four failed jobs remained during that trace.

A later read-only database snapshot showed no retained originals and only revoked jobs.
Two disabled reasons identified a closed database error and a legacy project identifier mismatch.
The failed job errors were no longer available after retirement.
We created a private snapshot before inspection. We did not modify the owner's database or service.

The correction changes these behaviors:

- Required failed jobs stop preparation with `COMPACTION_FAILED`, rather than repeated readiness polling.
- A missing prefix without a producer reports `MEMORY_STALLED` and retains originals.
- Reconciliation drains recovered jobs before admitting the next historical turn.
- Host transport and database shutdown errors retain originals as operational failures.
- Exact legacy shutdown-disable records can recover through fresh host and permission checks.
- Legacy `global` project metadata can change only within the verified original automatic scope and native location.
- Real permission denials and unverified scope changes remain blocked.
- Diagnostics include prefix boundaries, failed job categories, and hashed scope mismatches without payloads.

The crash test exposed another stall: an unexpired claim survived its worker's death.
Schema version 2 records claim owners and fences confirmed dead-process jobs before reclaiming them.
Live process claims and unknown legacy owners remain protected.
Deterministic tests kill a child worker and check recovery before lease expiry without stealing a live peer's claim.

The first packed regression run still failed after restart.
Its trace showed a pending job that reconciliation never drained before the next historical admission.
The drain-before-admission correction resolved that reproduced loop in the subsequent packed run.
The native legacy-project test seeds old adapter metadata. It does not claim to reproduce a native project identifier change.

`bun run check` passed TypeScript checks and 81 tests with 11,825 assertions.
The corrected packed-plugin run passed 23 lifecycle groups and 18 settings and recovery groups.
The private test directories were:

```text
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-9dKG2s
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-By1Nlf
```

A separate repetition passed all 18 settings and recovery groups in `optchat-integration-doduF1`.

These tests used loopback model fixtures. They made no billable provider calls.
The owner's next trace must confirm recovery in the affected real session.
The adapter cannot recreate previously deleted originals unless authorized host history or retained checkpoints still contain them.

## Automatic continuation after a preparation deadline

The owner's next trace showed durable progress followed by a pending job with no running worker.
The status bar called that state `processing 1` because it added pending and running jobs.
Later agent activity restarted preparation. This identified an event-dependent continuation gap, not proof of a mutex deadlock.

The enabled adapter now checks pending preparation once per second through its serialized queue.
It skips live worker claims and failed jobs.
New primary requests interrupt the background attempt before starting their own bounded preparation.
Three consecutive attempts without durable progress persist a background pause.
Workers update the shared counter atomically, and the counter survives runtime replacement.

Native events cannot bypass that pause. Confirmed retry clears it without deleting originals.

The status bar now separates `queued N`, claimed `processing N`, and `paused`.
Claimed processing does not establish provider responsiveness.
Background requests can incur costs. Durable progress resets the stall limit, so this is not a total archive cost bound.

Deterministic tests check timer continuation, live-worker exclusion, failed-job exclusion, consecutive stall limits, primary preemption, and shutdown cancellation.
They also check pause reporting, confirmed pause removal, and retained original payloads.
`bun run check` passed TypeScript checks and 86 tests with 11,857 assertions.
The dependency audit passed for 428 installed package instances with no bundled third-party source.

The packed-plugin run passed 23 lifecycle groups and 23 settings and recovery groups.
Its private diagnostic directories were:

```text
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-TOEDVg
/var/folders/jk/j_v56v3540gfn6l0gxk0rcg40000gn/T/optchat-integration-EcnSsg
```

The native test holds a model response until preparation reaches its deadline.
It then permits responses without sending a new prompt, agent event, or retry request.
The background timer completes the retained publication.
A separate case kills a worker with an unexpired claim and completes its publication after restart without another prompt.

Another case holds all responses until three automatic attempts pause.
The pause survives a forced service exit and a native permission event, with no additional model requests.
Confirmed retry resumes preparation and preserves originals.
The native terminal test passed six checks with no model calls in `optchat-tui-rEFqgZ`.

These tests used private OpenCode services and loopback models. They made no billable provider calls.
No existing user session, configuration, service, credential, or memory database changed.
The owner's next trace must confirm the correction in the affected session.
