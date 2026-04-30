#!/usr/bin/env bash
# Install opencode-superpowers agents into OpenCode by symlink.
#
# OpenCode discovers agents from ~/.config/opencode/agents/*.md. This script
# symlinks each agent from this repo into OpenCode so that `git pull` updates
# them automatically.
# The upstream Superpowers skills repo must be installed separately.
#
# Usage:
#   ./scripts/install-opencode.sh           # install (skip existing non-symlinks)
#   ./scripts/install-opencode.sh --force   # overwrite any existing entries
#   ./scripts/install-opencode.sh --dry-run # show what would happen
#   ./scripts/install-opencode.sh --uninstall # remove symlinks created by this script

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_SRC="$REPO_ROOT/agents"
AGENTS_DEST="${OPENCODE_AGENTS_DIR:-$HOME/.config/opencode/agents}"
SKILLS_DEST="${OPENCODE_SKILLS_DIR:-$HOME/.config/opencode/skills}"
OPENCODE_CONFIG="${OPENCODE_CONFIG_FILE:-$HOME/.config/opencode/opencode.json}"

FORCE=0
DRY_RUN=0
UNINSTALL=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help)
      sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "$AGENTS_SRC" ]]; then
  echo "error: $AGENTS_SRC does not exist" >&2
  exit 1
fi

run() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

force_remove() {
  local path="$1"
  if [[ -d "$path" && ! -L "$path" ]]; then
    run rm -rf "$path"
  else
    run rm -f "$path"
  fi
}

mkdir_dest() {
  local dest="$1"
  if [[ ! -d "$dest" ]]; then
    run mkdir -p "$dest"
  fi
}

superpowers_installed() {
  # Check 1: plugin entry in opencode.json
  if [[ -f "$OPENCODE_CONFIG" ]]; then
    if grep -q 'obra/superpowers' "$OPENCODE_CONFIG" 2>/dev/null; then
      return 0
    fi
  fi

  # Check 2: filesystem skills (legacy / manual install)
  local required_skills=(
    using-superpowers
    brainstorming
    writing-plans
    subagent-driven-development
    verification-before-completion
  )
  local all_present=1
  for skill in "${required_skills[@]}"; do
    if [[ ! -f "$SKILLS_DEST/$skill/SKILL.md" ]]; then
      all_present=0
      break
    fi
  done
  [[ "$all_present" == 1 ]]
}

prompt_install_superpowers() {
  echo ""
  printf 'Install Superpowers now? [y/N] '
  local answer
  read -r answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Add the following to your OpenCode plugin list in $OPENCODE_CONFIG:"
    echo ""
    echo '  "plugin": ['
    echo '    "superpowers@git+https://github.com/obra/superpowers.git"'
    echo '  ]'
    echo ""
    echo "Or run: opencode plugin add superpowers@git+https://github.com/obra/superpowers.git"
    echo ""
    echo "After installing Superpowers, restart OpenCode and the agents will be ready."
    echo ""
  fi
}

warn_if_skills_missing() {
  if ! superpowers_installed; then
    echo "warn  Superpowers not detected (checked $OPENCODE_CONFIG and $SKILLS_DEST)"
    echo "warn  These agents require Superpowers to be installed first."
    if [[ "$DRY_RUN" != 1 ]]; then
      prompt_install_superpowers
    fi
  fi
}

uninstall() {
  local removed_agents=0

  if [[ -d "$AGENTS_DEST" ]]; then
    if compgen -G "$AGENTS_SRC/*.md" > /dev/null; then
      for src in "$AGENTS_SRC"/*.md; do
        [[ -e "$src" ]] || continue
        local name; name="$(basename "$src")"
        local link="$AGENTS_DEST/$name"
        if [[ -L "$link" && "$(readlink "$link")" == "$src" ]]; then
          run rm "$link"
          if [[ "$DRY_RUN" == 1 ]]; then
            echo "would remove $link"
          else
            echo "removed $link"
          fi
          removed_agents=$((removed_agents+1))
        fi
      done
    else
      echo "skip  agents uninstall ($AGENTS_SRC missing or empty)"
    fi
  else
    echo "skip  agents uninstall ($AGENTS_DEST does not exist)"
  fi

  if [[ "$DRY_RUN" == 1 ]]; then
    echo "would uninstall $removed_agents agent symlink(s)"
  else
    echo "uninstalled $removed_agents agent symlink(s)"
  fi
}

install() {
  warn_if_skills_missing
  mkdir_dest "$AGENTS_DEST"

  local agents_installed=0 agents_skipped=0
  if compgen -G "$AGENTS_SRC/*.md" > /dev/null; then
    for src in "$AGENTS_SRC"/*.md; do
      [[ -e "$src" ]] || continue
      local name; name="$(basename "$src")"
      local target="$src"
      local link="$AGENTS_DEST/$name"

      if [[ -e "$link" || -L "$link" ]]; then
        if [[ -L "$link" && "$(readlink "$link")" == "$target" ]]; then
          echo "ok    $name (already linked)"
          agents_installed=$((agents_installed+1))
          continue
        fi
        if [[ "$FORCE" == 1 ]]; then
          force_remove "$link"
        else
          echo "skip  $name (exists; pass --force to overwrite)"
          agents_skipped=$((agents_skipped+1))
          continue
        fi
      fi

      run ln -s "$target" "$link"
      if [[ "$DRY_RUN" == 1 ]]; then
        echo "would link $name -> $target"
      else
        echo "link  $name -> $target"
      fi
      agents_installed=$((agents_installed+1))
    done
  fi

  echo
  if [[ "$DRY_RUN" == 1 ]]; then
    echo "would install $agents_installed agent(s) into $AGENTS_DEST"
  else
    echo "installed $agents_installed agent(s) into $AGENTS_DEST"
  fi
  if [[ "$agents_skipped" -gt 0 ]]; then
    echo "skipped $agents_skipped agent(s) (use --force to overwrite)"
  fi
}

if [[ "$UNINSTALL" == 1 ]]; then
  uninstall
else
  install
fi
