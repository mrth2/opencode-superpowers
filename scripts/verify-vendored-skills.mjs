#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REQUIRED_SKILLS = [
  "using-superpowers",
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "executing-plans",
  "verification-before-completion",
];

function parseArgs(argv) {
  const args = { repo: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw new Error("--repo requires a value");
      }
      args.repo = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/verify-vendored-skills.mjs [--repo /path/to/repo]");
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function listFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
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

function loadLock(repoRoot) {
  const lockPath = path.join(repoRoot, "skills", "superpowers.lock.json");
  if (!fs.existsSync(lockPath)) {
    throw new Error("skills/superpowers.lock.json is missing; run node scripts/sync-superpowers-skills.mjs --upstream <path>");
  }
  return JSON.parse(fs.readFileSync(lockPath, "utf8"));
}

function verifyLockShape(lock) {
  if (!lock.upstream || typeof lock.upstream.repository !== "string" || typeof lock.upstream.commit !== "string") {
    throw new Error("lockfile upstream.repository and upstream.commit must be strings");
  }
  if (!Array.isArray(lock.requiredSkills)) {
    throw new Error("lockfile requiredSkills must be an array");
  }
  for (const [index, skill] of lock.requiredSkills.entries()) {
    if (typeof skill !== "string") {
      throw new Error(`lockfile requiredSkills[${index}] must be a string`);
    }
  }
  if (!Array.isArray(lock.files)) {
    throw new Error("lockfile files must be an array");
  }
}

function verifyRequiredSkills(lock, repoRoot) {
  const actual = [...lock.requiredSkills].sort();
  const expected = [...REQUIRED_SKILLS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`lockfile requiredSkills mismatch: expected ${expected.join(", ")}, got ${actual.join(", ")}`);
  }
  for (const skill of REQUIRED_SKILLS) {
    const skillMd = path.join(repoRoot, "skills", skill, "SKILL.md");
    if (!fs.existsSync(skillMd)) {
      throw new Error(`required skill is missing SKILL.md: skills/${skill}/SKILL.md`);
    }
  }
}

function verifyChecksums(lock, repoRoot) {
  const lockFile = "skills/superpowers.lock.json";
  const lockEntries = new Map();
  for (const [index, entry] of lock.files.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`lockfile files[${index}] must be an object with string path and sha256 fields`);
    }
    if (typeof entry.path !== "string" || typeof entry.sha256 !== "string") {
      throw new Error(`lockfile files[${index}] must be an object with string path and sha256 fields`);
    }
    if (lockEntries.has(entry.path)) {
      throw new Error(`duplicate lockfile entry for ${entry.path}`);
    }
    lockEntries.set(entry.path, entry);
  }
  const actualFiles = listFiles(path.join(repoRoot, "skills"))
    .map((filePath) => normalizeRel(filePath, repoRoot))
    .filter((relativePath) => relativePath !== lockFile);

  const expectedPaths = [...lockEntries.keys()].sort();
  const actualPaths = [...actualFiles].sort();
  if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) {
    const missing = expectedPaths.filter((filePath) => !actualPaths.includes(filePath));
    const extra = actualPaths.filter((filePath) => !expectedPaths.includes(filePath));
    throw new Error(`vendored file list mismatch; missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`);
  }

  for (const relativePath of actualPaths) {
    const absolute = path.join(repoRoot, relativePath);
    const actualHash = sha256(absolute);
    const expectedHash = lockEntries.get(relativePath).sha256;
    if (actualHash !== expectedHash) {
      throw new Error(`checksum mismatch for ${relativePath}: expected ${expectedHash}, got ${actualHash}`);
    }
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = path.resolve(args.repo);
    const lock = loadLock(repoRoot);
    verifyLockShape(lock);
    verifyRequiredSkills(lock, repoRoot);
    verifyChecksums(lock, repoRoot);
    console.log(`ok vendored skills verified: ${lock.files.length} file(s), upstream ${lock.upstream.commit}`);
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}

main();
