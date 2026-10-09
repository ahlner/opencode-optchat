# OptChat for OpenCode

OptChat uses Bun to manage memory across OpenCode sessions.
Each session retains its own original records.
The adapter shares summaries of completed, failed, and interrupted turns within the configured scope.

**Tests use Bun 1.4.2 and OpenCode 2.0.26. The adapter rejects other host versions.**
These tests do not certify production use or guarantee correct model answers.

## Installation from Git

OpenCode installs this plugin directly from GitHub.
You do not need an npm account, a local clone, a build command, or a wrapper package.
The repository includes the compiled plugin and its type declarations.
Dependencies can still require package-registry downloads. This project does not publish to npmjs.com.

### CLI installation and TUI settings

```sh
opencode plugin add github:ahlner/opencode-optchat#main
```

1. Open your project in OpenCode 2.0.26.
2. Open the command palette with `Ctrl+P`.
3. Select **OptChat settings**.
4. Select a compactor model from your enabled models.
5. Enable memory.
6. Select **Save settings** and confirm the data processing and possible model costs.

You can also use `/optchat-settings`.
The plugin starts inactive. Installation alone does not retain conversations or call a model.

The server creates a private database path and scope for the current user and stable project.
The dialog also controls the memory budget, safety reserve, and admission wait.
Settings persist on the server and survive restarts. They do not contain provider credentials.

Finish or interrupt active turns before changing settings.
Changes apply without a service restart.
Disabling pauses the adapter. It does not delete originals or revoke previously published memory.
Use the confirmed administrative retirement command when you need deletion.
Database and scope identifiers remain fixed in this dialog to prevent accidental trust-boundary changes.

### Memory status and recovery

The terminal status bar shows OptChat on the home screen and in sessions.
It reads the current Location's server status every five seconds while visible.
The indicator does not start compaction or make model calls.

- `off`: Memory ingestion is disabled.
- `ready`: OptChat is enabled with no active turns or pending jobs.
- `active`: At least one memory turn is active.
- `processing N`: The compactor has N pending or running jobs.
- `error`: At least one compactor job failed or has an expired lease.
- `unavailable`: The status request failed or no Location is available.

The indicator gives failed or expired jobs priority over active processing.
It ignores historical error codes when no failed or expired jobs remain.
It does not certify summary accuracy or session authorization.

Open **OptChat settings** and select **Show memory status**.
The status shows retained originals, summaries, publications, active turns, and compactor jobs.
Expired running jobs and failed jobs appear separately.
The status does not expose original payloads or certify summary accuracy.

Finish or interrupt active turns before selecting **Retry failed compaction**.
Confirm the possible model costs.
This action requeues failed jobs and preserves originals.
Processing resumes on the next session reconciliation. It does not activate a disabled adapter.

The adapter permits one unexpired compactor job per database, across worker connections.
It retries explicit rate limits at most three times after the initial request.
Retry delays increase from one to four seconds and respect longer provider delays up to 30 seconds.
The requests and delays share one `waitMs` deadline.
Other model errors still leave failed jobs for operator review.

Summaries must still fit 512 UTF-8 bytes.
These limits reduce request bursts. They do not guarantee a completion time for large archives.

The lease fix recovers an expired lease only when its fence remains unchanged.
A worker that another worker or retention change replaced discards its result.
It does not fail the replacement job or publish stale evidence.

`MEMORY_NOT_READY` means that required durable summaries are missing.
The adapter waits within the admission deadline instead of permanently disabling the session.
If the deadline expires, the request stops without deleting its history.
Startup recovers the exact readiness error that earlier versions incorrectly stored as a permanent disable.
Permission revocations and uncertain original mappings remain blocked.
Recovery cannot recreate originals that neither the host nor a retained checkpoint exposes.

### Diagnostic logging

Active adapters automatically write `<database>.diagnostics.ndjson` beside their database.
**Show memory status** displays the server-side file path.
No setting change is necessary after installing this version.
Inactive installations do not create a diagnostic file.

