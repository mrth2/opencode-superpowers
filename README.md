# opencode-superpowers

> **OpenCode-only** agent pack that bundles the supported [Superpowers](https://github.com/obra/superpowers) workflow skills with a primary orchestrator and four specialized subagents.

Built for people who:

- use **OpenCode** as their CLI coding agent,
- want a smart-detected provider profile (GitHub Copilot or Anthropic) with each agent tuned to a sensible model,
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

The installer also installs the supported vendored skill set from `skills/`. Skills are installed under a `superpowers-` prefix, and their installed `description:` metadata is rewritten to explicitly scope usage to `superpowers-*` agents. Combined with a wildcard rule in `opencode.json`, this prevents bleed into other primary agents (`build`, `plan`, etc.):

- `superpowers-using-superpowers`
- `superpowers-brainstorming`
- `superpowers-writing-plans`
- `superpowers-subagent-driven-development`
- `superpowers-executing-plans`
- `superpowers-verification-before-completion`

The vendored sources under `skills/<name>/` stay byte-identical to upstream `obra/superpowers`; the installer copies each skill to `~/.config/opencode/skills/superpowers-<name>/` and rewrites the SKILL.md `name:` field plus internal `superpowers:<skill>` cross-references during install. Lockfile verification (`npm run verify:skills`) continues to run against the upstream-faithful sources.

The installer renders every agent's `model:` field from the selected profile. Without `--profile`, the installer auto-detects from `~/.local/share/opencode/auth.json` and prefers `copilot` when GitHub Copilot is authed, falling back to `anthropic` when only Anthropic is authed.

### Profiles

| Agent | `copilot` (default when Copilot is authed) | `copilot-lite` | `anthropic` |
| --- | --- | --- | --- |
| `superpowers` (main) | `github-copilot/gpt-5.4-mini` | `github-copilot/gpt-5.4-mini` | `anthropic/claude-haiku-4-5` |
| `superpowers-spec-writer` | `github-copilot/gpt-5.4` | `github-copilot/gpt-5.4-mini` | `anthropic/claude-sonnet-4-6` |
| `superpowers-spec-auditor` | `github-copilot/gpt-5.5` | `github-copilot/gpt-5.4` | `anthropic/claude-opus-4-7` |
| `superpowers-plan-writer` | `github-copilot/gpt-5.5` | `github-copilot/gpt-5.4` | `anthropic/claude-opus-4-7` |
| `superpowers-implementer` | `github-copilot/claude-sonnet-4.6` | `github-copilot/gpt-5.4-mini` | `anthropic/claude-sonnet-4-6` |

The `copilot` profile assumes that delegated subagent calls do not consume Copilot premium-request quota, so it uses top-tier reasoning models (GPT 5.5, Sonnet 4.6) for subagents while keeping the orchestrator on `gpt-5.4-mini`. Use `copilot-lite` if you want to avoid premium-tier model IDs entirely. The matrix lives in `scripts/install-profiles.json` and is easy to fork.

## What is not bundled

This repository vendors only the minimum upstream Superpowers skills required by the agents listed above. It does not bundle the full upstream plugin runtime, hooks, provider routing, fallback engines, or unrelated skills from `obra/superpowers`.

The vendored snapshot is pinned in `skills/superpowers.lock.json` with the upstream commit SHA and per-file SHA-256 checksums.

## Prerequisites

1. **OpenCode** installed and working.
2. A provider configured in OpenCode that matches one of the bundled profiles: a **GitHub Copilot subscription** for the `copilot` / `copilot-lite` profiles, or **Anthropic API access** for the `anthropic` profile. The installer auto-detects which one to use; pass `--profile` to override.
3. **Node.js 16 or newer** for the `npx` entrypoint and verification scripts.

You do not need to install `obra/superpowers` separately for this agent pack; the required skills are bundled here.

## Install

### Option A - `npx` recommended for normal users

```sh
npx opencode-superpowers                        # auto-detect profile from opencode auth
npx opencode-superpowers --profile copilot      # GitHub Copilot, premium-tier subagents
npx opencode-superpowers --profile copilot-lite # Copilot, no premium-tier models
npx opencode-superpowers --profile anthropic    # direct Anthropic API
```

Packaged installs use copy mode automatically so installed files do not depend on npm cache paths remaining available.

Common flags:

```sh
npx opencode-superpowers --dry-run     # preview only
npx opencode-superpowers --force       # overwrite conflicting unmanaged entries
npx opencode-superpowers --uninstall   # remove entries recorded in the local manifest
```

### Option B - git clone recommended for local editing

```sh
git clone https://github.com/mrth2/opencode-superpowers ~/Code/opencode-superpowers
cd ~/Code/opencode-superpowers
./scripts/install-opencode.sh
```

All five agents are always rendered from the source templates with the profile's model IDs substituted in, so agent files install as copies. Skills also install as copies (they are namespaced during install). Re-run the installer after `git pull` or a package refresh to reconcile generated files and managed entries.

### Install modes

The `--mode` flag is informational only since this version: agents are always copy-installed (each is rendered with the profile's model IDs) and skills are always copy-installed (each is namespaced with `superpowers-` and has cross-references rewritten). The mode label is recorded in the manifest:

- **Symlink mode** when the source has a `.git` directory or gitfile.
- **Copy mode** when the source looks like a packaged install.

The mode can still be forced for testing:

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
| `OPENCODE_AUTH_FILE` | `${XDG_DATA_HOME:-~/.local/share}/opencode/auth.json` | OpenCode auth file used for profile auto-detection. |

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
# superpowers-brainstorming
# superpowers-executing-plans
# superpowers-subagent-driven-development
# superpowers-using-superpowers
# superpowers-verification-before-completion
# superpowers-writing-plans
```

You can verify the vendored snapshot in a clone with:

```sh
npm run verify:skills
```

Expected output starts with:

```text
ok vendored skills verified:
```

## Restricting skills to the superpowers agents

OpenCode filesystem skills at `~/.config/opencode/skills/` are visible to every agent that can use the `skill` tool. Because users may have many built-in/custom agents (`build`, `plan`, `task`, project-specific agents, etc.), the safest isolation pattern is:

1. global deny for `superpowers-*` skills,
2. per-agent allow override only for `superpowers*` agents.

This follows [configure permissions](https://opencode.ai/docs/skills/#configure-permissions) + [override per agent](https://opencode.ai/docs/skills/#override-per-agent):

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "superpowers-*": "deny"
    }
  },
  "agent": {
    "superpowers": {
      "permission": { "skill": { "superpowers-*": "allow" } }
    },
    "superpowers-spec-writer": {
      "permission": { "skill": { "superpowers-*": "allow" } }
    },
    "superpowers-spec-auditor": {
      "permission": { "skill": { "superpowers-*": "allow" } }
    },
    "superpowers-plan-writer": {
      "permission": { "skill": { "superpowers-*": "allow" } }
    },
    "superpowers-implementer": {
      "permission": { "skill": { "superpowers-*": "allow" } }
    }
  }
}
```

This catches unknown/future agents automatically, without needing to enumerate them. The metadata layer from this package (installed descriptions narrowed to `superpowers-*` workflow usage) improves trigger quality, but this permission setup is the hard enforcement that prevents cross-agent bleed.

This snippet is opt-in. The installer does not modify your `opencode.json`.

## Updating

- Installed via `git clone`: run `git pull`, then `./scripts/install-opencode.sh --profile default` or `./scripts/install-opencode.sh --profile premium` to refresh the manifest and reconcile generated files and managed entries.
- Installed via `npx`: run `npx opencode-superpowers@latest --profile default` or `npx opencode-superpowers@latest --profile premium`.

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

Clone installs use symlinks for non-rendered agent files, so edits to those agents in this repo are picked up immediately by OpenCode after restart. The profile-specific main agent is rendered as a generated copy. Skills always install as copy-with-rewrite (the installer prefixes them with `superpowers-` and rewrites cross-references), so rerun the installer after editing a vendored skill or after `git pull`.

## License

[MIT](./LICENSE) © mrth2 and contributors.

The upstream [Superpowers](https://github.com/obra/superpowers) project is licensed separately by its authors. Vendored skill files retain their upstream notices and are pinned in `skills/superpowers.lock.json`.
