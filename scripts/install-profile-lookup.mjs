#!/usr/bin/env node
// install-profile-lookup.mjs
// Helpers used by install-opencode.sh to consult the bundled profile matrix
// (scripts/install-profiles.json) and to detect which profile to use from an
// OpenCode auth.json file.
//
// Usage:
//   node install-profile-lookup.mjs <profile> <agent-basename>
//   node install-profile-lookup.mjs --list-profiles
//   node install-profile-lookup.mjs --detect-profile <auth-file>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const profilesPath = path.join(here, "install-profiles.json");

function loadProfiles() {
  return JSON.parse(fs.readFileSync(profilesPath, "utf8"));
}

const argv = process.argv.slice(2);

if (argv[0] === "--list-profiles") {
  const profiles = loadProfiles();
  process.stdout.write(`${Object.keys(profiles).join("\n")}\n`);
  process.exit(0);
}

if (argv[0] === "--detect-profile") {
  const authFile = argv[1];
  if (!authFile) {
    process.stderr.write("usage: install-profile-lookup.mjs --detect-profile <auth-file>\n");
    process.exit(2);
  }
  if (!fs.existsSync(authFile)) {
    process.stderr.write(`warn: opencode auth file not found at ${authFile}; defaulting to copilot profile\n`);
    process.stdout.write("copilot");
    process.exit(0);
  }
  let providers = [];
  try {
    const auth = JSON.parse(fs.readFileSync(authFile, "utf8"));
    providers = Object.keys(auth || {});
  } catch (e) {
    process.stderr.write(`warn: could not parse ${authFile} (${e.message}); defaulting to copilot profile\n`);
    process.stdout.write("copilot");
    process.exit(0);
  }
  if (providers.includes("github-copilot")) {
    process.stdout.write("copilot");
  } else if (providers.includes("anthropic")) {
    process.stdout.write("anthropic");
  } else {
    process.stderr.write(`warn: no recognized provider in ${authFile} (found: ${providers.join(",") || "none"}); defaulting to copilot profile\n`);
    process.stdout.write("copilot");
  }
  process.exit(0);
}

const [profile, agent] = argv;
if (!profile || !agent) {
  process.stderr.write("usage: install-profile-lookup.mjs <profile> <agent-basename>\n");
  process.exit(2);
}

const profiles = loadProfiles();
const map = profiles[profile];
if (!map) {
  process.stderr.write(`error: unknown profile: ${profile}\n`);
  process.exit(2);
}
const model = map[agent];
if (!model) {
  process.stderr.write(`error: profile "${profile}" has no model entry for agent "${agent}"\n`);
  process.exit(2);
}
process.stdout.write(model);
