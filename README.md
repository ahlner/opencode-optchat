# OptChat for OpenCode

OptChat uses Bun to manage memory across OpenCode sessions.
Each session retains its own original records.
The adapter shares summaries of completed, failed, and interrupted turns within the configured scope.

**Tests use Bun 1.4.2 and OpenCode 2.0.26. The adapter rejects other host versions.**
These tests do not certify production use or guarantee correct model answers.

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
bun run demo
```

The integration test starts a private OpenCode service and a local model fixture.
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

## Load a local plugin

1. Install the pinned dependencies.
2. Build the JavaScript files and type declarations.
3. Create the local package archive.

```sh
bun install --frozen-lockfile
bun run build
bun run pack
```

`pack` creates a local `.tgz` archive.
It does not publish to a registry.

4. Create `package.json` in a separate plugin directory.

```json
{"name":"local-optchat","type":"module","exports":"./index.ts"}
```

5. Create `index.ts` in that directory.
6. Replace the example path with the absolute repository path.

```ts
export { default } from "/ABSOLUTE/PATH/multisession-optchat/dist/adapters/opencode/plugin.js"
```

7. Add the plugin to your OpenCode V2 project configuration.
8. Preserve all existing configuration entries.
9. Replace each example identifier and path.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/ABSOLUTE/PATH/local-optchat",
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

Session A produces controlled fixture evidence.
Session B receives the question and OptChat memory, not A's dialogue.
It must read the original tool record and report random values, error codes, and proposal status correctly.
The fixture deployment is not a real deployment.

The script limits primary steps and summary calls.
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

After `bun run build`, run `bun run audit:licenses` to check the local inventory and bundle sources.
