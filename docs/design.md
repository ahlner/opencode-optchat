# Design

See [project terms](writing-guide.md#project-terms) for technical definitions.

## Identity and storage

`Session` contains a scope, stable project identifier, and generation.
Each original record receives a continuous sequence number within its generation.
The tuple `(session, generation, eventKey)` is unique.
Delivery of the same event again changes nothing.
A changed payload under the same key causes `EVENT_CONFLICT`.

`sources` stores complete structured payloads.
`nodes` stores immutable summaries and their coordinates.
`entities` stores sessions, turns, publications, snapshots, and views as JSON.
`jobs` stores the durable work queue.

Workers renew leases while a model call runs.
Before each commit, a worker atomically refreshes its lease if its fence and running status still match.
This permits recovery after suspension without permitting a superseded worker to commit.
Lost ownership discards the result instead of marking another worker's job failed.

Schema version 2 adds a process identifier and a unique store token to each claimed job.
Before claiming work, the store checks whether a recorded process no longer exists.
It returns confirmed dead-process claims to the queue and increments their fences.
Closing a store releases only that store's claims.

Live processes and unknown legacy owners retain their leases until normal expiry.
Process identifier reuse can delay recovery. It never permits an unverified takeover.
Process ownership checks require all workers to use the same host. Shared databases across hosts are not supported.

SQLite FTS5 indexes originals and summaries.
Database triggers update summary indexes within the transaction.

The database uses WAL, `synchronous=FULL`, `secure_delete`, and a busy timeout.
The database file uses mode `0600`.
The adapter creates a new database directory with mode `0700`.
These settings do not replace system permissions, encryption, or a backup policy.

The core supports multiple scopes.
Each host adapter uses one database for one scope.
This keeps compaction jobs with the provider configured for that scope.

## Trees and publications

Each session leaf covers one sealed original record.
A parent covers two aligned adjacent children of equal size.
Each summary contains at most 512 UTF-8 bytes.
Hashes, model identifiers, prompt versions, and child or source references remain outside generated text.

The worker divides complete large inputs into bounded chunks without splitting Unicode code points.
It stores intermediate summaries durably.
It reduces those summaries until the final input fits the limit.
The complete originals remain available independently.

The worker renews its lease regularly.
Regular renewal requires an unexpired lease.
Commit recovery can refresh an expired lease only through the unchanged fence and running status.
Neither operation can recover a revoked or superseded job.

A terminal turn covers the half-open record interval `[start,end)`.
`rangeCover` produces exact dyadic coverage of that interval.
The engine creates a publication only after the required nodes are durable.
The publication retains `completed`, `failed`, or `interrupted` as structured status.

Shared leaves follow the order of atomic publication commits.
This order does not establish causal order.
A retention rebuild preserves publication sequence numbers.
The new tree coordinates remain continuous.

## Views and snapshots

A view covers the complete prefix that has durable summaries.
It stores the revision, prefix boundary, and frontier identifiers.
The engine appends new leaves.
Size above H starts reduction toward L when suitable durable parents exist.

Each merge must reduce the rendered size.
Its priority is `(T-e)/child_span`.
The earlier position wins a tie.
Size calculations include escaped text and identifiers.
A temporary request projection does not change the canonical view.

At turn admission, the engine fixes the snapshot boundaries:

- Scope epoch and policy version.
- Publication high-water mark and shared view.
- Session generation and prior local record boundary.

The store must register each snapshot.
A changed copy of its contents does not authorize access.

An active turn cannot see later foreign publications.
This limit also applies to search and original records.
Current live messages are not historical memory.
The adapter retains the complete active conversation segment, including tool pairs, in the model transcript.

## Jobs and errors

A worker claims a job atomically with a lease and an increasing fence number.
It calls the model outside the database transaction.
It stores intermediate summaries and final results only with a valid lease and fence.
It commits the publication and shared view in one transaction.

A crash before commit leaves a job that another worker can claim.
A model error marks the job as failed.
The operator can schedule another attempt.
The summarizer retries invalid output lengths within a fixed attempt limit.
It never cuts output bytes to satisfy the limit.

The adapter limits atomic claims to one unexpired running job per database.
The standalone engine retains its default parallel worker support.
Explicit rate limits permit three additional model attempts with increasing delays and one shared request deadline.
The adapter respects provider delays up to 30 seconds. Longer delays leave the job failed.
Existing failed jobs still require an operator retry.

`MEMORY_NOT_READY` means a required complete prefix or suitable durable projection is missing.
The adapter waits at most `waitMs`.

The same deadline limits serialized preparation, model calls, retry delays, and host metadata waits.
An expired primary request cannot execute its queued preparation later.
Cancellation returns only the worker's matching claim to the pending queue and increments its fence.
Intermediate durable summaries remain available for a later attempt.
The worker discards late provider responses even if the provider ignores cancellation.

These bounds do not remove historical reconciliation from primary admission.
Large-session initialization still needs a separate controlled preparation workflow.
Provider-side work and charges can continue after an abort signal.

`ACTIVE_TURN_TOO_LARGE` stops the request explicitly.
The adapter does not yet create transparent checkpoints inside active turns.

## Retrieval and retention

An original is visible within an authorized local prefix or visible foreign publication.
Its scope and current generation must also match.
Node and source identifiers alone do not grant access.

`zoom` opens a parent into its children.
It opens a publication into its exact turn coverage.
It opens a session leaf into its original record reference.

`source` returns pages without splitting UTF-8 code points.
Its offsets count Unicode code points.

`search` treats the query as an FTS phrase.
Authorization occurs before snippets, result counts, and pagination.

Retention revocation deletes originals, FTS entries, affected publications, and derived shared nodes.
It increases the scope epoch and revokes old snapshots.
Stale workers cannot commit afterward.
Unaffected scopes retain their snapshots.

An edit or rewind preserves the unchanged prefix before the first affected turn.
The core migrates its sources, nodes, and publications to a new generation.
Publication sequence numbers remain unchanged.
The core revokes the affected turn and its following suffix.
A staged rewind blocks admission until the host commits or clears it.

## Host lifecycle

Before native compaction, the adapter stores public original messages in a versioned checkpoint.
It excludes hidden reasoning and private provider state.
The host marker references the checkpoint identifier.
Only a completed marker activates that checkpoint.
A failed later compaction attempt does not overwrite an earlier checkpoint.
After restart, the adapter reconstructs originals from that checkpoint and the remaining host messages.

A fork must match the checked parent prefix exactly.
The host may change message identifiers, but not public content.
The adapter copies sources and checkpoints independently.
It never publishes an inherited turn.
Only new fork turns can produce publications.
Subagent children retain local history but do not broadcast it.

Fork sources retain the worktree and commit of each parent original.
`inheritedFrom` identifies that original's session, generation, and sequence at the time of copying.
This provenance reference does not grant read access.
After parent deletion, it remains historical metadata only.
Tool results that the host marks as shortened retain `truncated: true`.

Memory policy evaluates ordered native agent rules, followed by session rules.
`optchat.read` and `optchat.share` use the scope identifier as their resource.
The configured scope supplies the initial grant.
Both `deny` and `ask` revoke that grant.

A change increases the policy version and retention epoch.
The adapter commits data migration, checkpoints, and policy state atomically.
It interrupts active turns instead of continuing them under a new policy.

A worktree move within the same stable host project preserves history and publication order.
Sources retain their original worktree provenance.
The adapter does not silently accept a different project or scope.

## Limits

- The conservative counter uses UTF-8 bytes of serialized content as an upper token estimate.
  It can stop a request too early.
- The counter does not tokenize provider-specific request wrappers exactly.
  The safety reserve remains necessary.
- Local and shared memory initially receive equal parts of the remaining budget.
  The engine does not yet optimize that allocation.
- Search applies SQL authorization before pagination.
  It materializes at most `limit+1` identifiers.
  Shared node authorization does not traverse the complete tree.
  SQLite execution time still depends on the data and query.
- The adapter imports completed originals at host idle boundaries.
  Intermediate streaming state remains in the host.
- A scope change is not an implicit permission change.
  It requires a separate adapter database and explicit configuration.
- The adapter checks native agent and session memory rules.
  It does not replace an external organization policy engine.
- Summary quality depends on the configured model.
