import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
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
