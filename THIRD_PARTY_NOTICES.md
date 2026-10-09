# Sources and third-party licenses

The original code and documentation in this project use the MIT license in
`LICENSE`. Copyright (c) 2026 Philipp Ahlner.
This license does not replace licenses for dependencies, external documents, runtimes, model services, or stored conversations.

## Conceptual sources

- Victor Taelin, *UniiChat: one chat that never ends* (OptChat recipe),
  [revision 3c190e06f34aba0c69f49042c526093269604935](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449/3c190e06f34aba0c69f49042c526093269604935).
  This is the conceptual source for hierarchical summaries and age-based merging.
  The reviewed revision has no explicit license. This package does not include it.
  This project does not reproduce its rollback implementation or its prompts.
- *OptChat Across Sessions*, design specification v0.1, 9 October 2026,
  supplied by the project owner. The specification guided the multi-session design.
  The owner requested publication of the unchanged document in `docs/paper/OptChat-Multi-Session-Paper.md`.
  The archive also includes it. The supplied document has no explicit license.
  Inclusion does not establish a separate MIT grant for the paper or its external sources.
- [OpenCode V2 documentation](https://opencode.ai/v2/docs/build/plugins) and
  installed `@opencode/plugin` 2.0.26 declarations were API references.
  This package does not include their complete text or SDK implementation.

## Dependencies

| Direct dependency | Version | Declared license | Distribution |
| --- | --- | --- | --- |
| `@opencode/plugin` | 2.0.26 | MIT | External runtime dependency |
| `@opencode/theme` | 2.0.26 | MIT | Development only |
| `@opentui/core` | 0.5.17 | MIT | Development only |
| `@opentui/solid` | 0.5.17 | MIT | Development dependency and external host-provided peer |
| `solid-js` | 1.9.15 | MIT | Development dependency and external host-provided peer |
| `@types/bun` | 1.4.2 | MIT | Development only |
| `typescript` | 7.0.2 | Apache-2.0 | Development only |

The build leaves `@opencode/plugin`, `@opentui/solid`, and `solid-js` external.
OpenCode supplies the terminal rendering peers.
The archive contains project code,
declarations, source maps, and project documentation. It contains no `node_modules`,
SDK implementation, compiler, or Bun/OpenCode executable.

See `docs/dependency-licenses.json` for the installed dependency inventory.
It records upstream license declarations and available local license or notice hashes.
It does not grant rights or prove that each upstream package contains all required notices.
The installed OpenCode packages declare MIT but do not contain a root license file.
Retain upstream license information if you distribute those packages separately.

Transitive packages retain their own licenses. In particular:

- `caniuse-lite` 1.0.30001815 declares CC-BY-4.0. Its package names Ben Briggs as author.
  See its [upstream repository](https://github.com/browserslist/caniuse-lite) and [license terms](https://creativecommons.org/licenses/by/4.0/).
  This development dependency supplies browser compatibility data. This package does not bundle its data or code.
  Separate redistribution requires attribution, the applicable license information, and an indication of changes.
- `spdx-exceptions` 2.5.0 declares CC-BY-3.0. Its package names The Linux Foundation
  as author and Kyle E. Mitchell as contributor. See its
  [upstream repository](https://github.com/kemitchell/spdx-exceptions.json) and
  [license terms](https://creativecommons.org/licenses/by/3.0/).
  This package does not bundle its data. Redistribution requires attribution and the
  applicable CC-BY notices, including indication of changes.
- BlueOak-1.0.0 packages require their license text or a link to
  <https://blueoakcouncil.org/license/1.0.0> when their code is redistributed.
- `json-schema` 0.4.0 offers AFL-2.1 OR BSD-3-Clause. The BSD-3-Clause option is
  available, with its upstream copyright, conditions, and disclaimer.
- Apache-2.0, MIT, BSD, and ISC packages have their own notice obligations.
  Preserve applicable upstream license and NOTICE files when redistributing them.

Check these obligations again if the build bundles third-party code.
Also check them before you distribute dependencies or executables with this project.
See `docs/license-review.md` for the review scope and limitations.
