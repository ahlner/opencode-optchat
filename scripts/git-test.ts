import { strict as assert } from "node:assert";

// Install the public Git package in a private host. Never change user configuration.
const packageSpec = process.env.OPTCHAT_GIT_PACKAGE ?? "github:ahlner/opencode-optchat#main";
assert(/^(github:|git\+https:\/\/|git\+ssh:\/\/)/.test(packageSpec), "Use a Git package specification");
const task = Bun.spawn(["bun", "run", "scripts/integration.ts"], {
  env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, OPTCHAT_GIT_PACKAGE: packageSpec },
  stdout: "inherit", stderr: "inherit",
});
assert.equal(await task.exited, 0, "Git package integration failed");
