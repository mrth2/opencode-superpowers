# opencode-superpowers

> **OpenCode-only** agent pack that wires the [Superpowers](https://github.com/obra/superpowers) workflow into [OpenCode](https://opencode.ai) as a primary orchestrator + four specialized subagents.

Built for people who:

- use **OpenCode** as their CLI coding agent,
- pay for a **GitHub Copilot subscription** (the agents are pre-routed to `github-copilot/*` models),
- and already know what **Superpowers** is and why they want it.

If you don't match all three, this repo probably isn't for you — go look at the upstream [obra/superpowers](https://github.com/obra/superpowers) first.

## What's in the pack

Five OpenCode agents (in `agents/`):

| Agent | Mode | Purpose |
| --- | --- | --- |
| `superpowers` | primary | Orchestrator. Brainstorms, then delegates spec / audit / plan / implement. Enforces the skill-first workflow. |
| `superpowers-spec-writer` | subagent | Writes the design spec from an approved brainstorm. |
| `superpowers-spec-auditor` | subagent | Audits a written spec for ambiguity, contradictions, scope creep. |
| `superpowers-plan-writer` | subagent | Turns an approved spec into an executable implementation plan. |
| `superpowers-implementer` | subagent | Executes the approved plan task-by-task with verification gates. |

All five are **routed to `github-copilot/*` models** by default — that's the "Copilot subscription" assumption. Edit the `model:` field in each agent file if you want to use a different provider.

## What's not in this repo

This pack ships **agents only**. It deliberately does **not** include:

- the upstream Superpowers **skills** (e.g. `brainstorming`, `writing-plans`, `verification-before-completion`),
- the Superpowers plugin runtime, hooks, provider routing, or fallback engines.

Those are owned by [obra/superpowers](https://github.com/obra/superpowers). The agents in this repo expect those skills to already be available to OpenCode at runtime.

## Prerequisites

1. **OpenCode** installed and working.
2. **Superpowers** installed as an OpenCode plugin. The recommended way:

   ```sh
   opencode plugin add superpowers@git+https://github.com/obra/superpowers.git
   ```

   Or add it manually to `~/.config/opencode/opencode.json`:

   ```json
   {
     "plugin": [
       "superpowers@git+https://github.com/obra/superpowers.git"
     ]
   }
   ```

3. A **GitHub Copilot subscription** configured as a provider in OpenCode (so the `github-copilot/*` model IDs the agents reference actually resolve).

The installer will warn you if it can't detect Superpowers at install time.

## Install

Pick one of the following. All three end up in the same place: symlinks under `~/.config/opencode/agents/`.

### Option A — `npx` (recommended, no clone)

```sh
npx opencode-superpowers
```

> Note: this only works after the package is published to npm. Until then, use Option B or C.

Common flags:

```sh
npx opencode-superpowers --dry-run     # preview only
npx opencode-superpowers --force       # overwrite existing entries
npx opencode-superpowers --uninstall   # remove the symlinks this tool created
```

### Option B — git clone + script

```sh
git clone https://github.com/mrth2/opencode-superpowers ~/Code/opencode-superpowers
cd ~/Code/opencode-superpowers
./scripts/install-opencode.sh
```

This is the recommended path if you want `git pull` to update the agents in place (the installer creates symlinks, so updates flow automatically).

### Option C — one-liner over curl

```sh
curl -fsSL https://raw.githubusercontent.com/mrth2/opencode-superpowers/main/scripts/install-opencode.sh \
  | REPO_URL=https://github.com/mrth2/opencode-superpowers bash
```

> The current installer assumes it's being run from inside a clone of this repo. The curl path requires you to clone first; prefer Option A or B.

### Environment variables

The installer respects:

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENCODE_AGENTS_DIR` | `~/.config/opencode/agents` | Where agent symlinks are written. |
| `OPENCODE_SKILLS_DIR` | `~/.config/opencode/skills` | Used only to detect a legacy filesystem-based Superpowers install. |
| `OPENCODE_CONFIG_FILE` | `~/.config/opencode/opencode.json` | Used to detect Superpowers as an OpenCode plugin. |

## Verify

After installing, restart OpenCode. You should see the five agents available:

```sh
ls ~/.config/opencode/agents/
# superpowers-implementer.md
# superpowers-plan-writer.md
# superpowers-spec-auditor.md
# superpowers-spec-writer.md
# superpowers.md
```

In OpenCode, switch to the `superpowers` agent. It will:

1. Load the `using-superpowers` skill at session start.
2. Drive you through brainstorm → spec → audit → plan → implement.
3. Gate every phase transition with an explicit confirmation question.

If the upstream Superpowers skills aren't installed, the agent will pause and tell you.

## Updating

- Installed via `git clone`: `git pull` inside the clone. Symlinks pick up the new content automatically.
- Installed via `npx`: re-run `npx opencode-superpowers@latest`.

## Uninstall

```sh
# from a clone
./scripts/install-opencode.sh --uninstall

# or via npx
npx opencode-superpowers --uninstall
```

This only removes symlinks that point back into this repo's `agents/` directory. Files you put there manually are left alone.

## Customizing

The agents are plain markdown with YAML frontmatter. To change the model, edit the `model:` line in `agents/<name>.md`. For example, to swap the orchestrator off Copilot:

```yaml
model: anthropic/claude-sonnet-4-5
```

Because the install is symlink-based, your edits in this repo are picked up immediately by OpenCode.

## License

[MIT](./LICENSE) © mrth2 and contributors.

The upstream [Superpowers](https://github.com/obra/superpowers) project is licensed separately by its authors; this repo neither vendors nor redistributes it.
