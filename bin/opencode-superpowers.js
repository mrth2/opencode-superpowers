#!/usr/bin/env node
// opencode-superpowers — installer entrypoint for `npx opencode-superpowers`.
//
// This thin wrapper just shells out to scripts/install-opencode.sh, which
// handles symlinking the agent markdown files into ~/.config/opencode/agents/.
//
// Usage:
//   npx opencode-superpowers              # install (skip existing non-symlinks)
//   npx opencode-superpowers --force      # overwrite existing entries
//   npx opencode-superpowers --dry-run    # show what would happen
//   npx opencode-superpowers --uninstall  # remove symlinks created by this script

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
