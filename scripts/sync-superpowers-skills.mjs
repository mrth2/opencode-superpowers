#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const REQUIRED_SKILLS = [
  "using-superpowers",
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "executing-plans",
  "verification-before-completion",
];

const DEFAULT_UPSTREAM_URL = "https://github.com/obra/superpowers.git";

function parseArgs(argv) {
  const args = { repo: process.cwd(), upstreamUrl: DEFAULT_UPSTREAM_URL };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw new Error("--repo requires a value");
      }
      args.repo = argv[index + 1];
      index += 1;
    } else if (arg === "--upstream") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw new Error("--upstream requires a value");
      }
      args.upstream = argv[index + 1];
      index += 1;
    } else if (arg === "--upstream-url") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw new Error("--upstream-url requires a value");
      }
      args.upstreamUrl = argv[index + 1];
      index += 1;
    } else if (arg === "--commit") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw new Error("--commit requires a value");
      }
      args.commit = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/sync-superpowers-skills.mjs --upstream /path/to/superpowers [--repo /path/to/repo] [--commit sha]");
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!args.upstream) {
    throw new Error("--upstream is required");
  }
  return args;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function listFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        out.push(absolute);
      }
    }
  }
  return out.sort();
}

function normalizeRel(filePath, repoRoot) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function detectCommit(upstreamRoot, explicitCommit) {
  if (explicitCommit) return explicitCommit;
  try {
    return execFileSync("git", ["-C", upstreamRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown-local-upstream";
  }
}

function skillSourcePath(upstreamRoot, skill) {
  const candidates = [
    path.join(upstreamRoot, "skills", skill),
    path.join(upstreamRoot, "node_modules", "superpowers", "skills", skill),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "SKILL.md"))) return candidate;
  }
  throw new Error(`required upstream skill is missing SKILL.md: ${skill}`);
}

function removeExistingVendoredSkills(skillsRoot) {
  fs.mkdirSync(skillsRoot, { recursive: true });
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (entry.name === "superpowers.lock.json") continue;
    fs.rmSync(path.join(skillsRoot, entry.name), { recursive: true, force: true });
  }
}

function validateRelativeAssets(skillDir, repoRoot) {
  const skillMd = path.join(skillDir, "SKILL.md");
  const markdown = fs.readFileSync(skillMd, "utf8");
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const rawTarget = match[1].trim();
    if (/^(https?:|mailto:|#)/.test(rawTarget) || rawTarget.length === 0) continue;
    const withoutAnchor = rawTarget.split("#")[0];
    if (!withoutAnchor) continue;
    const target = path.resolve(skillDir, withoutAnchor);
    if (!target.startsWith(skillDir + path.sep) && target !== skillDir) {
      throw new Error(`skill link escapes skill directory in ${path.relative(repoRoot, skillMd)}: ${rawTarget}`);
    }
    if (!fs.existsSync(target)) {
      throw new Error(`missing referenced local asset in ${path.relative(repoRoot, skillMd)}: ${rawTarget}`);
    }
  }
}

function copyRequiredSkills(upstreamRoot, skillsRoot, repoRoot) {
  for (const skill of REQUIRED_SKILLS) {
    const source = skillSourcePath(upstreamRoot, skill);
    const dest = path.join(skillsRoot, skill);
    fs.cpSync(source, dest, { recursive: true, force: true, dereference: false });
    validateRelativeAssets(dest, repoRoot);
  }
}

function writeLock(repoRoot, upstreamUrl, upstreamCommit) {
  const skillsRoot = path.join(repoRoot, "skills");
  const files = listFiles(skillsRoot)
    .map((filePath) => normalizeRel(filePath, repoRoot))
    .filter((relativePath) => relativePath !== "skills/superpowers.lock.json")
    .map((relativePath) => {
      const absolute = path.join(repoRoot, relativePath);
      return {
        path: relativePath,
        sha256: sha256(absolute),
        bytes: fs.statSync(absolute).size,
      };
    });

  const lock = {
    upstream: {
      repository: upstreamUrl,
      commit: upstreamCommit,
      syncedAt: new Date().toISOString(),
    },
    requiredSkills: REQUIRED_SKILLS,
    files,
  };
  const lockPath = path.join(skillsRoot, "superpowers.lock.json");
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

function validateLockfile(lock, repoRoot) {
  if (!lock || typeof lock !== "object") {
    throw new Error("generated lockfile is not an object");
  }
  if (!lock.upstream || typeof lock.upstream.repository !== "string" || typeof lock.upstream.commit !== "string") {
    throw new Error("generated lockfile is missing upstream metadata");
  }
  if (!Array.isArray(lock.requiredSkills) || !Array.isArray(lock.files)) {
    throw new Error("generated lockfile is missing required arrays");
  }
  for (const skill of REQUIRED_SKILLS) {
    if (!fs.existsSync(path.join(repoRoot, "skills", skill, "SKILL.md"))) {
      throw new Error(`generated skill is missing SKILL.md: skills/${skill}/SKILL.md`);
    }
  }
  for (const entry of lock.files) {
    if (!entry || typeof entry !== "object" || typeof entry.path !== "string" || typeof entry.sha256 !== "string") {
      throw new Error("generated lockfile contains an invalid file entry");
    }
    const absolute = path.join(repoRoot, entry.path);
    if (!fs.existsSync(absolute)) {
      throw new Error(`generated lockfile references missing file: ${entry.path}`);
    }
    const actualHash = sha256(absolute);
    if (actualHash !== entry.sha256) {
      throw new Error(`generated lockfile checksum mismatch for ${entry.path}`);
    }
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = path.resolve(args.repo);
    const upstreamRoot = path.resolve(args.upstream);
    const skillsRoot = path.join(repoRoot, "skills");

    if (!fs.existsSync(upstreamRoot)) {
      throw new Error(`upstream path does not exist: ${upstreamRoot}`);
    }

    const upstreamCommit = detectCommit(upstreamRoot, args.commit);
    removeExistingVendoredSkills(skillsRoot);
    copyRequiredSkills(upstreamRoot, skillsRoot, repoRoot);
    const lock = writeLock(repoRoot, args.upstreamUrl, upstreamCommit);
    validateLockfile(lock, repoRoot);

    console.log(`synced ${REQUIRED_SKILLS.length} skill(s), ${lock.files.length} file(s), upstream ${upstreamCommit}`);
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

main();
