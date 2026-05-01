#!/usr/bin/env node
// opencode-superpowers — installer entrypoint for `npx opencode-superpowers`.
//
// This thin wrapper shells out to scripts/install-opencode.sh, which installs
// the bundled OpenCode agents and vendored Superpowers skills into the user's
// OpenCode config directories. Packaged npx installs default to copy mode so
// installed files do not depend on npm cache paths remaining available.
//
// Usage:
//   npx opencode-superpowers              # install agents and skills
//   npx opencode-superpowers --profile default  # install the Copilot Pro-safe profile
//   npx opencode-superpowers --profile premium  # install the premium profile
//   npx opencode-superpowers --force      # overwrite existing entries
//   npx opencode-superpowers --dry-run    # show what would happen
//   npx opencode-superpowers --uninstall  # remove managed entries

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const repoRoot = path.resolve(__dirname, "..");
const installer = path.join(repoRoot, "scripts", "install-opencode.sh");

if (!fs.existsSync(installer)) {
  console.error(`error: installer not found at ${installer}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const result = spawnSync("bash", [installer, ...args], {
  stdio: "inherit",
  cwd: repoRoot,
});

if (result.error) {
  console.error(`error: failed to run installer: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
