import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const syncScript = path.join(repoRoot, "scripts", "sync-superpowers-skills.mjs");
const requiredSkills = [
  "using-superpowers",
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "executing-plans",
  "verification-before-completion",
];

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "opencode-superpowers-sync-test-"));
}

function copyScriptsOnlyRepo(targetRoot) {
  fs.mkdirSync(path.join(targetRoot, "scripts"), { recursive: true });
  fs.copyFileSync(syncScript, path.join(targetRoot, "scripts", "sync-superpowers-skills.mjs"));
}

function createFixtureUpstream(upstreamRoot, options = {}) {
  const missingSkill = options.missingSkill ?? "";
  const brokenLinkSkill = options.brokenLinkSkill ?? "";

  for (const skill of requiredSkills) {
    if (skill === missingSkill) continue;
    const skillDir = path.join(upstreamRoot, "skills", skill);
    fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
    const linkTarget = skill === brokenLinkSkill ? "references/missing.md" : "references/notes.md";
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), `# ${skill}\n\nRead [local notes](${linkTarget}).\n`, "utf8");
    if (skill !== brokenLinkSkill) {
      fs.writeFileSync(path.join(skillDir, "references", "notes.md"), `${skill} notes\n`, "utf8");
    }
  }
}

test("sync copies required skills and writes a verifiable lockfile", () => {
  const temp = makeTempDir();
  const repo = path.join(temp, "repo");
  const upstream = path.join(temp, "upstream");
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(upstream, { recursive: true });
  copyScriptsOnlyRepo(repo);
  createFixtureUpstream(upstream);

  const output = execFileSync(process.execPath, [path.join(repo, "scripts", "sync-superpowers-skills.mjs"), "--repo", repo, "--upstream", upstream, "--commit", "abc123"], { encoding: "utf8" });
  assert.match(output, /synced 6 skill\(s\)/);

  const lockPath = path.join(repo, "skills", "superpowers.lock.json");
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  assert.equal(lock.upstream.commit, "abc123");
  assert.deepEqual(lock.requiredSkills, requiredSkills);
  assert.ok(lock.files.some((entry) => entry.path === "skills/using-superpowers/SKILL.md"));
  assert.ok(fs.existsSync(path.join(repo, "skills", "writing-plans", "references", "notes.md")));
});

test("sync fails when a required upstream skill is missing", () => {
  const temp = makeTempDir();
  const repo = path.join(temp, "repo");
  const upstream = path.join(temp, "upstream");
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(upstream, { recursive: true });
  copyScriptsOnlyRepo(repo);
  createFixtureUpstream(upstream, { missingSkill: "executing-plans" });

  const result = spawnSync(process.execPath, [path.join(repo, "scripts", "sync-superpowers-skills.mjs"), "--repo", repo, "--upstream", upstream, "--commit", "abc123"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /required upstream skill is missing SKILL\.md: executing-plans/);
});

test("sync fails when a vendored upstream skill has a broken local relative asset link", () => {
  const temp = makeTempDir();
  const repo = path.join(temp, "repo");
  const upstream = path.join(temp, "upstream");
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(upstream, { recursive: true });
  copyScriptsOnlyRepo(repo);
  createFixtureUpstream(upstream, { brokenLinkSkill: "brainstorming" });

  const result = spawnSync(process.execPath, [path.join(repo, "scripts", "sync-superpowers-skills.mjs"), "--repo", repo, "--upstream", upstream, "--commit", "abc123"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing referenced local asset in skills\/brainstorming\/SKILL\.md: references\/missing\.md/);
});
