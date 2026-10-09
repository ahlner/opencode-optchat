# OptChat implementation guide

## Scope

This repository implements an OptChat memory engine and a pinned OpenCode V2 adapter.
Use Bun for installation, scripts, tests, SQLite, and runtime execution.
Do not use npm, pnpm, yarn, or the Node executable.
Imports from `node:` use Bun's compatible built-in modules.

The current adapter supports OpenCode **2.0.26** only.
Do not describe this implementation as production-ready or fully compliant with the paper.
Read `README.md` and `docs/compatibility.md` before changing the adapter.
Read `docs/design.md` before changing storage or authorization.

## Language and documentation

The user prefers German conversation and English repository content.
Continue to answer the user in German unless the user requests another language.
Write all original repository documentation, comments, tool descriptions, and messages in English.
Use ASD-STE100 writing rules for all new or changed documentation.
Read `docs/writing-guide.md` before writing repository text.
Load the `asd-ste100` skill when it is available.

- Use one instruction per sentence.
- Limit instructions to 20 words and descriptions to 25 words.
- Use active voice, simple tenses, and consistent project terms.
- Do not use semicolons in prose.
- Preserve uncertainty, conditions, limits, and source attribution.
- Keep legal license texts, external quotations, identifiers, and intentional Unicode test data unchanged.
- Keep intentional language-rejection fixtures unchanged.
- Do not translate retained user conversation data.
- Define necessary technical terms in the project glossary.
- Do not claim certified ASD-STE100 compliance without an official dictionary review.
- Run `bun run test:docs` after documentation changes.

The automated check covers selected structural rules, not complete ASD-STE100 compliance.

## Commands

```sh
bun install --frozen-lockfile
bun run check
bun run test:coverage
bun run test:integration
bun run test:package
bun run test:docs
bun run demo
```

`check` runs TypeScript checks and the deterministic core tests.
`test:integration` requires the `opencode` executable at version 2.0.26.
The integration script starts a private service and a loopback model fixture.
The script does not use the user's service, configuration, credentials, or database.
The script keeps diagnostic files in its reported temporary directory.
Do not publish those files without checking their contents.

`test:package` checks a local packed archive, public exports, TypeScript types, and the same private host integration.
The integration deliberately kills only its own private service to verify crash recovery.
`build` produces JavaScript and declarations in `dist`. `pack` creates a local archive without registry publication.

`evaluate` calls a real model only when the operator supplies evaluation environment variables.
Do not run a billable evaluation without explicit authorization.
Lexical benchmark checks do not prove semantic correctness.

`OPTCHAT_REAL_TEST=1 bun run test:real` uses the configured default model in the managed service.
Run it only after the user authorizes real model calls.
It creates new test sessions in a separate temporary Location. It does not read credentials or edit global configuration.
`scripts/verify-real-host.ts` checks saved diagnostics offline and makes no model calls.
Read `docs/verification.md` for the real-model results and failed development attempts.

## File map

- `src/core/types.ts`: data types, identities, errors, UTF-8 lengths, hashes.
- `src/storage/store.ts`: SQLite schema, transactions, FTS indexes, job leases.
- `src/core/tree.ts`: exact dyadic range covers and frontier validation.
- `src/core/engine.ts`: ingestion, turn admission, summaries, publication, retention.
- `src/core/views.ts`: rendering, hysteresis, temporary projection.
- `src/core/context.ts`: request assembly and model budgets.
- `src/core/retrieval.ts`: snapshot authorization, search, zoom, source pages.
- `src/compactor/summarizer.ts`: deterministic fixture and bounded model summarizer.
- `src/adapters/opencode/transcript.ts`: original-record extraction and active transcript boundary.
- `src/adapters/opencode/policy.ts`: ordered native Memory rule matching.
- `src/adapters/opencode/plugin.ts`: pinned host integration, reconciliation, hooks, tools.
- `tests/core.test.ts`: deterministic invariants, failure tests, SQLite concurrency.
- `scripts/integration.ts`: captured requests from an actual private OpenCode service.
- `scripts/package-test.ts`: local archive, public exports, types, and packed-plugin integration.
- `scripts/spike.ts`: initial hook and tool protocol probe.
- `scripts/admin.ts`: status, failed-job retry, confirmed memory retirement.
- `scripts/evaluate.ts`: opt-in isolated/merged/OptChat model comparison.
- `scripts/docs-check.ts`: selected documentation structure and language checks.
- `scripts/license-audit.ts`: local dependency license inventory and bundle source checks.
- `docs/writing-guide.md`: repository writing rules and technical glossary.

