# dev.to article outline

**Working title:** "We compared 12 AI-slop linters — then built the missing one"

**Angle:** data-first postmortem, not a product announcement. The comparison table IS the hook.

## Structure

1. **The problem in one paragraph** — agents over-comment; tests pass, lint passes, code rots. Concrete examples (multi-line narrative, `// was X, now Y`, step numbering, banners).
2. **The landscape scan (the table)** — how we gathered it: competitor READMEs, GitHub metadata, npm downloads, one week of verification. The table: 12 tools × what they scan / languages / write-time blocking / gate model / deps / traction. Honest "where we are worse" (adoption: 449 vs 47k downloads/month; scope: comments only) — honesty is the credibility engine of the post.
3. **Three patterns nobody covers** — (a) write-time blocking inside OpenCode; (b) non-English markers (RU/DE/FR/ES — competitors are EN-only, one even flags correct Russian prose as slop); (c) invisible characters as a supply-chain signal, not style.
4. **What building it taught us** — the interesting engineering: line-based stateful classifiers vs tree-sitter grammars (tradeoff: zero deps vs precision); false-positive regression testing on a pinned pre-AI OSS cohort (bench methodology); the "delete is always an acceptable fix" policy; weak-pair changelog semantics (a lone "instead of" is prose, a pair is a changelog).
5. **The rules table as a comment policy** — 15 rules with rationale; why warnings teach and errors block; the one-line-why-only policy distilled.
6. **Try it** — `npx stop-ai-slop scan .`; surfaces list (OpenCode plugin, Claude Code hooks, pre-commit, CI, MCP, agent rules files); `--lang en`.
7. **Call for false positives** — the bench runs on 8 repos; real codebases are the real test. Link the issues page.

## Distribution notes

- ~1200–1800 words; the table renders fine in dev.to markdown.
- Cross-link: GitHub repo, npm page.
- Tag: #ai #linting #devtools #clean-code
- Reuse: the same table feeds the HN comment answers and the Reddit body.

## Facts to keep current before publishing

- stars/downloads numbers (checked 2026-09-29: aislop 655★/47k mo, slop-scan 319★/35k mo, anti-slop 5.0k★; re-verify on posting day)
- our version: 0.10.0+, `--lang en` available
- the "449 downloads/month" self-number — update with current npm stats for the honesty section
