---
name: release
description: Project-scoped npm release workflow for opencode-superpowers. Use whenever the user asks to release, publish, cut a release, bump version, ship, or run npm publish for this repository. Defaults to dry-run preview, then executes commit/push/publish only after explicit confirmation.
---

# Release opencode-superpowers

Use this skill to safely release the `opencode-superpowers` npm package from `master`.

## Default behavior

- Always run in **dry-run** mode first.
- Run `npm run release:check` for deterministic dry-run output.
- Show the computed semver bump, proposed changelog entry, and exact commands.
- Do not modify files, create commits, push, or publish until user confirms.

## Guardrails

- Require current branch to be `master`.
- Require clean working tree (`git status --porcelain` empty).
- Require local `master` to be up to date with `origin/master`.
- Require a version tag baseline (`vX.Y.Z`) reachable from current `master`.
- Require computed next version to be greater than latest published npm version.

If any guardrail fails, stop and report exactly what to fix.

## Version baseline and bump rules

Use the helper script output as source of truth:

1. Resolve latest version tag: `git describe --tags --abbrev=0`.
2. Compare changes from `<latest-tag>..master`.
3. Infer bump from diff using this precedence:
   - `major`: breaking API/behavior, removed/renamed public contract, incompatible CLI/install behavior.
   - `minor`: backward-compatible feature additions.
   - `patch`: fixes, docs-only changes, internal refactors, tests/chore changes without user-facing feature.

When uncertain between two levels, choose the lower level and state uncertainty in dry-run output.

## Changelog policy

- Changelog file path: `CHANGELOG.md` at repo root.
- If missing, create it with a simple heading and release sections.
- Add a new top section for the computed version and current date.
- Include concise bullets grouped as `Added`, `Changed`, `Fixed` (omit empty groups).
- Source entries from commits and diff since latest tag via `scripts/release-check.mjs`.

## Dry-run output format

Always show:

1. Current local version (`package.json`)
2. Latest npm published version (`npm view opencode-superpowers version`)
3. Baseline tag and commit range
4. Inferred bump and reasoning
5. Proposed next version
6. Proposed changelog section
7. Exact execution plan commands

End dry-run with:

`Reply "confirm release" to execute.`

## Execute phase (after explicit confirmation)

Run these steps in order:

1. Re-run guardrails quickly (branch, cleanliness, up-to-date).
2. Apply release updates with script:
   - `npm run release:apply`
3. Commit release artifacts:
   - `git add package.json CHANGELOG.md`
   - `git commit -m "chore(release): v<next-version>"`
4. Push `master`:
   - `git push origin master`
5. Publish package:
   - `npm publish`
6. Confirm completion with published version and commit SHA.

## Failure handling

- If `git push` fails, stop and report; do not run `npm publish`.
- If `npm publish` fails after push, report full error and provide recovery steps.
- Never use force push.
- Never skip hooks unless user explicitly requests it.

## Notes

- This skill is for this repository only (`opencode-superpowers`).
- Do not use this workflow to release unrelated packages.
