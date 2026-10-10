# Compatibility and implementation status

## Tested environment

- macOS arm64.
- Bun 1.4.2.
- OpenCode 2.0.26.
- Official V2 plugin API and the exact pinned `@opencode/plugin` dependency.
- Private OpenCode service processes with a local OpenAI-compatible model fixture.

The adapter rejects other OpenCode versions explicitly.
The tests do not establish support for other operating systems or providers.

## Support matrix

| Case | Evidence |
| --- | --- |
| New prompt in a root session | Private host integration |
| Tool continuations with a fixed snapshot | Core tests and actual protocol pairs |
| Shared memory without mixed transcripts | Captured model requests |
| Search, zoom, and source tools | Actual sessions |
| Completed and interrupted turns | Actual terminal events and publications |
| Failed turn | Core tests and an actual provider failure with a failed publication |
| Restart and duplicates | Core tests and private service recovery after forced process exit |
| Deletion | Core tests and actual host session deletion |
| Later foreign publication during an active turn | Core snapshot isolation tests |
| Fork | Checked prefix, no inherited publication, and independent retention after parent deletion |
| Fork after a worktree move | Original provenance and payload hashes of every copied record |
| Compacted fork | Independent checkpoint, restart, and parent deletion |
| Subagent child | Local execution and history without broadcast |
| Native compaction | Original checkpoint, repeated compaction, and restart |
| Edit or rewind | Core prefix migration and actual partial rewind. The adapter rejects uncertain changes |
| Session move or worktree change | Actual move with stable project identity and old/new source provenance |
| Scope or permission revocation | Core epochs, native agent/session rules, and revocation during an active turn |
| Oversized active turn | Explicit stop before the primary host model call. No cut tool pairs |
| Long history | Core fixture above ten context windows, bounded request, and exact retrieval |
| Real summary quality | A real two-session host case passed. No repeated baseline benchmark |
| Git package installation | Public GitHub package, fresh isolated cache, compiled root export, and full private host lifecycle |
| TUI settings | Native terminal dialog, private settings RPC, activation, persistence, and controlled budget changes |
| Memory status and retry | Read-only health counts, native status dialog, confirmed retry, and active-turn rejection |
| Lease recovery after suspension | Event-loop blocking, unchanged-fence recovery, stale-worker rejection, and retention revocation |
| Slow preparation cancellation | Non-cooperative model fixture, released claims, available settings, and resumed native admission |
| Automatic preparation continuation | Timer resumes a released job without another native prompt or event. Failed jobs require confirmed retry |
| Cold existing-session input | Native mode preserves own history while summaries remain unavailable. Admission does not generate summaries |
| Compactor parent batches | Checked item IDs, independent size limits, batch cancellation, retention fences, and actual host requests |
| Invalid cached summaries | Derived-memory reconstruction retains originals and unaffected publication order |

Support applies only to the checked V2 boundaries.
The adapter rejects a foreign compaction marker without an original checkpoint.
It also rejects a fork whose original mapping it cannot determine.
It does not replace native tool permissions or external organization policy engines.

## Plan milestones

| Milestone | Status |
| --- | --- |
| M0: pinned host probe | Context, direct tools, terminal boundaries, and basic mapping complete |
| M1: durable store and ingestion | Implemented with deterministic tests |
| M2: trees, publications, and views | Implemented with deterministic tests |
| M3: snapshots, retrieval, and scopes | Implemented with SQL authorization before pagination and native memory rules |
| M4: two actual sessions with automatic injection | Host integration passed |
| M5: model compactor and lifecycle | Compactor, lease renewal, checkpoints, forks, partial retention, children, permissions, and worktrees implemented |
| M6: installation, support matrix, and evaluation | JavaScript, types, local archive, package consumer, and host integration complete. Repeated real benchmarks require authorization |

The project did not publish to a public registry.
A paid evaluation requires explicit authorization for its endpoint.
The evaluation harness passed tests with a loopback model.
That fixture does not establish semantic quality.
See [verification](verification.md) for the separate real host case.

## Host boundaries

The host can call `prompt` repeatedly before admission.
The adapter selects native or memory mode at the first primary `context` hook.
Memory mode fixes a complete snapshot. Native mode exposes no OptChat tools or shared summaries.
The selected mode remains fixed through all continuations of that turn.

Original message identifiers and host idle boundaries identify the active segment.
The adapter retains the complete suffix, including tool results without message identifiers.

Event subscriptions do not replay past events.
After restart, the adapter reconciles known sessions with the host and its checkpoints.
Missing or changed originals identify the first affected turn boundary.
The adapter revokes that suffix and preserves the unchanged prefix.

The V2 interface provides `session.context`.
The used domain does not provide a complete replay API for original events.
The adapter therefore stores originals before native compaction.
A synthetic host summary never replaces originals.
The adapter explicitly stops compaction within an admitted memory turn.
Native-mode compaction can use the host summarizer while durable checkpoints retain originals.

Forks receive independent original copies of an exactly checked prefix.
New host message identifiers are permitted.
Changed public content is not permitted.
Inherited history remains local and does not produce repeated publications.

## Extension criteria

For each new lifecycle feature:

1. Create a reproducible host probe for the pinned version.
2. Define an unambiguous mapping for original records and generations.
3. Test snapshot revocation, search, and source access.
4. Test protocol and isolation with captured requests.
5. Test crash recovery.
6. Update the support matrix.

A model quality claim requires repeated real runs, controlled fixtures, and manual outcome review.
Fixture success alone is not sufficient.