## Required invariants

1. Retain complete structured original payloads that the host exposes.
2. Never store hidden reasoning or private provider state.
3. Seal records once with a stable event key and revision.
4. Reject a changed payload that reuses an existing event key.
5. Keep every summary at or below **512 UTF-8 bytes**.
6. Reject oversized summaries. Never cut their bytes to make them fit.
7. Keep summaries immutable. Keep source and child references outside generated text.
8. Cover each committed prefix without gaps or overlaps.
9. Publish completed, failed, and interrupted turns with their actual outcomes.
10. Keep model calls outside SQLite transactions.
11. Check the lease fence before any worker commits its result.
12. Commit a publication and its shared view in one transaction.
13. Pin each admitted turn's snapshot through all tool continuations.
14. Check registered snapshot contents, not only the snapshot ID.
15. Authorize sources before generating snippets or applying search pagination.
16. Never expose foreign records outside published snapshot ranges.
17. Preserve the complete active tool-call/result protocol.
18. Never put another session's messages in the current conversational transcript.
19. Count instructions, tools, memory, and live messages in the request budget.
20. Reserve output and safety tokens. Do not estimate tokens as bytes divided by four.
21. Use temporary projections without changing the canonical view.
22. Return an explicit error if complete memory cannot fit.
23. Revoke snapshots and derived shared memory when retention changes.
24. Do not publish child or fork history without a verified inheritance policy.

## Adapter rules

Use the V2 documentation at `https://opencode.ai/v2/docs/`.
Use the installed 2.0.26 declarations to check the pinned implementation.
Do not infer V2 behavior from V1 documentation or the generic config schema.

The `prompt` hook is not an exactly-once turn admission boundary.
The adapter pins a turn at the first primary `context` hook.
OpenCode model messages contain IDs. Tool result messages can lack IDs.
Remove historical messages only at a verified active transcript boundary.
Never remove individual tool parts to reduce the context size.

Direct memory tools require `options: { codemode: false }`.
The adapter uses `ctx.generate.text` for summaries. This API does not create session messages.
Its model request uses the configured compactor model.
The primary output option is `maxTokens`, not `maxOutputTokens`.

Event subscriptions are live-only. They do not replay events after a restart.
Subscriptions are server-wide. Do not import unknown sessions from another Location's events.

Compactor failures are operational errors. Preserve originals and failed jobs for retry.
Do not retire history or treat an operational error as an unverified lifecycle mapping.

Reconcile known sessions against the host before pinning another shared snapshot.
The adapter currently requires host idle markers and retained message IDs.

Native compaction uses versioned durable original checkpoints, selected by completed host markers.
Never overwrite a committed checkpoint when a later compaction attempt fails.

Forks require an exact verified public prefix. Host message IDs can change.
Keep fork copies and checkpoint aliases independent from the parent.
Never publish inherited turns. Keep subagent children private.

Edits and committed rewinds retire the affected turn and its suffix.
Keep unchanged prefix publications in their original publication order.
Moves within a stable host project preserve history and original worktree provenance.

Native Memory authorization combines agent rules, then session rules. The last matching rule wins.
Treat `deny` and `ask` as revocation. Read revocation removes memory data.
Share revocation retains private originals and removes publications.

Commit policy changes, generation migration, and checkpoint migration atomically.
Interrupt an active turn on policy changes. Never repin a continuation under the new policy.
Disable sessions only when the original or authorization mapping cannot be verified.
Do not silently continue with an uncertain retention state.

## Safe changes

Check git status before edits.
Preserve changes that another session or the user made.
Do not modify the user's OpenCode service or configuration during tests.
Do not inspect the user's credentials.
Do not delete host transcripts to repair OptChat memory.

Stop the service before administrative memory retirement.
Require confirmation for memory retirement.

Use graph discovery when a matching graph project exists.
The original implementation session found no matching graph project for this repository.
Check the current project list before relying on that old observation.
Use source inspection when graph coverage is absent or incomplete.
Do not start subagents unless the user or an applicable instruction requests delegation.

## Next work

- Add provider-specific tokenizers and serialization overhead checks. Keep the conservative default safe.
- Add data-dependent SQLite query time measurements for very large archives.
- Extend captured tests to additional host versions before relaxing the version pin.
- Verify organization-level external policy integration separately from native agent/session rules.
- Add a durable host-event replay mechanism if a future host exposes one.
- Run authorized repeated real-model evaluations. Record costs, lag, and outcome fidelity.

Do not mark a lifecycle feature supported until its captured-request integration tests pass.
