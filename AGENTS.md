# AGENTS.md — instructions for AI coding agents

## Comment policy (dogfooded)

This repo enforces its own comment-slop gate. Every commit MUST pass:

```
node skill/scripts/scan.mjs --staged
```

Before committing, also run the detector self-test to confirm the scanner is healthy:

```
node skill/scripts/scan.mjs --self-test
```

The gate must stay green. Do not disable it.

### The rule

One-line comments only. A comment must state a non-obvious external constraint, invariant, or workaround. Changelogs live in commits, not code. No multi-line narrative, no "was / became" markers, no banner dividers, no step-numbered filler. JSDoc/docstring for public API contracts is allowed; restating the signature inside them is not.

### Single source of truth

All detection rules are defined in one place: `const RULES` in `skill/scripts/scan.mjs`. Everything else (OpenCode plugin, pre-commit hook, Claude Code hooks, GitHub Action, GitLab CI template, MCP server) only consumes this table. To add or change a rule, edit that table and update the sabotage fixture in `--self-test` fixtures.

## Commit messages

Imperative mood, one-line subject <= 100 characters. Body only when the subject does not explain WHY. Maximum three body lines. No emoji, no Co-Authored-By trailers, no "Generated with" footers.

## Adding a language profile

New language = one row in the profile table inside `skill/scripts/scan.mjs`. That is all.

## Suppression directives

Use `// stop-ai-slop-ignore-next-line [rule-id]`, `// stop-ai-slop-ignore-line [rule-id]`, or `// stop-ai-slop-ignore-file` (after `--` give a reason). Self-suppression in the same diff as the suppressed code is flagged by `vend/self-suppression`.
