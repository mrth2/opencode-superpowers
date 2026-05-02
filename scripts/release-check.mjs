#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const PACKAGE_NAME = "opencode-superpowers";

function parseArgs(argv) {
  const args = { repo: process.cwd(), apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw new Error("--repo requires a value");
      }
      args.repo = argv[index + 1];
      index += 1;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log("Usage: node scripts/release-check.mjs [--repo /path/to/repo] [--apply]");
  console.log("  --apply   Write package.json + CHANGELOG.md with computed release info");
}

function runGit(repoRoot, gitArgs) {
  return execFileSync("git", ["-C", repoRoot, ...gitArgs], { encoding: "utf8" }).trim();
}

function runNpm(args, cwd) {
  return execFileSync("npm", args, { encoding: "utf8", cwd }).trim();
}

function parseVersion(input) {
  const match = String(input).trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`invalid semantic version: ${input}`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function toVersionString(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  return 0;
}

function bumpVersion(version, bump) {
  if (bump === "major") return { major: version.major + 1, minor: 0, patch: 0 };
  if (bump === "minor") return { major: version.major, minor: version.minor + 1, patch: 0 };
  return { major: version.major, minor: version.minor, patch: version.patch + 1 };
}

function readPackageJson(repoRoot) {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (packageJson.name !== PACKAGE_NAME) {
    throw new Error(`expected package name ${PACKAGE_NAME}, got ${packageJson.name}`);
  }
  const localVersion = parseVersion(packageJson.version);
  return { packageJsonPath, packageJson, localVersion };
}

function ensureGuardrails(repoRoot) {
  const branch = runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "master") throw new Error(`must run from master branch (current: ${branch})`);

  const status = runGit(repoRoot, ["status", "--porcelain"]);
  if (status.length > 0) throw new Error("working tree is not clean; commit or stash changes first");

  runGit(repoRoot, ["fetch", "origin", "master"]);
  const localHead = runGit(repoRoot, ["rev-parse", "master"]);
  const remoteHead = runGit(repoRoot, ["rev-parse", "origin/master"]);
  if (localHead !== remoteHead) {
    throw new Error("local master is not up to date with origin/master");
  }
}

function collectHistory(repoRoot) {
  const latestTag = runGit(repoRoot, ["describe", "--tags", "--abbrev=0"]);
  const range = `${latestTag}..master`;

  const rawLog = runGit(repoRoot, ["log", "--pretty=%H%x1f%s%x1f%b%x1e", range]);
  const commits = rawLog
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, subject, body] = entry.split("\x1f");
      return {
        sha: sha || "",
        subject: (subject || "").trim(),
        body: (body || "").trim(),
      };
    });

  const diffNameStatus = runGit(repoRoot, ["diff", "--name-status", range]);
  const changes = diffNameStatus
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const status = parts[0];
      const filePath = parts[parts.length - 1];
      return { status, filePath };
    });

  return { latestTag, range, commits, changes };
}

function inferBump(history) {
  const reasons = [];
  const hasMajorCommit = history.commits.some((commit) => {
    const text = `${commit.subject}\n${commit.body}`;
    return /BREAKING CHANGE/i.test(text) || /\w+!\s*:/i.test(commit.subject) || /\bbreaking\b/i.test(text);
  });

  if (hasMajorCommit) {
    reasons.push("found breaking-change signal in commit history");
    return { bump: "major", reasons };
  }

  const hasMinorCommit = history.commits.some((commit) => /^feat(\(.+\))?:\s/i.test(commit.subject));
  const hasAddedProductFiles = history.changes.some(
    (change) => change.status === "A" && /^(agents|bin|scripts|skills)\//.test(change.filePath),
  );

  if (hasMinorCommit || hasAddedProductFiles) {
    if (hasMinorCommit) reasons.push("feature commit detected");
    if (hasAddedProductFiles) reasons.push("new product file added in core paths");
    return { bump: "minor", reasons };
  }

  reasons.push("only fixes/docs/chore-style changes detected");
  return { bump: "patch", reasons };
}

function classifyCommit(subject) {
  if (/^feat(\(.+\))?:\s/i.test(subject)) return "Added";
  if (/^fix(\(.+\))?:\s/i.test(subject)) return "Fixed";
  return "Changed";
}

function stripConventionalPrefix(subject) {
  return subject.replace(/^[a-z]+(\(.+\))?!?:\s*/i, "").trim();
}

function buildChangelogSection(nextVersion, commits) {
  const now = new Date().toISOString().slice(0, 10);
  const groups = { Added: [], Changed: [], Fixed: [] };

  for (const commit of commits) {
    const group = classifyCommit(commit.subject);
    const text = stripConventionalPrefix(commit.subject) || commit.subject;
    if (text) groups[group].push(`- ${text} (${commit.sha.slice(0, 7)})`);
  }

  const lines = [`## v${nextVersion} - ${now}`, ""];
  for (const heading of ["Added", "Changed", "Fixed"]) {
    if (groups[heading].length === 0) continue;
    lines.push(`### ${heading}`);
    lines.push(...groups[heading]);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function writeChangelog(repoRoot, newSection) {
  const changelogPath = path.join(repoRoot, "CHANGELOG.md");
  const header = "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n";
  const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, "utf8") : header;

  if (existing.includes(newSection.split("\n")[0])) {
    throw new Error("CHANGELOG.md already contains this version header");
  }

  const next = `${header}${newSection}\n\n${existing.replace(header, "").trimStart()}`.replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(changelogPath, `${next.trimEnd()}\n`);
  return changelogPath;
}

function writePackageVersion(packageJsonPath, packageJson, nextVersion) {
  const nextPackage = { ...packageJson, version: nextVersion };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(nextPackage, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args.repo);

  ensureGuardrails(repoRoot);

  const { packageJsonPath, packageJson, localVersion } = readPackageJson(repoRoot);
  const npmVersionRaw = runNpm(["view", PACKAGE_NAME, "version"], repoRoot);
  const npmVersion = parseVersion(npmVersionRaw);

  const history = collectHistory(repoRoot);
  const inferred = inferBump(history);
  const nextVersionObj = bumpVersion(localVersion, inferred.bump);

  if (history.commits.length === 0) {
    throw new Error(`no commits found in ${history.range}; nothing to release`);
  }

  if (compareVersions(nextVersionObj, npmVersion) <= 0) {
    throw new Error(
      `computed next version ${toVersionString(nextVersionObj)} is not greater than npm ${toVersionString(npmVersion)}`,
    );
  }

  const nextVersion = toVersionString(nextVersionObj);
  const changelogSection = buildChangelogSection(nextVersion, history.commits);

  if (args.apply) {
    writePackageVersion(packageJsonPath, packageJson, nextVersion);
    writeChangelog(repoRoot, changelogSection);
  }

  const payload = {
    package: PACKAGE_NAME,
    mode: args.apply ? "apply" : "dry-run",
    baseline: { latestTag: history.latestTag, range: history.range },
    versions: {
      local: toVersionString(localVersion),
      npm: toVersionString(npmVersion),
      next: nextVersion,
    },
    bump: {
      level: inferred.bump,
      reasons: inferred.reasons,
    },
    changelogSection,
    commands: [
      "git add package.json CHANGELOG.md",
      `git commit -m \"chore(release): v${nextVersion}\"`,
      "git push origin master",
      "npm publish",
    ],
  };

  console.log(JSON.stringify(payload, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
