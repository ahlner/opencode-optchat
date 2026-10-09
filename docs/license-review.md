# Source and license review

Review date: 9 October 2026.
Project license: MIT.
Copyright (c) 2026 Philipp Ahlner.

## Scope and result

The review covered project sources, code, documentation, installed package metadata, available license files, and both distributed JavaScript bundles.
The review found no conflict with MIT licensing of original project code in the current distribution.
This finding is not a legal certification or a guarantee of all third-party rights.

## Sources

### Victor Taelin's OptChat Gist

The review used the exact linked revision, `3c190e06f34aba0c69f49042c526093269604935`.
The GitHub Gist API lists only `optchat.md` for that revision, with no license file.
The document also contains no explicit license.
Public access does not constitute an MIT grant.

The project uses concepts such as dyadic summaries, bounded views, and age-based merge priority.
It does not copy the rollback implementation or complete prompts.
A comparison of normalized twelve-word sequences found no matches in `src`, `tests`, `scripts`, `examples`, or `docs`.
That comparison ran before this documentation translation.
It does not detect every shorter match or possible adaptation.
It does not replace legal review.

The project cites and links the Gist.
It does not distribute or relicense the Gist.

### OptChat Across Sessions

The user supplied design specification v0.1, dated 9 October 2026.
The specification contains no explicit license.
The owner subsequently requested publication of the unchanged document in the public repository.
The repository and package now include it under `docs/paper/OptChat-Multi-Session-Paper.md`.
Its [provenance note](paper/README.md) records its SHA-256 hash and the publication request.

The specification guides the separately implemented multi-session design.
This review does not establish rights to the complete external document.
The paper contains no explicit author declaration or separate MIT grant.
Its inclusion does not relicense the cited Gist or other external sources.

### OpenCode

V2 documentation and installed 2.0.26 declarations served as API references.
The project does not vendor the SDK implementation.
Generated project declarations can reference external SDK types.

### Project files

The implementation, test scripts, and documentation originated in this project.
The review found no copied substantial code or prompt blocks from the Gist.
This is not a claim of isolated clean-room development.
The implementation work used the reference sources.

## Dependencies

`docs/dependency-licenses.json` records 288 installed package instances, including repeated installations and versions.
This count does not represent distinct package names or all platform-specific lockfile artifacts.
The review did not inspect uninstalled platform packages.

| Declaration | Installed instances |
| --- | ---: |
| MIT | 127 |
| ISC | 67 |
| Apache-2.0 | 71 |
| BlueOak-1.0.0 | 16 |
| BSD-2-Clause | 2 |
| BSD-3-Clause | 1 |
| AFL-2.1 OR BSD-3-Clause | 1 |
| CC-BY-3.0 | 1 |
| CC0-1.0 | 1 |
| 0BSD | 1 |

The direct dependencies declare MIT for `@opencode/plugin` and `@types/bun`, and Apache-2.0 for `typescript`.
Each inspected package instance declares a license.
The inventory records SHA-256 hashes of available license and NOTICE files, not their complete text.

Specific findings:

- Installed `@opencode/*` packages declare MIT but contain no license file in their package root.
  Metadata inspection does not establish completeness of their license notices.
- `spdx-exceptions` 2.5.0 declares CC-BY-3.0.
  Its data is not MIT code.
  Separate distribution must satisfy CC-BY obligations.
- `json-schema` 0.4.0 offers AFL-2.1 OR BSD-3-Clause.
  A distributor can choose the BSD-3-Clause option.
- Apache-2.0 and other permissive licenses remain separate.
  Compatible use can still require copyright, license, and NOTICE information.
  See `THIRD_PARTY_NOTICES.md` and the upstream files.

## Distributed package

The Bun build keeps `@opencode/plugin` external.
Both bundle source maps name only files under the project's `src` directory.
The package excludes dependencies and Bun/OpenCode binaries.
It includes the unchanged owner-supplied paper, but not the referenced Gist or OpenCode documentation.
The package test checks MIT metadata, the copyright notice, and third-party notices.

`private: true` remains unchanged.
This work does not publish to a registry or activate the adapter for the user.

## Repeat the checks

```sh
bun install --frozen-lockfile
bun run compile
bun run audit:licenses
bun run check
bun run test:package
```

After a dependency change:

1. Review the changed dependencies and their license terms.
2. Run `bun run audit:licenses --write` to update the inventory.
3. Run `bun run audit:licenses` to check the stored result.

A new license declaration outside the reviewed set stops the script.
A package with a known declaration can still require another content review.

## Limits

This review does not cover patent or trademark clearance.
It does not grant rights to stored conversations or establish provider terms for model calls.
Copyright protection for AI-generated content can depend on the jurisdiction.
The requested copyright notice does not guarantee that protection.
Review licensing again before you vendor external sources or distribute runtime packages.