The log records these operations:

- Queue entry, queue wait, operation start, completion, cancellation, and elapsed time.
- Native session and agent requests, history counts, ingestion, and context assembly.
- Compactor job claims, fences, initial leases, completion, release, and ownership loss.
- Model request boundaries, input and output byte counts, and rate-limit backoff.
- Five-second heartbeats, active waiting phases, event-loop delay, and job counters.

Entries contain timestamps, process IDs, run IDs, operation IDs, session IDs, and sanitized error codes.
The startup entry includes the module hash to identify cached plugin code.
The log excludes prompts, originals, summaries, tool arguments, credentials, and raw provider errors.

Each file uses mode `0600`.
The logger rotates near two MiB and retains one previous file with suffix `.1`.
Logging failures do not fail a session.
Inspect both files when an operation crosses a rotation or restart.

A waiting phase identifies the local operation that has not completed.
It does not prove a deadlock or identify a remote provider's internal state.
Heartbeat gaps can indicate event-loop blocking, process suspension, or process termination.
Logs contain private activity metadata. Review them before sharing them publicly.

### Existing sessions and preparation limits

Enabling memory in an existing session can require many summary calls before the first primary model request.
Current reconciliation still processes historical turns before admission.
The adapter does not yet provide a separate preparation workflow with a model-call budget and progress controls.
Do not treat installation success or small-session tests as evidence of acceptable large-session startup latency.

The admission deadline now cancels local preparation waits and sends an abort signal to the provider.
Cancelled jobs return to the pending queue through their matching fences.
Completed originals and summaries remain stored. Late provider responses cannot commit cancelled results.
A provider can still charge for an already submitted request despite cancellation.
The deadline does not guarantee that the archive will fit the memory budget on the next attempt.

### Explicit configuration

Use explicit options when you need a custom database path or trust scope.
Explicit options take precedence. The TUI does not overwrite them.

