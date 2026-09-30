# Reddit posts

## r/programming + r/node (text post)

**Title:** I compared 12 AI-slop linters, then built the one thing none of them had: blocking the write, not the commit

**Body:**

After a year of AI agents writing comments like `// was cached, now recomputes` and `// Step 3: normalize the payload`, I collected the whole landscape of "slop linters": aislop, windbag, slop-scan, gptlint, dmmulroy/anti-slop, dotnet-slopwatch... (12 tools, table with stars/downloads in the README, facts checked this week).

Patterns I found:
- code-level slop linters (aislop 655★, 47k downloads/mo) — score 0–100, engine-driven
- prose linters — commit messages, PR descriptions
- LLM-based linters — catch paraphrases, need an API key
- **none of them block the edit while the agent is making it** (aislop hooks cover ten agents, but not OpenCode; windbag blocks only in Claude Code)

So: [stop-ai-slop](https://github.com/WhiteBite/stop-ai-slop) — a zero-dependency Node script enforcing "a comment is one line and only the why". 15 rules, 160 extensions, RU+EN+DE+FR+ES markers, zero-width/BiDi detection, fingerprinted baseline, SARIF output, MCP server, and a write-time gate (OpenCode plugin + Claude Code hook + Codex/Gemini/Qwen/Devin hooks).

Deliberately narrow — it complements the code-level tools instead of competing with them.

`npx stop-ai-slop scan .` to try it on your repo (no install needed). If it flags something you'd keep, that's the feedback I want — the FP bench runs on 8 pre-2025 OSS repos, but real codebases are the real test.

## r/ClaudeAI variant

**Title:** A pre-write hook that blocks AI comment slop in Claude Code — before the file is written

**Body:** PreToolUse hook + plugin: `Write`/`Edit` get scanned, slop findings deny the call with the rule rationale fed back to the model. Zero deps, deterministic, RU+EN+DE+FR+ES. Install via `/plugin marketplace add WhiteBite/stop-ai-slop`. Also: OpenCode plugin (write-time rejection), Codex CLI / Gemini CLI / Qwen / Devin hook configs, MCP server, pre-commit, GitHub Action. Comments welcome — especially "here's a comment it flagged that I'd keep".

## Posting notes

- r/programming: link post is allowed for projects; the text variant above performs better with a story.
- r/node, r/typescript, r/ClaudeAI, r/ChatGPTCoding, r/OpenCode — cross-post tailored titles, 1 community per day.
- Do NOT post the same body to multiple subs same-day (spam filters).
- Answer every FP report in-thread; each one is bench material.
