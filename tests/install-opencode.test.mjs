import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const installScript = path.join(repoRoot, "scripts", "install-opencode.sh");

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

test("installer dry-run succeeds on portability shims", () => {
  const tempHome = makeTempDir();
  const tempBin = path.join(tempHome, "bin");
  fs.mkdirSync(tempBin, { recursive: true });
  writePortabilitySortShim(tempBin);
  const env = {
    ...process.env,
    HOME: tempHome,
    PATH: `${tempBin}:${process.env.PATH}`,
    OPENCODE_AGENTS_DIR: path.join(tempHome, "agents"),
    OPENCODE_SKILLS_DIR: path.join(tempHome, "skills"),
    OPENCODE_SUPERPOWERS_MANIFEST: path.join(tempHome, "manifest.json"),
  };

  const output = execFileSync("bash", [installScript, "--dry-run"], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  assert.match(output, /mode\s+symlink|mode\s+copy/);
  assert.match(output, /\[dry-run\] mkdir -p/);
});

test("default profile installs gpt-5.4-mini", () => {
  const tempHome = makeTempDir();
  const agentsDir = path.join(tempHome, "agents");
  const env = {
    ...process.env,
    HOME: tempHome,
    OPENCODE_AGENTS_DIR: agentsDir,
    OPENCODE_SKILLS_DIR: path.join(tempHome, "skills"),
    OPENCODE_SUPERPOWERS_MANIFEST: path.join(tempHome, "manifest.json"),
  };
  const agentPath = path.join(agentsDir, "superpowers.md");

  const defaultInstall = runInstaller(["--profile", "default"], { env });
  assert.equal(defaultInstall.status, 0, defaultInstall.stderr || defaultInstall.stdout);
  assert.match(fs.readFileSync(agentPath, "utf8"), /model:\s+github-copilot\/gpt-5\.4-mini/);
});

test("premium profile overwrites an existing conflicting agent file only when --force is used", () => {
  const tempHome = makeTempDir();
  const agentsDir = path.join(tempHome, "agents with space");
  const skillsDir = path.join(tempHome, "skills with space");
  const manifestPath = path.join(tempHome, "manifest.json");
  const env = {
    ...process.env,
    HOME: tempHome,
    OPENCODE_AGENTS_DIR: agentsDir,
    OPENCODE_SKILLS_DIR: skillsDir,
    OPENCODE_SUPERPOWERS_MANIFEST: manifestPath,
  };
  const agentPath = path.join(agentsDir, "superpowers.md");

  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(agentPath, "conflicting contents\n", "utf8");

  const premiumInstall = runInstaller(["--profile", "premium"], { env });
  assert.notEqual(premiumInstall.status, 0);
  assert.match(`${premiumInstall.stdout}\n${premiumInstall.stderr}`, /error: .*superpowers\.md/i);
  assert.equal(fs.readFileSync(agentPath, "utf8"), "conflicting contents\n");

  const forcedPremiumInstall = runInstaller(["--profile", "premium", "--force"], { env });
  assert.equal(forcedPremiumInstall.status, 0, forcedPremiumInstall.stderr || forcedPremiumInstall.stdout);
  assert.match(fs.readFileSync(agentPath, "utf8"), /model:\s+github-copilot\/gpt-5\.5/);
});

test("installer handles spaced destination paths", () => {
  const tempHome = makeTempDir();
  const env = {
    ...process.env,
    HOME: tempHome,
    OPENCODE_AGENTS_DIR: path.join(tempHome, "agents with spaces"),
    OPENCODE_SKILLS_DIR: path.join(tempHome, "skills with spaces"),
    OPENCODE_SUPERPOWERS_MANIFEST: path.join(tempHome, "manifest with spaces.json"),
  };

  const install = runInstaller(["--profile", "default"], { env });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.match(fs.readFileSync(path.join(env.OPENCODE_AGENTS_DIR, "superpowers.md"), "utf8"), /model:\s+github-copilot\/gpt-5\.4-mini/);
});

test("uninstall removes the agent file, manifest, and at least one installed skill path", () => {
  const tempHome = makeTempDir();
  const agentsDir = path.join(tempHome, "agents");
  const skillsDir = path.join(tempHome, "skills");
  const manifestPath = path.join(tempHome, "manifest.json");
  const env = {
    ...process.env,
    HOME: tempHome,
    OPENCODE_AGENTS_DIR: agentsDir,
    OPENCODE_SKILLS_DIR: skillsDir,
    OPENCODE_SUPERPOWERS_MANIFEST: manifestPath,
  };
  const agentPath = path.join(agentsDir, "superpowers.md");
  const installedSkillPath = path.join(skillsDir, "using-superpowers", "SKILL.md");

  const install = runInstaller(["--profile", "default"], { env });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.equal(fs.existsSync(agentPath), true);
  assert.equal(fs.existsSync(manifestPath), true);
  assert.equal(fs.existsSync(installedSkillPath), true);

  const uninstall = runInstaller(["--uninstall"], { env });
  assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
  assert.equal(fs.existsSync(agentPath), false);
  assert.equal(fs.existsSync(manifestPath), false);
  assert.equal(fs.existsSync(installedSkillPath), false);
});

test("invalid profile rejects with error: unknown profile: nope", () => {
  const tempHome = makeTempDir();
  const env = {
    ...process.env,
    HOME: tempHome,
    OPENCODE_AGENTS_DIR: path.join(tempHome, "agents"),
    OPENCODE_SKILLS_DIR: path.join(tempHome, "skills"),
    OPENCODE_SUPERPOWERS_MANIFEST: path.join(tempHome, "manifest.json"),
  };

  const unknownProfile = runInstaller(["--profile", "nope"], { env });
  assert.notEqual(unknownProfile.status, 0);
  assert.match(
    `${unknownProfile.stdout}\n${unknownProfile.stderr}`,
    /error: unknown profile: nope/,
  );
});