1. Use OpenCode 2.0.26.
2. Add the following entry to your project `opencode.jsonc`.
3. Preserve existing configuration entries.
4. Replace the database path, scope identifier, and model identifiers.
5. Open the project in OpenCode.
6. Wait for the memory tools before you send the first prompt.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:ahlner/opencode-optchat#main",
      "options": {
        "database": "/ABSOLUTE/PATH/private-directory/memory.sqlite",
        "scopeId": "USER-ID:STABLE-PROJECT-ID",
        "compactorModel": { "providerID": "YOUR-PROVIDER", "id": "YOUR-MODEL" },
        "memoryBytes": 16000,
        "safetyTokens": 2048,
        "waitMs": 30000
      }
    }
  ]
}
```

OpenCode installs missing Git packages in the background.
Check that `optchat_search`, `optchat_source`, and `optchat_zoom` are available.
Do not send prompts while the plugin installation remains pending.
Use a full commit hash instead of `main` when you need a fixed revision.
An unpinned branch can change. Check updates before you install them.

Do not add a second project entry when the CLI already installed the plugin globally.

See [configuration](#configuration) for model, scope, and permission requirements.

## Features

- SQLite transactions, write-ahead logging (WAL), durable jobs, leases, and fencing.
- Complete structured original records, stable event keys, and a core staging interface for streaming data.
- Binary session trees and publication trees. Each summary contains at most 512 UTF-8 bytes.
- Exact turn coverage, stored frontiers, high/low thresholds, and temporary budget projections.
- Turn snapshots, scope isolation, and authorized search, zoom, and source pages.
- Automatic memory injection through the OpenCode `context` hook.
- Complete active tool protocols and unchanged user interface (UI) transcripts.
- A configurable compactor model that does not create extra session messages.
- Restart recovery, publication deduplication, retention revocation, and deletion.
- Native compaction with durable original checkpoints.
- Checked fork prefixes, no repeated inherited publication, and independent fork retention.
- Partial rewinds, private subagent sessions, and stable project identity across worktrees.
- Native agent and session rules for memory access. Revocation can interrupt an active turn.

The adapter does not change the UI transcript.
An uncertain boundary, missing checkpoint, or oversized active turn causes an explicit error.
The adapter never cuts the active tool protocol to fit a budget.
See [compatibility](docs/compatibility.md) for the tested limits.
See the [glossary](docs/writing-guide.md#project-terms) for project terms.

## Design specification

The repository includes the unchanged [implementation paper](docs/paper/OptChat-Multi-Session-Paper.md).
See its [provenance and license note](docs/paper/README.md).
The paper defines proposed requirements. It does not claim the implementation's measured results.

## Develop and test

```sh
bun install --frozen-lockfile
bun run check
bun run test:coverage
bun run test:integration
bun run test:package
bun run test:git
bun run test:settings
bun run test:tui
bun run demo
```

The integration test starts a private OpenCode service and a local model fixture.
The settings test uses the same private service without explicit plugin options.
The TUI test uses a private macOS pseudo-terminal and does not submit model prompts.
It does not use user configuration, credentials, or an existing database.
Its temporary files contain test requests and private service diagnostics.
Do not publish these files without checking their contents.

The deterministic tests check structure, authorization, and archives larger than ten context windows.
The integration test checks outgoing model requests, memory tools, and the native session lifecycle.
The package test extracts the local archive.
It checks public exports and types.
It then tests the distributed JavaScript with the private host.
These tests do not use paid models.

See [verification](docs/verification.md) for results and limits.

### Local development and core imports

Run `bun run compile` after source changes.
Commit the generated `dist` files with their source changes.
Git installations do not execute build scripts.
Run `bun run check:dist` to check that committed build files match the source.
`bun run pack` creates a local archive without registry publication.

Use `test:integration` to check a local server build.
Use `test:tui` to check the local terminal build through an isolated fixture package.
Local directory loading can differ from Git package loading in the pinned host.
The default package export is the OpenCode plugin.
Import the standalone memory engine from `opencode-optchat/core`.
The `opencode-optchat/plugin` entry remains available.

`test:git` installs the public Git revision in an isolated host with a fresh cache.
Set `OPTCHAT_GIT_PACKAGE` to test another Git revision.
The test uses a loopback model and does not change user configuration.

## Configuration

Use an existing configured model with known context and output limits.
Use `fakeSummarizer: true` only for local tests.
The fixture replaces large inputs with an explicit hash reference.
It does not produce semantic summaries.

`scopeId` defines a trust boundary.
Use the same identifier only for sessions that may share their content.
Do not use branch names or worktree paths as scope identifiers.
The optional `projectId` sets an explicit stable project identifier.
Without this option, the adapter uses OpenCode's `projectID`.

Use one adapter database for each scope.
The adapter binds the database to its first scope identifier.
This prevents another scope's worker from sending its jobs to a different configured provider.

### Memory permissions

The configured scope supplies the initial grant to share memory.
The adapter then evaluates native agent rules, followed by session rules.
The last matching rule determines access.
Both `deny` and `ask` revoke the matching memory permission.
The following example allows reading and denies sharing:

```jsonc
"permissions": [
  { "action": "optchat.read", "resource": "USER-ID:STABLE-PROJECT-ID", "effect": "allow" },
  { "action": "optchat.share", "resource": "USER-ID:STABLE-PROJECT-ID", "effect": "deny" }
]
```

`optchat.share: deny` retains private originals and revokes the session's publications.
`optchat.read: deny` also revokes private memory data and stops an active request.
Subagent children never publish their own turns through this adapter.
Forks receive independent copies of their checked prefixes.
Later deletion of the parent does not delete these copies.

This repository does not activate the adapter in your current OpenCode configuration.
It does not change existing user sessions.

## Operate the store

SQLite stores all retained original records locally.
The compactor receives authorized historical content through the configured OpenCode provider connection.
Use a provider that your confidentiality policy permits.

```sh
bun run admin status /ABSOLUTE/PATH/memory.sqlite
bun run admin retry /ABSOLUTE/PATH/memory.sqlite
```

A failed job never becomes an invented summary.
`retry` schedules another attempt.
The configured adapter executes that attempt during the next request.

To delete a session's OptChat memory:

1. Stop the service that uses the database.
2. Replace the database path and session identifier.
3. Run the confirmed deletion command.

```sh
bun run admin forget /ABSOLUTE/PATH/memory.sqlite ses_YOUR_SESSION --confirm
```

This command deletes OptChat memory, including the session's checkpoint archives.
It does not delete the host transcript.
The adapter can later import root originals that the host still retains.
A host compaction marker without a retained checkpoint causes `CHECKPOINT_MISSING`.
The adapter never reconstructs missing originals from synthetic summaries.

Deletion revokes retained data logically and uses `secure_delete`.
It does not guarantee forensic erasure of old WAL files, backups, provider data, or diagnostic files.
Do not publish these data.

## Test the configured real model

Run this optional test only after authorization for model costs:

```sh
OPTCHAT_REAL_TEST=1 bun run test:real
```

The test uses the existing OpenCode service and its enabled default model.
It does not read credentials or change global configuration.
It creates two new sessions in a separate temporary project.
Existing sessions remain unchanged.

Set both `OPTCHAT_REAL_PROVIDER` and `OPTCHAT_REAL_MODEL` to select another enabled model for this test.
The override affects only the new test sessions and their compactor.
It does not change the service's default model.
The script does not select a fallback automatically.

Session A produces controlled fixture evidence.
Session B receives the question and OptChat memory, not A's dialogue.
It must read the original tool record and report random values, error codes, and proposal status correctly.
The fixture deployment is not a real deployment.

The script permits at most 12 primary context attempts per session and 80 summary API calls.
Without `OPTCHAT_REAL_TEST=1`, it makes no model calls.
It retains new test sessions and local diagnostics for review.

Check a saved run without additional model calls:

```sh
bun run scripts/verify-real-host.ts /absolute/path/to/test-diagnostics
```

See [verification](docs/verification.md) for results and failed development attempts.

## Evaluate real models

This separate optional benchmark makes model calls.
Get authorization before you run it.
Replace the example endpoint, model, and key:

```sh
OPTCHAT_EVAL_URL=https://YOUR-ENDPOINT/v1/chat/completions \
OPTCHAT_EVAL_MODEL=YOUR-MODEL \
OPTCHAT_EVAL_KEY=YOUR-KEY \
OPTCHAT_EVAL_CONTEXT=32000 \
OPTCHAT_EVAL_TRIALS=3 \
bun run evaluate
```

The benchmark compares isolated sessions, merged transcripts, and OptChat on two small cases.
It records answers, calls, retrieval calls, publication delay, and elapsed time.
It separates compaction usage from answer usage.

Set `OPTCHAT_EVAL_INPUT_USD_PER_MILLION` and `OPTCHAT_EVAL_OUTPUT_USD_PER_MILLION` to estimate costs.
Check outcomes and hallucinations manually.
Word matches do not establish semantic correctness.
We did not run this baseline benchmark against a paid endpoint.
The real two-session host test is a separate test.

## Documentation

- [Design and security limits](docs/design.md)
- [Compatibility and milestones](docs/compatibility.md)
- [Instructions for future sessions](AGENTS.md)
- [Writing rules and glossary](docs/writing-guide.md)

The design follows *OptChat Across Sessions*, v0.1, 9 October 2026.
The hierarchical summary concept comes from [Victor Taelin's OptChat Gist](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449/3c190e06f34aba0c69f49042c526093269604935).

## License

[MIT](LICENSE). Copyright (c) 2026 Philipp Ahlner.
This license covers original project code and documentation.
It does not cover external sources, dependencies, or stored conversations.
See the [source review](docs/license-review.md) and [third-party notices](THIRD_PARTY_NOTICES.md) for details.

After `bun run compile`, run `bun run audit:licenses` to check the local inventory and bundle sources.
