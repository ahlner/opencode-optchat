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

The live status bar shows `N msgs left` for imported messages with unfinished original summaries.
It groups tool parts from the same host message into one message count.
The separate `N jobs` count includes pending, running, and failed summary jobs, including parent and publication jobs.
These counts cover the shared database, not only the visible session.
Messages that the adapter has not imported are not included yet.
Zero messages can therefore appear while derived summary jobs remain.

The terminal status bar shows OptChat on the home screen and in sessions.
It reads the current Location's server status every five seconds while visible.
The indicator does not start compaction or make model calls.

- `off`: Memory ingestion is disabled.
- `ready`: OptChat is enabled with no active turns or pending jobs.
- `active`: At least one memory turn is active.
- `native`: A session has a native-turn marker. That turn has no OptChat memory tools.
- `processing N`: N jobs have worker claims. This does not prove that the provider is responding.
- `queued N`: N jobs await a worker. No job currently has a worker claim.
- `paused`: Automatic preparation stopped after three consecutive attempts without durable progress.
- `error`: At least one compactor job failed or has an expired lease.
- `unavailable`: The status request failed or no Location is available.

The native indicator can include preparation, queue, pause, or failure details.
Its count covers the current database, not only the visible session.
Markers remain until terminal reconciliation or a later successful memory admission.

Otherwise, the indicator gives failed or expired jobs priority over active processing.
It ignores historical error codes when no failed or expired jobs remain.
It does not certify summary accuracy or session authorization.

Open **OptChat settings** and select **Show memory status**.
The status shows retained originals, summaries, publications, active turns, and compactor jobs.
Expired running jobs and failed jobs appear separately.
The status does not expose original payloads or certify summary accuracy.

Finish or interrupt active turns before selecting **Retry failed compaction**.
Confirm the possible model costs.
This action requeues failed jobs, clears a background pause, and preserves originals.
The enabled adapter resumes pending preparation automatically. This action does not activate a disabled adapter.

While enabled, the adapter checks for pending preparation once per second.
It resumes released jobs without requiring another prompt or agent event.
It skips live worker claims and failed jobs.
Each attempt retains the configured preparation deadline.

New primary requests do not wait for background summary calls.
If complete memory is unavailable, the request uses native mode for its entire turn.

Durable original, summary, or completed-job progress resets the consecutive-stall counter.
Three attempts without progress pause automatic preparation until you confirm **Retry failed compaction**.
The pause survives a service restart. Background requests can incur model costs.
Cancellation cannot reverse charges for requests that the provider already received.

Agent and terminal events do not bypass the pause.
A new primary prompt checks available memory without generating summaries.

The adapter permits one active preparation worker per database, across worker connections.
That worker can claim several leaf or parent jobs for one sequential model request.
It retries explicit rate limits and recognizable temporary provider failures up to three times after the initial request.
Retry delays increase from one to four seconds and respect longer provider delays up to 30 seconds.
The requests and delays share one `waitMs` deadline.

Invalid credentials, denied access, disabled or unknown models, and invalid summary responses do not receive these provider retries.
Exhausted retries still leave failed jobs for operator review. There is no infinite availability retry loop.

Summaries must still fit 512 UTF-8 bytes.
These limits reduce request bursts. They do not guarantee a completion time for large archives.

### Compactor efficiency and output checks

The adapter summarizes a projection of each original, not a replacement original.
Routine audit projections omit token counts, costs, timestamps, model bookkeeping, and unchanged snapshot hashes.
Recorded errors, retries, changed-file lists, tool inputs, and tool results remain available to the summarizer.
The source tool retains the complete original audit payload.

Ready leaf jobs or ready parent jobs from the same completed turn can share a structured request.
The batch limit is eight jobs, reduced when the configured model has a smaller output limit.
The adapter discovers that limit during background work, not during startup.
It never batches different turns or shared publication ranges together.
Each response must contain every expected item ID exactly once and respect each item's 512-byte limit.

Leaf batches limit their combined projected input to 10,000 UTF-8 bytes, or a smaller configured chunk limit.
Oversized originals still use the existing complete-input chunking path. The adapter never cuts an original to fit a batch.

Every claimed job retains its own fence and cancellation handling.
Summary authorization includes the wider evidence range exposed by the batch.
Partial retirement discards summaries that saw evidence beyond the retained prefix.
The status can show several claimed jobs even though their model requests run sequentially.

Selected checks reject drafting notes, absent-category boilerplate, and the observed tool-result absence claims.
These checks do not prove complete semantic correctness.
Startup removes matching old generated summaries and dependent derived memory, then schedules reconstruction.
It retains originals and unaffected publication order, but revokes affected snapshots.
Reconstruction can incur model costs. It does not overwrite summaries in place.

