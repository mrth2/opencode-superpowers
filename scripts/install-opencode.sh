#!/usr/bin/env bash
# Install opencode-superpowers agents and bundled skills into OpenCode.
#
# OpenCode discovers agents from ~/.config/opencode/agents/*.md and filesystem
# skills from ~/.config/opencode/skills/<skill>/SKILL.md. This installer manages
# both sets together and records a local manifest for safe updates and uninstall.
#
# Usage:
#   ./scripts/install-opencode.sh                  # install agents and skills
#   ./scripts/install-opencode.sh --force          # overwrite conflicting entries
#   ./scripts/install-opencode.sh --dry-run        # show planned changes only
#   ./scripts/install-opencode.sh --uninstall      # remove managed entries
#   ./scripts/install-opencode.sh --mode symlink   # force symlink mode
#   ./scripts/install-opencode.sh --mode copy      # force copy mode
#   ./scripts/install-opencode.sh --profile default # install default model profile
#   ./scripts/install-opencode.sh --profile premium # install premium model profile

set -euo pipefail

PROJECT_ID="opencode-superpowers"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_SRC="$REPO_ROOT/agents"
SKILLS_SRC="$REPO_ROOT/skills"
LOCK_FILE="$SKILLS_SRC/superpowers.lock.json"
AGENTS_DEST="${OPENCODE_AGENTS_DIR:-$HOME/.config/opencode/agents}"
SKILLS_DEST="${OPENCODE_SKILLS_DIR:-$HOME/.config/opencode/skills}"
MANIFEST="${OPENCODE_SUPERPOWERS_MANIFEST:-$HOME/.config/opencode/opencode-superpowers-install.json}"

FORCE=0
DRY_RUN=0
UNINSTALL=0
MODE="auto"
PROFILE="default"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --mode)
      MODE="${2:-}"
      if [[ "$MODE" != "symlink" && "$MODE" != "copy" ]]; then
        echo "error: --mode must be symlink or copy" >&2
        exit 2
      fi
      shift 2
      ;;
    --profile)
      PROFILE="${2:-}"
      if [[ "$PROFILE" != "default" && "$PROFILE" != "premium" ]]; then
        echo "error: unknown profile: $PROFILE" >&2
        exit 2
      fi
      shift 2
      ;;
    -h|--help)
      sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

run() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

package_version() {
  node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(p.version);' "$REPO_ROOT/package.json"
}

lock_commit() {
  node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(p.upstream.commit);' "$LOCK_FILE"
}

select_mode() {
  if [[ "$MODE" != "auto" ]]; then
    printf '%s' "$MODE"
  elif [[ -d "$REPO_ROOT/.git" || -f "$REPO_ROOT/.git" ]]; then
    printf 'symlink'
  else
    printf 'copy'
  fi
}

profile_model() {
  case "$PROFILE" in
    default) printf 'github-copilot/gpt-5.4-mini' ;;
    premium) printf 'github-copilot/gpt-5.5' ;;
    *)
      echo "error: unknown profile: $PROFILE" >&2
      exit 2
      ;;
  esac
}

render_superpowers_agent() {
  local src="$1"
  local dest="$2"
  local model
  model="$(profile_model)"
  awk -v model="$model" '
    /^model:[[:space:]]+/ {
      print "model: " model
      next
    }
    { print }
  ' "$src" > "$dest"
}

validate_sources() {
  if [[ ! -d "$AGENTS_SRC" ]]; then
    echo "error: $AGENTS_SRC does not exist" >&2
    exit 1
  fi
  if [[ ! -d "$SKILLS_SRC" ]]; then
    echo "error: $SKILLS_SRC does not exist" >&2
    exit 1
  fi
  if [[ ! -f "$LOCK_FILE" ]]; then
    echo "error: $LOCK_FILE does not exist" >&2
    exit 1
  fi
  node "$REPO_ROOT/scripts/verify-vendored-skills.mjs" --repo "$REPO_ROOT"
}

force_remove() {
  local path="$1"
  if [[ -d "$path" && ! -L "$path" ]]; then
    run rm -rf "$path"
  else
    run rm -f "$path"
  fi
}

is_manifest_managed() {
  local path_to_check="$1"
  [[ -f "$MANIFEST" ]] || return 1
  node -e '
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const wanted = process.argv[2];
const paths = [...(manifest.installedAgents || []), ...(manifest.installedSkills || [])];
process.exit(paths.includes(wanted) ? 0 : 1);
' "$MANIFEST" "$path_to_check"
}

is_current_symlink() {
  local dest="$1"
  local src="$2"
  [[ -L "$dest" && "$(readlink "$dest")" == "$src" ]]
}

