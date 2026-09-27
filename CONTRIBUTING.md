# Contributing to stop-ai-slop

stop-ai-slop is a zero-dependency comment-slop gate. One scanner (`skill/scripts/scan.mjs`, `const RULES`) is the single source of truth for a one-line / why-only comment policy. It runs as an OpenCode write-time plugin, a pre-commit hook, a Claude Code skill + hooks, a GitHub Action, a GitLab CI template, and an MCP server. Node >= 18. MIT license. Author: WhiteBite.

## Prerequisites

Node.js >= 18. Zero runtime dependencies — no `npm install` needed to run the scanner. If you clone the repo and want npm scripts from `package.json`, run `npm install`.

## Running the scanner

```bash
# Self-test: confirms the detector works on sabotage fixtures
node skill/scripts/scan.mjs --self-test

# Full scan of all supported files in cwd
node skill/scripts/scan.mjs scan .

# Only added lines from staged changes (used by pre-commit)
node skill/scripts/scan.mjs --staged

# Strict mode: warnings also block (exit 1)
node skill/scripts/scan.mjs --staged --strict
```

Exit codes: 0 = clean; 1 = error findings detected; 2 = usage or git error.

## Adding or changing a rule

1. Edit the `const RULES` table in `skill/scripts/scan.mjs`. Each entry has `id`, `severity`, `why`, `instead`, `ignoreWhen`, and optionally `sabotage` fixtures.
2. Add a sabotage fixture to the `--self-test` section so the new rule is tested against known-bad input.
3. Run `node skill/scripts/scan.mjs --self-test` — it must pass (exit 0).
4. Everything else (plugin, hooks, action, CI template, MCP server) only consumes the `RULES` table. No other file needs editing.

## Adding a language profile

New language = one row in the profile table inside `skill/scripts/scan.mjs`. That is all. The table maps file extensions and names to comment syntax (linear marker, block/doc markers, examples).

## Commit messages

Imperative mood, one-line subject <= 100 characters. Body only when the subject does not explain WHY. Maximum three body lines. No emoji. Do not add Co-Authored-By trailers or "Generated with" footers to commits, PRs, or issues.

## Suppression directives

Use `// stop-ai-slop-ignore-next-line [rule-id]`, `// stop-ai-slop-ignore-line [rule-id]`, or `// stop-ai-slop-ignore-file` (after `--` give a reason). Self-suppression in the same diff as the suppressed code is flagged by `vend/self-suppression`.

## Reporting issues

See [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/) for bug reports and feature requests. Use the YAML forms linked from the Issues tab.
