# Repository writing rules

## Language

Write original repository text in English.
Use ASD-STE100 writing rules for documentation, comments, error messages, tool descriptions, and agent instructions.
Use German for conversation with the project owner unless the owner requests another language.

## Sentence rules

1. Put one instruction in each sentence.
2. Use no more than 20 words in an instruction.
3. Use no more than 25 words in a description.
4. Name the actor when its identity is known and relevant.
5. Use active voice and simple tenses.
6. Use a direct verb instead of a noun phrase for an action.
7. Do not use phrasal verbs or semicolons in prose.
8. Use the same term for the same meaning.
9. Limit each paragraph to one topic and six sentences.
10. Use a list for three or more steps or conditions.

Preserve the meaning before you shorten a sentence.
Keep uncertainty words such as `may`, `could`, and `might` when the evidence requires them.
Do not turn a possible result into a fact.
Keep a necessary longer expression when shortening would remove a safety condition or exact constraint.
Document that exception beside the expression.

## Exceptions and review limits

Keep the following content unchanged:

- Legal license text and upstream notices.
- External titles and exact quotations with source attribution.
- The unchanged owner-supplied paper in `docs/paper/OptChat-Multi-Session-Paper.md`.
- API names, identifiers, file paths, commands, and code syntax.
- Deliberate language or Unicode fixtures and retained user conversation data.

The project uses the ASD-STE100 structural rules and a consistent technical glossary.
The available skill does not include the official approved-word dictionary.
An automatic check cannot establish complete dictionary compliance or certify this documentation.
Get the official standard before you claim full compliance.
See the [ASD-STE100 download information](https://www.asd-ste100.org/STE_downloads.html).
Do not copy the standard or its dictionary into this repository without permission.

## Automated checks

Run `bun run test:docs` after changes to Markdown documentation.
The check excludes code blocks and preserves exact API identifiers.
It checks original Markdown files in nested documentation directories.
It checks the archived paper's hash instead of changing or linting its text.
It checks sentence length, paragraph length, semicolons, selected unsuitable expressions, and selected German words.

It does not check every English word, grammar rule, noun cluster, or instruction boundary.
Review those rules manually.
`bun run check` also runs the documentation check.

## Project terms

| Term | Meaning |
| --- | --- |
| admission | The point where the engine registers a turn and fixes its snapshot. |
| checkpoint | A durable copy of public originals that the host can discard during native compaction. |
| compactor | The component that produces bounded summaries from historical data. |
| context window | The model's limit for tokens in a request. |
| dyadic coverage | Exact coverage by aligned ranges whose lengths are powers of two. |
| epoch | A scope revision that changes when retention revokes previously visible data. |
| fence | An increasing job claim number that prevents stale workers from committing. |
| fork | A new session with an independent copy of a checked parent prefix. |
| frontier | The ordered node identifiers that cover a summarized prefix without gaps or overlaps. |
| generation | A session revision that separates history before and after an edit or retention change. |
| high-water mark | The latest publication sequence that a snapshot permits. |
| host | The pinned OpenCode service that owns sessions and executes tools. |
| lease | The limited time during which a worker owns a job claim. |
| node | An immutable summary with references to its children or original record. |
| original | A complete structured record that the host exposes, without hidden reasoning or private provider state. |
| prefix | The continuous part of a record sequence before a specified boundary. |
| projection | A temporary complete view that fits a request budget without changing the stored view. |
| provenance | Metadata that identifies a record's source session, generation, sequence, worktree, or commit. |
| publication | An immutable summary of a terminal turn that authorized sessions can share. |
| retention | The rules and operations that keep or revoke stored originals and derived data. |
| scope | The configured trust boundary within which sessions may share memory. |
| snapshot | The registered visibility boundaries that remain fixed during a turn. |
| source | An original record or its authorized retrieval reference. |
| suffix | The continuous part of a sequence from a specified boundary to its end. |
| terminal turn | A turn whose outcome is completed, failed, or interrupted. |
| turn | An admitted request and all its tool continuations until a terminal outcome. |
| view | An ordered frontier that covers a complete summarized prefix. |
| worktree | A Git working directory associated with a stable project. |

Use `check` for an evidence or consistency test.
Use `confirm` for explicit operator approval.
Use `delete` for stored data deletion.
Use `revoke` for withdrawal of visibility or permission.
Keep the `verify` spelling in existing API names and file paths.