install_one() {
  local mode="$1"
  local src="$2"
  local dest="$3"
  local label="$4"

  if [[ -e "$dest" || -L "$dest" ]]; then
    if [[ "$mode" == "symlink" ]] && is_current_symlink "$dest" "$src"; then
      echo "ok    $label (already linked)"
      return 0
    fi
    if is_manifest_managed "$dest"; then
      force_remove "$dest"
    elif [[ "$FORCE" == 1 ]]; then
      echo "force $label (replacing unmanaged existing path)"
      force_remove "$dest"
    else
      echo "error: $dest exists and is not managed by $PROJECT_ID; pass --force to overwrite" >&2
      return 10
    fi
  fi

  if [[ "$mode" == "symlink" ]]; then
    run ln -s "$src" "$dest"
    echo "link  $label -> $src"
  else
    if [[ -d "$src" ]]; then
      run cp -R "$src" "$dest"
    else
      run cp "$src" "$dest"
    fi
    echo "copy  $label -> $dest"
  fi
  return 0
}

install_skill_transform() {
  local src="$1"
  local dest="$2"
  local original_name="$3"
  local new_name="$4"
  local label="skill $new_name (from $original_name)"

  if [[ -e "$dest" || -L "$dest" ]]; then
    if is_manifest_managed "$dest"; then
      force_remove "$dest"
    elif [[ "$FORCE" == 1 ]]; then
      echo "force $label (replacing unmanaged existing path)"
      force_remove "$dest"
    else
      echo "error: $dest exists and is not managed by $PROJECT_ID; pass --force to overwrite" >&2
      return 10
    fi
  fi

  if [[ "$DRY_RUN" == 1 ]]; then
    printf '[dry-run] copy+rename %s -> %s\n' "$src" "$dest"
    return 0
  fi

  if ! node "$REPO_ROOT/scripts/install-skill-rewrite.mjs" \
      --src "$src" \
      --dest "$dest" \
      --original-name "$original_name" \
      --new-name "$new_name"; then
    echo "error: failed to install/transform skill $original_name -> $new_name" >&2
    return 1
  fi
  echo "copy  $label -> $dest"
  return 0
}

has_unmanaged_conflict() {
  local mode="$1"
  local src="$2"
  local dest="$3"

  if [[ ! -e "$dest" && ! -L "$dest" ]]; then
    return 1
  fi
  if [[ "$mode" == "symlink" ]] && is_current_symlink "$dest" "$src"; then
    return 1
  fi
  if is_manifest_managed "$dest"; then
    return 1
  fi
  if [[ "$FORCE" == 1 ]]; then
    return 1
  fi

  echo "error: $dest exists and is not managed by $PROJECT_ID; pass --force to overwrite" >&2
  return 0
}

preflight_install_conflicts() {
  local mode="$1"
  while IFS= read -r -d '' src; do
    local name dest entry_mode rendered_src
    name="$(basename "$src")"
    dest="$AGENTS_DEST/$name"
    entry_mode="$mode"
    rendered_src="$src"
    if [[ "$name" == "superpowers.md" ]]; then
      rendered_src="$(mktemp "${TMPDIR:-/tmp}/opencode-superpowers-agent.XXXXXX")"
      render_superpowers_agent "$src" "$rendered_src"
      entry_mode="copy"
    fi
    if has_unmanaged_conflict "$entry_mode" "$rendered_src" "$dest"; then
      [[ "$rendered_src" != "$src" ]] && rm -f "$rendered_src"
      return 10
    fi
    [[ "$rendered_src" != "$src" ]] && rm -f "$rendered_src"
  done < <(find "$AGENTS_SRC" -maxdepth 1 -type f -name '*.md' -print0)

  while IFS= read -r -d '' src; do
    local original_name new_name dest
    original_name="$(basename "$src")"
    [[ "$original_name" == "superpowers.lock.json" ]] && continue
    new_name="superpowers-$original_name"
    dest="$SKILLS_DEST/$new_name"
    if has_unmanaged_conflict "copy" "$src" "$dest"; then
      return 10
    fi
  done < <(find "$SKILLS_SRC" -mindepth 1 -maxdepth 1 -type d -print0)

  return 0
}