Existing background pauses still require confirmed retry.

Batch retries identify rejected item IDs and rejection categories before requesting corrected evidence.
They do not accept unsupported result-absence statements to keep preparation moving.
The adapter also projects older lossless tool-call leaves again, without changing their retained originals.
This removes old execution audit flags from new parent inputs.

The corrected adapter automatically retries existing `SUMMARY_BATCH_INVALID` parent failures once per database scope.
It preserves claim fences and leaves other failed jobs unchanged.
Repeated failures still require operator review or confirmed retry. An existing background pause remains in effect.

The corrected adapter also schedules recognizable cached provider-unavailability failures once per database scope.
This recovery excludes authorization failures, invalid credentials, obsolete generations, and other scopes.

Startup also revokes obsolete jobs whose child summaries no longer exist.
It schedules replacements from current durable nodes without deleting originals or retrying missing node IDs.
It does not clear an existing background pause or permit indefinite restart retries.

The lease fix recovers an expired lease only when its fence remains unchanged.
A worker that another worker or retention change replaced discards its result.
It does not fail the replacement job or publish stale evidence.

`MEMORY_NOT_READY` means that required durable summaries are missing.
New turns use native mode instead of waiting for missing summaries.
Previously admitted memory turns retain their pinned snapshot and stop if validation fails.
Startup recovers the exact readiness error that earlier versions incorrectly stored as a permanent disable.
Permission revocations and uncertain original mappings block OptChat memory, not ordinary native conversation.
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

#### Optional compactor content capture

Content capture starts disabled. It records only compactor requests and visible model answers, not primary conversation requests or answers.
Use this procedure for diagnosis:

1. Open **OptChat settings** from the command palette.
2. Select **Capture compactor content: disabled**.
3. Confirm the private-content warning.
4. Select **Save settings**.
5. Reproduce the problem.
6. Disable capture and save after diagnosis.

Explicit plugin configurations can set `captureContent: true` instead.
The server writes `<database>.content.ndjson` and keeps one rotated file with suffix `.1`.
These files use mode `0600` and rotate near eight MiB.
Entries larger than one MiB are omitted with `CONTENT_TOO_LARGE` in the metadata log, not silently clipped.

Each request and answer carries the same request ID, job ID, runtime ID, and model identifier.
The metadata log also records request hashes and original source coordinates for claimed leaf jobs.
Cancelled or failed calls can have a request without an answer.
Local lossless processing creates no model request and therefore no content entry.

Captured prompts can contain confidential originals and user-supplied secrets.
The logger does not add authentication headers, configured API keys, hidden reasoning, or private provider objects.
Disabling capture stops new writes. It does not delete previous files.
Do not publish these files without a separate content review.

### Existing sessions and preparation limits

Enabling memory in an existing session can require many background summary calls.
Primary admission never generates summaries or waits for this backfill.
The adapter checks host metadata for at most one second before selecting a new turn's mode.

Native mode preserves the host's own conversation and complete tool protocol.
It adds an explicit memory-unavailable notice and removes OptChat memory tools.
It never injects partial shared memory or changes mode during a turn.
Once preparation finishes, a later turn can use complete, snapshot-pinned OptChat memory.
An already admitted memory turn cannot fall back to native mode.

This explicit native mode differs from the paper's strict admission-stop policy.
It is not a complete OptChat view or a claim of cross-session awareness.
The background workflow still has no total archive-cost budget.

The background deadline cancels local preparation waits and sends an abort signal to the provider.
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

### Lower preparation costs

The adapter avoids model requests when the complete summary input already fits within 512 UTF-8 bytes.
It preserves that input exactly and records a local, lossless node.
This applies to short originals, combined summaries, and small publications.
Larger inputs still require the selected compactor model.

Existing summaries remain immutable. The optimization applies to unfinished and new work.
Savings depend on record sizes and the summaries produced by the model.
It does not impose a total archive cost limit or combine multiple oversized records in one model request.

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
The enabled adapter executes pending work automatically or during the next request.

Preparation now stops immediately when a required summary job has failed.
Select a working compactor model before selecting **Retry failed compaction** in **OptChat settings**.
This action retains originals and can incur model costs.
Diagnostics report the missing prefix, job counts, and sanitized failure categories.
They do not include conversation content or raw provider errors.

After a crash, new workers reclaim jobs only when their recorded process no longer exists.
Live workers retain their claims.
The schema migration preserves legacy jobs with unknown owners until their leases expire.
Known shutdown errors no longer retire original history.
The adapter cannot recreate originals that an older version already deleted unless the host still retains them.

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
