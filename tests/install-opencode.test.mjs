import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const installScript = path.join(repoRoot, "scripts", "install-opencode.sh");

const AGENT_FILES = [
  "superpowers.md",
  "superpowers-spec-writer.md",
  "superpowers-spec-auditor.md",
  "superpowers-plan-writer.md",
  "superpowers-implementer.md",
];

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "opencode-superpowers-install-test-"));
}

function writePortabilitySortShim(binDir) {
  const sortShim = path.join(binDir, "sort");
  fs.writeFileSync(
    sortShim,
    "#!/usr/bin/env bash\nfor arg in \"$@\"; do\n  if [[ \"$arg\" == \"-z\" ]]; then\n    echo 'sort: illegal option -- z' >&2\n    exit 2\n  fi\ndone\nexec /usr/bin/sort \"$@\"\n",
    { mode: 0o755 },
  );
}

function runInstaller(args, { env, cwd = repoRoot } = {}) {
  return spawnSync("bash", [installScript, ...args], {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function envFor(tempHome, extra = {}) {
  return {
    ...process.env,
    HOME: tempHome,
    OPENCODE_AGENTS_DIR: path.join(tempHome, "agents"),
    OPENCODE_SKILLS_DIR: path.join(tempHome, "skills"),
    OPENCODE_SUPERPOWERS_MANIFEST: path.join(tempHome, "manifest.json"),
    OPENCODE_AUTH_FILE: path.join(tempHome, "no-such-auth.json"),
    ...extra,
  };
}

function readModel(agentsDir, name) {
  const content = fs.readFileSync(path.join(agentsDir, name), "utf8");
  const match = content.match(/^model:\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function readAgent(agentsDir, name) {
  return fs.readFileSync(path.join(agentsDir, name), "utf8");
}

test("installer dry-run succeeds on portability shims", () => {
  const tempHome = makeTempDir();
  const tempBin = path.join(tempHome, "bin");
  fs.mkdirSync(tempBin, { recursive: true });
  writePortabilitySortShim(tempBin);
  const env = envFor(tempHome, {
    PATH: `${tempBin}:${process.env.PATH}`,
  });

  const output = execFileSync("bash", [installScript, "--dry-run", "--profile", "copilot"], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  assert.match(output, /mode\s+symlink|mode\s+copy/);
  assert.match(output, /profile\s+copilot/);
  assert.match(output, /\[dry-run\] mkdir -p/);
});

test("copilot profile renders the expected model on every agent", () => {
  const tempHome = makeTempDir();
  const env = envFor(tempHome);
  const agentsDir = env.OPENCODE_AGENTS_DIR;

  const result = runInstaller(["--profile", "copilot"], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  for (const name of AGENT_FILES) {
    const model = readModel(agentsDir, name);
    assert.ok(model, `${name} missing model field`);
    assert.notEqual(model, "__SUPERPOWERS_MODEL__", `${name} placeholder not rendered`);
  }
  assert.equal(readModel(agentsDir, "superpowers.md"), "github-copilot/gpt-5.4-mini");
  assert.equal(readModel(agentsDir, "superpowers-spec-writer.md"), "github-copilot/gpt-5.4");
  assert.equal(readModel(agentsDir, "superpowers-spec-auditor.md"), "github-copilot/gpt-5.5");
  assert.equal(readModel(agentsDir, "superpowers-plan-writer.md"), "github-copilot/gpt-5.5");
  assert.equal(readModel(agentsDir, "superpowers-implementer.md"), "github-copilot/claude-sonnet-4.6");

  const superpowersContent = readAgent(agentsDir, "superpowers.md");
  assert.match(superpowersContent, /^\s{4}"git \*":\s+allow\s*$/m);
  assert.match(superpowersContent, /^\s{4}"git push\*":\s+ask\s*$/m);
  assert.match(superpowersContent, /^\s{4}"git pull\*":\s+ask\s*$/m);
  assert.match(superpowersContent, /^\s{4}"git merge \*":\s+ask\s*$/m);
  assert.match(superpowersContent, /^\s{4}"git rebase\*":\s+ask\s*$/m);
  assert.match(superpowersContent, /^\s{4}"git reset\*":\s+ask\s*$/m);
  assert.match(superpowersContent, /^\s{4}"git clean\*":\s+ask\s*$/m);

});

test("copilot-lite profile uses no premium model IDs", () => {
  const tempHome = makeTempDir();
  const env = envFor(tempHome);
  const agentsDir = env.OPENCODE_AGENTS_DIR;

  const result = runInstaller(["--profile", "copilot-lite"], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.equal(readModel(agentsDir, "superpowers.md"), "github-copilot/gpt-5.4-mini");
  assert.equal(readModel(agentsDir, "superpowers-spec-writer.md"), "github-copilot/gpt-5.4-mini");
  assert.equal(readModel(agentsDir, "superpowers-spec-auditor.md"), "github-copilot/gpt-5.4");
  assert.equal(readModel(agentsDir, "superpowers-plan-writer.md"), "github-copilot/gpt-5.4");
  assert.equal(readModel(agentsDir, "superpowers-implementer.md"), "github-copilot/gpt-5.4-mini");
});

test("anthropic profile uses the anthropic provider on every agent", () => {
  const tempHome = makeTempDir();
  const env = envFor(tempHome);
  const agentsDir = env.OPENCODE_AGENTS_DIR;

  const result = runInstaller(["--profile", "anthropic"], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.equal(readModel(agentsDir, "superpowers.md"), "anthropic/claude-haiku-4-5");
  assert.equal(readModel(agentsDir, "superpowers-spec-writer.md"), "anthropic/claude-sonnet-4-6");
  assert.equal(readModel(agentsDir, "superpowers-spec-auditor.md"), "anthropic/claude-opus-4-7");
  assert.equal(readModel(agentsDir, "superpowers-plan-writer.md"), "anthropic/claude-opus-4-7");
  assert.equal(readModel(agentsDir, "superpowers-implementer.md"), "anthropic/claude-sonnet-4-6");
});

test("auto-detect picks copilot when github-copilot is in opencode auth", () => {
  const tempHome = makeTempDir();
  const authFile = path.join(tempHome, "auth.json");
  fs.writeFileSync(authFile, JSON.stringify({ "github-copilot": { ok: 1 }, anthropic: { ok: 1 } }));
  const env = envFor(tempHome, { OPENCODE_AUTH_FILE: authFile });
  const agentsDir = env.OPENCODE_AGENTS_DIR;

  const result = runInstaller([], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /profile\s+copilot \(auto-detected\)/);
  assert.equal(readModel(agentsDir, "superpowers.md"), "github-copilot/gpt-5.4-mini");
  assert.equal(readModel(agentsDir, "superpowers-implementer.md"), "github-copilot/claude-sonnet-4.6");
});

test("auto-detect picks anthropic when only anthropic is authed", () => {
  const tempHome = makeTempDir();
  const authFile = path.join(tempHome, "auth.json");
  fs.writeFileSync(authFile, JSON.stringify({ anthropic: { ok: 1 } }));
  const env = envFor(tempHome, { OPENCODE_AUTH_FILE: authFile });
  const agentsDir = env.OPENCODE_AGENTS_DIR;

  const result = runInstaller([], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /profile\s+anthropic \(auto-detected\)/);
  assert.equal(readModel(agentsDir, "superpowers.md"), "anthropic/claude-haiku-4-5");
});

test("auto-detect falls back to copilot with a warning when no auth file", () => {
  const tempHome = makeTempDir();
  const env = envFor(tempHome, { OPENCODE_AUTH_FILE: path.join(tempHome, "missing.json") });

  const result = runInstaller([], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /opencode auth file not found/);
  assert.match(result.stdout, /profile\s+copilot \(auto-detected\)/);
});

test("anthropic profile overwrites an existing conflicting agent file only when --force is used", () => {
  const tempHome = makeTempDir();
  const agentsDir = path.join(tempHome, "agents with space");
  const skillsDir = path.join(tempHome, "skills with space");
  const manifestPath = path.join(tempHome, "manifest.json");
  const env = envFor(tempHome, {
    OPENCODE_AGENTS_DIR: agentsDir,
    OPENCODE_SKILLS_DIR: skillsDir,
    OPENCODE_SUPERPOWERS_MANIFEST: manifestPath,
  });
  const agentPath = path.join(agentsDir, "superpowers.md");

  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(agentPath, "conflicting contents\n", "utf8");

  const conflictingInstall = runInstaller(["--profile", "anthropic"], { env });
  assert.notEqual(conflictingInstall.status, 0);
  assert.match(`${conflictingInstall.stdout}\n${conflictingInstall.stderr}`, /error: .*superpowers\.md/i);
  assert.equal(fs.readFileSync(agentPath, "utf8"), "conflicting contents\n");

  const forced = runInstaller(["--profile", "anthropic", "--force"], { env });
  assert.equal(forced.status, 0, forced.stderr || forced.stdout);
  assert.match(fs.readFileSync(agentPath, "utf8"), /model:\s+anthropic\/claude-haiku-4-5/);
});

test("installer handles spaced destination paths", () => {
  const tempHome = makeTempDir();
  const env = envFor(tempHome, {
    OPENCODE_AGENTS_DIR: path.join(tempHome, "agents with spaces"),
    OPENCODE_SKILLS_DIR: path.join(tempHome, "skills with spaces"),
    OPENCODE_SUPERPOWERS_MANIFEST: path.join(tempHome, "manifest with spaces.json"),
  });

  const install = runInstaller(["--profile", "copilot"], { env });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.match(fs.readFileSync(path.join(env.OPENCODE_AGENTS_DIR, "superpowers.md"), "utf8"), /model:\s+github-copilot\/gpt-5\.4-mini/);
});

test("uninstall removes the agent file, manifest, and at least one installed skill path", () => {
  const tempHome = makeTempDir();
  const agentsDir = path.join(tempHome, "agents");
  const skillsDir = path.join(tempHome, "skills");
  const manifestPath = path.join(tempHome, "manifest.json");
  const env = envFor(tempHome, {
    OPENCODE_AGENTS_DIR: agentsDir,
    OPENCODE_SKILLS_DIR: skillsDir,
    OPENCODE_SUPERPOWERS_MANIFEST: manifestPath,
  });
  const agentPath = path.join(agentsDir, "superpowers.md");
  const installedSkillPath = path.join(skillsDir, "superpowers-using-superpowers", "SKILL.md");

  const install = runInstaller(["--profile", "copilot"], { env });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.equal(fs.existsSync(agentPath), true);
  assert.equal(fs.existsSync(manifestPath), true);
  assert.equal(fs.existsSync(installedSkillPath), true);
  assert.match(
    fs.readFileSync(installedSkillPath, "utf8"),
    /^name:\s+superpowers-using-superpowers\s*$/m,
  );
  assert.match(
    fs.readFileSync(installedSkillPath, "utf8"),
    /^description:\s+Superpowers workflow scope only\. Use inside superpowers-\* agents to establish skill usage discipline for that workflow\.\s*$/m,
  );
  const installedBrainstormingSkillMd = path.join(skillsDir, "superpowers-brainstorming", "SKILL.md");
  assert.equal(fs.existsSync(installedBrainstormingSkillMd), true);
  assert.match(
    fs.readFileSync(installedBrainstormingSkillMd, "utf8"),
    /^name:\s+superpowers-brainstorming\s*$/m,
  );
  assert.match(
    fs.readFileSync(installedBrainstormingSkillMd, "utf8"),
    /^description:\s+Superpowers workflow scope only\. Use inside superpowers-\* agents before design\/spec\/implementation work\.\s*$/m,
  );
  const installedExecutingSkillMd = path.join(skillsDir, "superpowers-executing-plans", "SKILL.md");
  assert.equal(fs.existsSync(installedExecutingSkillMd), true);
  const executingContent = fs.readFileSync(installedExecutingSkillMd, "utf8");
  assert.match(executingContent, /superpowers-writing-plans/);
  assert.ok(
    !/superpowers:writing-plans/.test(executingContent),
    "executing-plans SKILL.md still contains pre-rename `superpowers:writing-plans` reference",
  );

  const uninstall = runInstaller(["--uninstall"], { env });
  assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
  assert.equal(fs.existsSync(agentPath), false);
  assert.equal(fs.existsSync(manifestPath), false);
  assert.equal(fs.existsSync(installedSkillPath), false);
});

test("invalid profile rejects with error: unknown profile: nope", () => {
  const tempHome = makeTempDir();
  const env = envFor(tempHome);

  const unknownProfile = runInstaller(["--profile", "nope"], { env });
  assert.notEqual(unknownProfile.status, 0);
  assert.match(
    `${unknownProfile.stdout}\n${unknownProfile.stderr}`,
    /error: unknown profile: nope/,
  );
});
