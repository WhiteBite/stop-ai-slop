# Show HN: Show HN: Stop-ai-slop – zero-dependency linter that blocks AI comment slop at write time

## Post body

Show HN: stop-ai-slop — a zero-dependency linter and gate that blocks AI-generated comment slop *before it lands*.

If you use AI coding agents, you know the output: multi-line narrative comments, `// was X, now Y` changelog notes, "Step 1 / Step 2" filler, banner dividers, markdown inside comments, TODOs without tickets. Tests pass, lint passes — and the code rots anyway.

stop-ai-slop is one Node script (no npm dependencies, no linter engines, no LLM, no network) that enforces a single policy: a comment is at most one line and only states a non-obvious external constraint, an invariant, or a workaround. 15 rules, 160 file extensions, deterministic regex/line-based detection.

What makes it different from the 11 other slop linters we compared (table in the README, facts from their repos as of this week):

- it blocks at the **moment of the write**, not after: an OpenCode plugin rejects the edit, a Claude Code PreToolUse hook denies Write/Edit before they happen. Most alternatives scan after the fact or ask the model to run grep itself.
- zero dependencies — the scanner is a single .mjs file. aislop ships biome/ruff/oxlint engines, windbag a Rust binary, vibecheck Python+ripgrep.
- natural-language markers in **Russian + English + German + French + Spanish** (competitors are English-only).
- invisible-character rules: zero-width and BiDi control detection including escape forms — a supply-chain signal (Trojan Source), not a style issue.
- a fingerprinted baseline for legacy code, SARIF/rdjson output, an MCP server, and a bench that pins 8 mature pre-AI OSS repos to catch false-positive regressions.

It's deliberately narrow: comment policy only. Swallowed exceptions, `as any`, dead code — that's aislop territory; commit-message prose — ai-slop-linter. Use them together.

Install: `npm i -D stop-ai-slop && npx stop-ai-slop --install` (pre-commit hook). Messages are Russian by default, `--lang en` switches everything to English.

MIT. Feedback welcome — especially false positives on your codebase: run `npx stop-ai-slop scan .` and tell us what it got wrong.

## Notes for posting

- Post as **Show HN** (project needs a demo/GitHub link only; this is open source, no demo needed).
- Best time: Tue–Thu, 8–10 am ET.
- Be ready to answer: "why not just ESLint rules?" (ESLint comment rules are style-only — position, case, TODO vocabulary; none detect changelog narration or step numbering), "why not an LLM?" (determinism, no API key, no cost, sub-second, CI-safe), "FP rate?" (bench cohort methodology link).
- Link: https://github.com/WhiteBite/stop-ai-slop
