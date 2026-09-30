# awesome-list PR texts

## awesome-claude-code (hesreallyhim/awesome-claude-code, 54.8k★)

**PR title:** Add stop-ai-slop — comment-slop gate with PreToolUse blocking

**PR body:**

Adds [stop-ai-slop](https://github.com/WhiteBite/stop-ai-slop) — a zero-dependency comment linter and gate for AI-generated slop, with first-class Claude Code support:

- **PreToolUse hook** blocks `Write`/`Edit` before the file is written, feeding the rule rationale back to the model
- **PostToolUse hook** prints findings for the just-written file into the session
- installs from the plugin marketplace: `/plugin marketplace add WhiteBite/stop-ai-slop` + `/plugin install stop-ai-slop`
- also ships: agent skill, MCP server, pre-commit hook, GitHub Action, Codex/Gemini/Qwen/Devin hook configs, rules files for Cursor/Windsurf/Cline/Aider
- 15 deterministic rules (multi-line narratives, changelog markers, step-numbering, banner dividers, markdown-in-comments, ticketless TODOs, invisible zero-width/BiDi characters), RU+EN+DE+FR+ES markers, fingerprinted baseline, SARIF/rdjson output

Suggested entry (Linters/Quality section):

```markdown
- [stop-ai-slop](https://github.com/WhiteBite/stop-ai-slop) - Zero-dependency comment-slop gate: PreToolUse hook blocks Write/Edit before the write; skill + MCP + pre-commit + CI included.
```

## awesome-opencode (awesome-opencode/awesome-opencode, 10.4k★)

**PR title:** Add stop-ai-slop — write-time comment gate (plugin)

**PR body:**

Adds [stop-ai-slop](https://github.com/WhiteBite/stop-ai-slop). The OpenCode write-time plugin rejects `write`/`edit` calls whose added lines contain error-level comment slop — the only tool in the slop-linter space that gates inside OpenCode (verified against aislop/windbag/slop-scan hook lists this week). One-file zero-dep scanner, dual 1.x/2.x plugin support via the official `{ id, server, setup }` export, JSONL audit log of every gate decision, MCP server, agent skill, pre-commit, CI.

Suggested entry (Plugins / Quality gate section):

```markdown
- [stop-ai-slop](https://github.com/WhiteBite/stop-ai-slop) - Write-time comment-slop gate: rejects write/edit calls with error findings; zero-dep scanner, MCP server, skill, pre-commit, CI.
```

## Notes

- Read each list's CONTRIBUTING first (entry format, table columns, min-star thresholds). awesome-claude-code requires the README to have specific sections — ours has install, usage, license.
- Expect review lag of days; keep PRs one-line + description.
