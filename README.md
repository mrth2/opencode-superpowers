# opencode-superpowers

> **OpenCode-only** agent pack that bundles the supported [Superpowers](https://github.com/obra/superpowers) workflow skills with a primary orchestrator and four specialized subagents.

Built for people who:

- use **OpenCode** as their CLI coding agent,
- want a **Copilot Pro-safe default profile** or an optional premium profile,
- and want the Superpowers workflow available through OpenCode agents with one install command.

## What's in the pack

Five OpenCode agents are installed from `agents/`:

| Agent | Mode | Purpose |
| --- | --- | --- |
| `superpowers` | primary | Orchestrator. Brainstorms, then delegates spec / audit / plan / implement. Enforces the skill-first workflow. |
| `superpowers-spec-writer` | subagent | Writes the design spec from an approved brainstorm. |
| `superpowers-spec-auditor` | subagent | Audits a written spec for ambiguity, contradictions, scope creep. |
| `superpowers-plan-writer` | subagent | Turns an approved spec into an executable implementation plan. |
| `superpowers-implementer` | subagent | Executes the approved plan task-by-task with verification gates. |

The installer also installs the supported vendored skill set from `skills/`:

- `using-superpowers`
- `brainstorming`
- `writing-plans`
- `subagent-driven-development`
- `executing-plans`
- `verification-before-completion`

The installer renders the main `superpowers` agent as a generated copy with the selected profile model, and the other agents use the same placeholder token so the installer can render matching copies. The default profile is designed to stay within Copilot Pro-safe model IDs; the premium profile is opt-in.

## What is not bundled

This repository vendors only the minimum upstream Superpowers skills required by the agents listed above. It does not bundle the full upstream plugin runtime, hooks, provider routing, fallback engines, or unrelated skills from `obra/superpowers`.

The vendored snapshot is pinned in `skills/superpowers.lock.json` with the upstream commit SHA and per-file SHA-256 checksums.

## Prerequisites

1. **OpenCode** installed and working.
2. A compatible **GitHub Copilot** model configuration in OpenCode, or the default profile if you want the Pro-safe model set.
3. **Node.js 16 or newer** for the `npx` entrypoint and verification scripts.

You do not need to install `obra/superpowers` separately for this agent pack; the required skills are bundled here.

## Install

### Option A - `npx` recommended for normal users

```sh
npx opencode-superpowers
npx opencode-superpowers --profile default
npx opencode-superpowers --profile premium
```

Packaged installs use copy mode automatically so installed files do not depend on npm cache paths remaining available.

Common flags:

```sh
npx opencode-superpowers --dry-run     # preview only
npx opencode-superpowers --profile default  # Copilot Pro-safe profile
npx opencode-superpowers --profile premium  # opt-in premium profile
npx opencode-superpowers --force       # overwrite conflicting unmanaged entries
npx opencode-superpowers --uninstall   # remove entries recorded in the local manifest
```

### Option B - git clone recommended for local editing

```sh
git clone https://github.com/mrth2/opencode-superpowers ~/Code/opencode-superpowers
cd ~/Code/opencode-superpowers
./scripts/install-opencode.sh
```

Clone installs use symlink mode automatically. Pulling the repo updates linked skill content in place, while the profile-specific `superpowers` agent is rendered as a generated copy. Re-run the installer after `git pull` or a package refresh to reconcile added or removed managed entries.

### Install modes

The installer chooses the mode automatically:

- **Symlink mode** when the source has a `.git` directory or gitfile.
- **Copy mode** when the source looks like a packaged install.

For maintenance testing, the mode can be forced:

```sh
./scripts/install-opencode.sh --mode symlink
./scripts/install-opencode.sh --mode copy
```

### Environment variables

The installer respects:

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENCODE_AGENTS_DIR` | `~/.config/opencode/agents` | Where agent files are installed. |
| `OPENCODE_SKILLS_DIR` | `~/.config/opencode/skills` | Where skill directories are installed. |
| `OPENCODE_SUPERPOWERS_MANIFEST` | `~/.config/opencode/opencode-superpowers-install.json` | Local manifest used for safe update and uninstall. |

## Verify

After installing, restart OpenCode. You should see the five agents and six skills:

```sh
ls ~/.config/opencode/agents/
# superpowers-implementer.md
# superpowers-plan-writer.md
# superpowers-spec-auditor.md
# superpowers-spec-writer.md
# superpowers.md

ls ~/.config/opencode/skills/
# brainstorming
# executing-plans
# subagent-driven-development
# using-superpowers
# verification-before-completion
# writing-plans
```

You can verify the vendored snapshot in a clone with:

```sh
npm run verify:skills
```

Expected output starts with:

```text
ok vendored skills verified:
```

## Updating

- Installed via `git clone`: run `git pull`, then `./scripts/install-opencode.sh` to refresh the manifest and reconcile added or removed managed entries.
- Installed via `npx`: run `npx opencode-superpowers@latest` or rerun `npx opencode-superpowers --profile default` / `--profile premium` after a refresh.

## Uninstall

```sh
# from a clone
./scripts/install-opencode.sh --uninstall

# or via npx
npx opencode-superpowers --uninstall
```

Uninstall reads `~/.config/opencode/opencode-superpowers-install.json` and removes only entries recorded as managed by this project. Manually created sibling agents, skills, and unrelated OpenCode configuration files are left untouched.

## Syncing vendored skills from upstream

Maintainers refresh the vendored snapshot through the sync script:

```sh
rm -rf /tmp/opencode-superpowers-upstream
git clone --depth 1 https://github.com/obra/superpowers.git /tmp/opencode-superpowers-upstream
node scripts/sync-superpowers-skills.mjs --upstream /tmp/opencode-superpowers-upstream
npm test
```

Maintainers can run the sync script manually when refreshing the vendored snapshot; this repository does not currently ship a weekly GitHub Actions sync workflow.

## Customizing

The agents are plain markdown with YAML frontmatter. To change the model source, edit the `model:` placeholder in `agents/<name>.md` and rerun the installer. For example, to swap the orchestrator off the bundled profile flow:

```yaml
model: anthropic/claude-sonnet-4-5
```

Clone installs keep the source templates linked, but packaged installs use generated copies, so rerun the installer after editing a package copy.

## License

[MIT](./LICENSE) © mrth2 and contributors.

The upstream [Superpowers](https://github.com/obra/superpowers) project is licensed separately by its authors. Vendored skill files retain their upstream notices and are pinned in `skills/superpowers.lock.json`.