write_manifest() {
  local mode="$1"
  shift
  local package_ver lock_sha upstream_commit
  package_ver="$(package_version)"
  lock_sha="$(sha256_file "$LOCK_FILE")"
  upstream_commit="$(lock_commit)"
  run mkdir -p "$(dirname "$MANIFEST")"
  if [[ "$DRY_RUN" == 1 ]]; then
    echo "would write manifest $MANIFEST"
    return 0
  fi
  node - <<'NODE' "$MANIFEST" "$PROJECT_ID" "$package_ver" "$mode" "$REPO_ROOT" "$lock_sha" "$upstream_commit" "$@"
const fs = require("fs");
const [manifestPath, projectId, packageVersion, mode, sourceRoot, lockSha256, upstreamCommit, ...installed] = process.argv.slice(2);
const installedAgents = installed.filter((entry) => entry.includes("/agents/"));
const installedSkills = installed.filter((entry) => entry.includes("/skills/"));
const manifest = {
  projectId,
  installerVersion: 1,
  packageVersion,
  installMode: mode,
  source: sourceRoot,
  installedAt: new Date().toISOString(),
  lockSha256,
  upstreamCommit,
  installedAgents,
  installedSkills,
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
    echo "manifest $MANIFEST"
}

install_all() {
  validate_sources
  local mode installed_count skipped_count
  mode="$(select_mode)"
  installed_count=0
  skipped_count=0
  echo "mode  $mode"

  if ! preflight_install_conflicts "$mode"; then
    exit 10
  fi

  run mkdir -p "$AGENTS_DEST" "$SKILLS_DEST"

  local installed_paths=()
  while IFS= read -r -d '' src; do
    local name dest entry_mode rendered_src
    name="$(basename "$src")"
    dest="$AGENTS_DEST/$name"
    entry_mode="$mode"
    rendered_src="$src"
    if [[ "$name" == "superpowers.md" ]]; then
      rendered_src="$(mktemp "${TMPDIR:-/tmp}/opencode-superpowers-agent.XXXXXX")"
      render_superpowers_agent "$src" "$rendered_src"
      entry_mode="copy"
    fi
    if install_one "$entry_mode" "$rendered_src" "$dest" "agent $name"; then
      installed_paths+=("$dest")
      installed_count=$((installed_count+1))
    else
      skipped_count=$((skipped_count+1))
    fi
    if [[ "$rendered_src" != "$src" ]]; then
      rm -f "$rendered_src"
    fi
  done < <(find "$AGENTS_SRC" -maxdepth 1 -type f -name '*.md' -print0)

  while IFS= read -r -d '' src; do
    local original_name new_name dest
    original_name="$(basename "$src")"
    [[ "$original_name" == "superpowers.lock.json" ]] && continue
    new_name="superpowers-$original_name"
    dest="$SKILLS_DEST/$new_name"
    if install_skill_transform "$src" "$dest" "$original_name" "$new_name"; then
      installed_paths+=("$dest")
      installed_count=$((installed_count+1))
    else
      skipped_count=$((skipped_count+1))
    fi
  done < <(find "$SKILLS_SRC" -mindepth 1 -maxdepth 1 -type d -print0)

  write_manifest "$mode" "${installed_paths[@]}"
  echo "installed/refreshed $installed_count managed entrie(s)"
  if [[ "$skipped_count" -gt 0 ]]; then
    echo "error: skipped $skipped_count existing unmanaged entrie(s)" >&2
    exit 1
  fi
}

uninstall_from_manifest() {
  if [[ ! -f "$MANIFEST" ]]; then
    return 1
  fi
  local removed=0
  while IFS= read -r -d '' managed_path; do
    if [[ -e "$managed_path" || -L "$managed_path" ]]; then
      force_remove "$managed_path"
      echo "removed $managed_path"
      removed=$((removed+1))
    fi
  done < <(node -e '
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const p of [...(manifest.installedAgents || []), ...(manifest.installedSkills || [])]) process.stdout.write(`${p}\0`);
' "$MANIFEST")
  run rm -f "$MANIFEST"
  echo "uninstalled $removed managed entrie(s)"
}

uninstall_conservative_symlinks() {
  local removed=0
  for dir in "$AGENTS_DEST" "$SKILLS_DEST"; do
    [[ -d "$dir" ]] || continue
    while IFS= read -r -d '' link_path; do
      local target
      target="$(readlink "$link_path")"
      if [[ "$target" == "$REPO_ROOT"/* ]]; then
        force_remove "$link_path"
        echo "removed $link_path"
        removed=$((removed+1))
      fi
    done < <(find "$dir" -maxdepth 1 -type l -print0)
  done
  echo "uninstalled $removed symlink entrie(s) without manifest"
}

uninstall_all() {
  if uninstall_from_manifest; then
    return 0
  fi
  echo "warn  local install manifest not found at $MANIFEST"
  if [[ "$(select_mode)" == "copy" ]]; then
    echo "error: refusing copy-mode uninstall without a managed manifest" >&2
    exit 1
  fi
  uninstall_conservative_symlinks
}

if [[ "$UNINSTALL" == 1 ]]; then
  uninstall_all
else
  install_all
fi
