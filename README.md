# stop-ai-slop

**English** | [Русский](README.ru.md)

[![npm version](https://img.shields.io/npm/v/stop-ai-slop)](https://www.npmjs.com/package/stop-ai-slop)
[![license](https://img.shields.io/github/license/WhiteBite/stop-ai-slop)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![zero-deps](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

> **stop-ai-slop is a zero-dependency comment linter and gate that blocks AI-generated comment slop before it lands in your codebase.** One scanner (`skill/scripts/scan.mjs`, the `RULES` table) is the single source of truth for a one-line, why-only comment policy. It is enforced at write-time (OpenCode plugin, Claude Code PreToolUse hook), at commit-time (pre-commit hook installed with `--install`), and in CI (GitHub Action, GitLab CI template) — and it also runs as an MCP server. Node >= 18, zero npm dependencies, MIT licensed, works on Windows, Linux and macOS.

AI coding agents over-comment: multi-line narrative blocks, `// was X, now Y` changelog notes, `Step 1 / Step 2` filler, banner dividers, markdown inside comments, `TODO` without a ticket, even invisible zero-width and BiDi characters. stop-ai-slop catches all of it deterministically — no LLM, no scoring threshold, no network — and blocks the offending edit or commit.

## Why stop-ai-slop

- **Zero dependencies.** The scanner is a single `.mjs` file; the OpenCode plugin is a single `.ts` file. No biome, ruff, oxlint, Python or ripgrep to install.
- **Blocks at the moment of the edit, not after.** The OpenCode plugin rejects `write`/`edit`/`multiedit`; the Claude Code PreToolUse hook denies `Write`/`Edit` before they happen. Most alternatives only scan after the fact, or ask the model to run grep itself.
- **Multi-language natural-language detection.** Changelog markers, numbered steps and "This function…" openers are matched in RU + EN + DE + FR + ES. Competitors are English-only.
- **One source of truth.** Every rule lives in a single `RULES` table; `--explain <rule-id>` prints each rule's rationale (Why / Instead of / Write / Ignore it when).
- **Machine-readable output.** `text` (default), Reviewdog `rdjson`, and SARIF 2.1.0 for GitHub code scanning.
- **Legacy-friendly.** A baseline grandfathers existing findings so the gate only fires on new slop.
- **Wide enforcement surface.** OpenCode, Claude Code, Cursor, Codex, GitHub Actions, GitLab CI, MCP, VS Code, IntelliJ IDEA.

## What you get, and what installs automatically

One scanner (`skill/scripts/scan.mjs`, the `RULES` table) is exposed through eight surfaces. They are independent: enable the ones you need, none conflict, and all enforce the same rules.

| Surface | What it does | How it gets installed |
| --- | --- | --- |
| CLI (`stop-ai-slop` bin) | scans files, staged changes or a diff; `--explain`, `--audit`, baseline | automatic with `npm i -D stop-ai-slop` |
| pre-commit hook + npm scripts | blocks every commit that adds slop | automatic: `npx stop-ai-slop --install` |
| OpenCode write-time plugin | rejects `write`/`edit`/`multiedit` at the moment of the write | manual: a one-line stub file (below) |
| Claude Code plugin | skill + PreToolUse hook (blocks `Write`/`Edit`) + PostToolUse hook (prints findings back into the session) | automatic: `/plugin marketplace add` + `/plugin install` |
| Agent skill (`skill/SKILL.md`) | teaches the policy and the commands to any agent | automatic with the Claude Code plugin; a manual junction/symlink for OpenCode |
| MCP server (`--mcp`) | pull-mode `slop_scan` / `slop_explain` / `slop_baseline` for any MCP client | manual: one config entry per client |
| GitHub Action / GitLab CI template | blocks PR/MR pipelines on the diff | manual: a workflow / CI snippet |
| VS Code task / IDEA File Watcher | on-demand or on-save scan inside the IDE | manual: a snippet / template import |

### Install in two commands

```
npm i -D stop-ai-slop
npx stop-ai-slop --install        # writes the pre-commit hook + npm scripts into the current repo
```

`--install` is the only command that modifies your repo: it appends a marked block to `.git/hooks/pre-commit` (idempotent, never clobbers an existing hook) and adds the `stop-ai-slop` / `stop-ai-slop:all` npm scripts. The hook embeds the absolute path to the scanner as of install time — after moving or re-cloning the scanner, run `--install` again.

### Nothing happens silently

`npm i -D stop-ai-slop` has no postinstall script: it only places files under `node_modules`. No hook, editor config or agent setting is touched until you run `--install` or add one of the snippets below yourself.

### Which surfaces to pick

- **Git-only teams** — the two commands above; done.
- **OpenCode users** — add the plugin stub so slop is rejected at write time: create `~/.config/opencode/plugins/comment-gate.ts` with one line, `export { CommentGate } from "<path to node_modules>/stop-ai-slop/plugin/comment-gate.ts"`.
- **Claude Code users** — `/plugin marketplace add WhiteBite/stop-ai-slop` then `/plugin install stop-ai-slop`; the skill and both hooks arrive automatically.
- **Any MCP client (Cursor, Codex, others)** — add the stdio entry `npx stop-ai-slop --mcp` (see "MCP server").
- **CI** — add the GitHub Action or the GitLab include (see "IDE and CI").

## What it enforces, and why

Policy: a comment is at most one line and only states a non-obvious external constraint, an invariant, or a workaround. The retelling of a diff belongs in the commit message; the "why" of a test belongs in the test name. The rule table and the detector live in `skill/scripts/scan.mjs` (the `RULES` const) — change rules there; everything else only applies them.

Error rules block (exit 1; the write-time gate throws). Warning rules teach: they are printed but do not block (unless `--strict`).

## Enforcement points

1. **OpenCode write-time plugin** — `plugin/comment-gate.ts` intercepts `write`/`edit`/`multiedit` and rejects an edit that has error findings at the moment of the write. Mounted into `~/.config/opencode/plugins/` via a re-export stub.
2. **Pre-commit hook via `--install`** — one command weaves `node .../scan.mjs --staged` into `.git/hooks/pre-commit` (idempotent: appends a marked block without clobbering an existing hook) and adds the `stop-ai-slop` / `stop-ai-slop:all` npm scripts to package.json. The hook and npm scripts embed the absolute path to the scanner as of install time — after moving or re-cloning the scanner, run `--install` again.
3. **Agent skill** — `skill/SKILL.md` (name: `stop-ai-slop`): the policy, the rule table, the run modes. Mounts into OpenCode and Claude Code.
4. **Baseline for legacy** — 1) `--install`, 2) `--baseline-write` (records current findings), 3) commit the baseline, 4) from then on the gate sees only new findings; edits above baselined lines shift line numbers and resurrect legacy — fix with `--baseline-prune`, which removes baseline entries that have no live finding; a repeated `--baseline-write` would also amnesty new slop — do not do that.

## Quick start

```
git clone https://github.com/WhiteBite/stop-ai-slop && cd stop-ai-slop
node skill/scripts/scan.mjs --self-test       # detector sabotage test
node skill/scripts/scan.mjs scan .            # full scan: git-tracked + untracked non-ignored files, generated/binary/artifacts skipped
node skill/scripts/scan.mjs --staged          # only lines added in git diff --cached
node skill/scripts/scan.mjs --diff <ref>      # added lines of tracked files relative to <ref>; untracked files are invisible
node skill/scripts/scan.mjs --fix --dry-run   # preview the mechanical fixes as a unified diff, change nothing
node skill/scripts/scan.mjs --fix             # apply the mechanical fixes, then rescan and report what is left
node skill/scripts/scan.mjs --strict          # warnings also block the gate (exit 1)
node skill/scripts/scan.mjs --install         # npm scripts + pre-commit hook in the current repo
node skill/scripts/scan.mjs --install --strict  # same, but the hook runs --strict
node skill/scripts/scan.mjs --baseline-write    # record current findings into the baseline
node skill/scripts/scan.mjs --baseline-prune    # remove baseline entries with no live finding
node skill/scripts/scan.mjs --help              # help for all flags
```

Suppression directives: `// stop-ai-slop-ignore-next-line [rule-id]` (next line), `// stop-ai-slop-ignore-line [rule-id]` (current line), `// stop-ai-slop-ignore-file` (whole file); after `--` give a reason.

Exit 1 — there are error findings outside the baseline; otherwise 0. Exit 2 — a usage or git error (bad flag, nonexistent ref).

## Output formats

By default — human-readable text with a final `slop-gate: …` line. The `--format <text|json|sarif>` flag (modes `scan`, `--staged`, `--diff`) switches stdout to a machine-readable format: only JSON is printed, the summary line is omitted. Exit codes do not depend on the format — still 0/1/2.

`--format json` — Reviewdog RDFormat: a single JSON object on one line (pipe-friendly), `diagnostics` sorted by path and line, an empty result is `diagnostics: []`:

```
npx stop-ai-slop --diff origin/main --format json | reviewdog -f=rdjson -reporter=github-pr-review
```

`--format sarif` — SARIF 2.1.0 with two-space indent; the `rules` array lists every rule regardless of findings, `results` only the real findings. Upload to GitHub code scanning:

```yaml
- run: npx stop-ai-slop --diff origin/${{ github.base_ref }} --format sarif > results.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

## Autofix (`--fix`)

`--fix` applies the deterministic, mechanical fixes across the whole scan scope in one pass — no agent, no LLM, no per-finding rewrite. Preview first, then apply:

```
node skill/scripts/scan.mjs --fix --dry-run   # print a unified diff of every planned change, touch nothing
node skill/scripts/scan.mjs --fix             # write the changes, then rescan and report what is left
```

`--dry-run` never writes: it prints a per-file unified diff (context 2) and a summary line `запланировано N правок в M файлах; не чинится автоматически: K`, exit 0. Apply mode writes the files, then rescans and prints the surviving findings through the normal text pipeline (exit 1 if an error finding remains outside the baseline, so it chains into CI). `--strict` also treats surviving warnings as a failure. The fixer is idempotent: a second `--fix` is a no-op.

**Fixed mechanically** (deletion or in-place shrink — "delete" is always an acceptable outcome per the policy):

| Rule | Fix |
| --- | --- |
| `multi-line-comment`, `vend/file-summary-header` | delete the whole comment run |
| `vend/section-divider` | delete the divider line (or strip it from an inline comment) |
| `changelog-marker` | delete a full-line comment; strip the trailing comment off a code line |
| `vend/step-numbered` | strip the numbered-step prefix, keep the rest of the text |
| `vend/zero-width-chars`, `vend/bidi-controls` | remove the real invisible/BiDi characters |

**Not auto-fixed** — they need a human or an agent to write a replacement, so `--fix` leaves them and reports them: `long-comment` (compress the meaning), `vend/this-function-opener` (rephrase as an invariant), `vend/generic-todo` (add a ticket), `vend/markdown-in-comment` (semantic), `vend/cjk-noise` (rewrite the identifier).

Safety rails: a block-comment opener is never deleted mid-block (only whole runs go); a real invisible character is stripped but its backslash-escape spelling in source (a BOM test literal) is left intact — that is the subject of the code, not slop; a legit emoji ZWJ sequence and a leading BOM are preserved; a `stop-ai-slop-ignore-next-line` directive is dropped together with the code it guarded only when that target line is itself deleted, so no directive is left dangling; suppression directives and the findings they cover are never touched. Generated, binary and git-ignored files are skipped exactly as in the scan.

For bulk semantic cleanup (the not-auto-fixed rules), the intended flow is: `--fix` first to clear the mechanical majority, then an agent pass over the residual report — or `--baseline-write` to grandfather what the team decides to keep.

## Configuration

An optional `.stop-ai-slop.yaml` in the repository root (same place as the baseline: the git root, or the scan directory outside a repo). Read by the `scan`, `--staged`, `--diff` and `--pre-tool` modes; the OpenCode write-time plugin does not read the config and runs on defaults. The parser is a zero-dep YAML subset: `key: value` scalars, lists via `- `, a `rules:` section with two-space indent, `#` comments and blank lines skipped, values may be quoted. Unknown keys are ignored; an invalid severity is exit 2 with the file name and line number.

| Key | Meaning |
| --- | --- |
| `maxCommentLength` | comment-line length threshold for `long-comment` (default 120) |
| `excludePaths` | list of relative path prefixes: a path is excluded if it equals an entry or starts with `entry/`; works in the full scan and in diff modes |
| `generatedPaths` | list of relative path prefixes treated as generated (same prefix semantics as `excludePaths`); see [Generated code](#generated-code) |
| `scanGenerated` | `true` disables the generated-file exemption — generated code is linted like any other file |
| `rules` | severity override per rule id: `error`, `warning` or `off` (rule disabled) |

```yaml
maxCommentLength: 100
excludePaths:
  - generated
  - docs/api.md
rules:
  multi-line-comment: off
  vend/step-numbered: error
```

Severity remap is applied after detection and before baseline filtering and exit-code computation; the baseline matches on `rel:line` regardless of severity, so changing a severity in the config neither resurrects nor masks baselined findings.

## MCP server

The `--mcp` flag runs stop-ai-slop as an MCP server over stdio (JSON-RPC 2.0). This is pull-mode: any MCP client calls the scanner itself before editing a file.

```
npx stop-ai-slop --mcp
```

The server supports protocols `2024-11-05`, `2025-11-25` and `2026-07-28` — the version is negotiated on `initialize`. stdout carries only protocol messages; logs go to stderr.

Three tools:

| Tool | Arguments | Description |
| --- | --- | --- |
| `slop_scan` | `{ path?: string }` | Full scan of a directory or file; returns text findings |
| `slop_explain` | `{ ruleId: string }` | Returns a rule's rationale (Why / Instead of / Write / Ignore it when) |
| `slop_baseline` | `{}` | Prints the baseline entries (`relpath:line` format) |

Client setup:

**Claude Code** (`.mcp.json`):

```json
{
  "mcpServers": {
    "stop-ai-slop": {
      "command": "npx",
      "args": ["stop-ai-slop", "--mcp"]
    }
  }
}
```

**OpenCode / Cursor** (stdio entry in the configuration):

```json
{
  "mcpServers": {
    "stop-ai-slop": {
      "command": "npx",
      "args": ["stop-ai-slop", "--mcp"]
    }
  }
}
```

## Blocking before the write (Claude Code)

The `--pre-tool` flag reads a PreToolUse JSON payload from stdin (`{ tool_name, tool_input }`), scans the proposed delta content (the `Write` content, or the `Edit` difference — `new_string` minus `old_string`), and on error findings prints them to stderr and exits with code 2 — Claude Code cancels the tool call and shows the reason to the model. A clean payload exits 0 with no output.

The plugin already carries the hook (`.claude-plugin/stop-ai-slop/hooks/hooks.json`, matcher `Write|Edit`), so a marketplace install gets it automatically. For manual setup, add to `.claude/settings.json`:

```json
{
  "hooks": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "node \"<path to repo>/skill/scripts/scan.mjs\" --pre-tool"
        }
      ]
    }
  ]
}
```

The alternative decision form via `hookSpecificOutput.permissionDecision` (deny) exists, but this hook uses exit 2 + stderr to surface multi-line findings.

## IDE and CI

### VS Code

A `tasks.json` task with a problem matcher to highlight findings in the Problems panel:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "stop-ai-slop scan",
      "type": "shell",
      "command": "npx stop-ai-slop scan",
      "problemMatcher": {
        "owner": "external",
        "source": "stop-ai-slop",
        "severity": "error",
        "fileLocation": ["relative", "${workspaceFolder}"],
        "pattern": {
          "regexp": "^(.+):(\\d+)\\s+(\\S+)\\s+\\[(error|warning)\\]\\s+(.+)$",
          "file": 1,
          "line": 2,
          "code": 3,
          "severity": 4,
          "message": 5
        }
      },
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    }
  ]
}
```

One-line pattern: nested `instead:` lines simply do not match. Run from the terminal or bind to a hotkey.

### GitLab CI

The `templates/stop-ai-slop.gitlab-ci.yml` template blocks MR pipelines on the diff (exit code); no code-quality report is shipped. Wire it in:

```yaml
include:
  - project: 'WhiteBite/stop-ai-slop'
    file: '/templates/stop-ai-slop.gitlab-ci.yml'
    ref: <tag>
```

## CI (GitHub Actions)

```yaml
on: pull_request:
  jobs:
    slop:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: WhiteBite/stop-ai-slop@main
          with:
            base: ${{ github.base_ref }}
```

The action fetches the base ref itself, so a standard shallow checkout is enough; `strict: "true"` enables warnings-as-errors; `format: "json"` or `format: "sarif"` switches the action output to a machine-readable format (see "Output formats"). The action does not run on push events (there is no `github.base_ref`) — use `pull_request` or pass `base` explicitly.

## Publishing to npm

Bootstrap, once: the first publish of a new package needs interactive confirmation — `npm publish` in a terminal: npm either asks for an OTP (if 2FA is on) or offers browser-approve ("Authenticate your account at …"), which is enough without an OTP and without 2FA; the third path is a granular token with bypass-2FA in `~/.npmrc`. Right after it: npmjs.com → package Settings → Trusted publishing → add `WhiteBite/stop-ai-slop` and the `publish.yml` workflow; if that form requires enabling 2FA, that is the only place it is mandatory for fully automatic tags.

After that, deploy is tag-driven: bump the version in `package.json` + add a CHANGELOG entry, commit, `git tag vX.Y.Z && git push origin main --tags`. The `.github/workflows/publish.yml` workflow (trigger `push: tags: v*`) runs the self-test, skips the publish if that version is already in the registry (tag arrival order does not matter), and publishes via OIDC with provenance. Node 24 in the workflow is required: OIDC publishing needs npm CLI >= 11.5.1.

## Mounting on another machine

```
git clone https://github.com/WhiteBite/stop-ai-slop <path>
New-Item -ItemType Junction -Path "$env:USERPROFILE\.config\opencode\skills\stop-ai-slop" -Target "<path>\skill"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\stop-ai-slop" -Target "<path>\skill"
```

OpenCode write-time plugin: a file `%USERPROFILE%\.config\opencode\plugins\comment-gate.ts` with the single line
`export { CommentGate, detectCommentSlop } from "<path>/plugin/comment-gate.ts"`.
The cmd.exe equivalent is `mklink /J`; on Linux/macOS use `ln -s`. In any git repo without agents, `scan.mjs --install` works.

## Other integrations

### pre-commit framework
```yaml
repos:
  - repo: https://github.com/WhiteBite/stop-ai-slop
    rev: v0.3.0
    hooks:
      - id: stop-ai-slop
```

The hook runs `--staged` on every commit.

### Claude Code / Cursor / Codex

The repository is a ready Claude Code plugin marketplace:

```
/plugin marketplace add WhiteBite/stop-ai-slop
/plugin install stop-ai-slop
```

The plugin carries the skill and a PostToolUse hook (`Write|Edit` → `scan.mjs --stdin-path`) that prints findings for the just-written file back into the session. Cursor and Codex read the same hook schema: copy `.claude-plugin/stop-ai-slop/hooks/hooks.json` into your repo's `.cursor/hooks.json` / `.codex/hooks.json`, fixing the path to `scan.mjs`.

## IntelliJ IDEA

### File Watchers (Ultimate)

The `idea/filewatchers/stop-ai-slop.xml` template imports via Settings → Tools → File Watchers → + → Import. After importing, replace `<path-to-scan.mjs>` with the absolute path to `skill/scripts/scan.mjs` on your machine. The template targets the common types (Kotlin, Java, TypeScript, JavaScript, Python, YAML); other scanner profiles are covered by External Tools or the CLI `scan`. Runs on every file change; scan exclusions are the standard artifact directories (`venv`, `node_modules`, `.git`, `build`, `target`, `.next`, `out`, `Pods`, `site-packages`, `.dart_tool`, `.gradle`).

Findings appear in the Run window with clickable paths, because the scanner output format is `file:line`.

### Actions on Save (all IDEA 2024+ editions)

There is no built-in support for external commands. Two working options:

1. **External Tools** (Settings → Tools → External Tools → +): program = `node`, arguments = `<path>/scan.mjs scan $FilePath$`, working directory = `$FileDir$`. Trigger manually or via the [Save Actions](https://plugins.jetbrains.com/plugin/7668-save-actions) plugin.
2. **File Watcher** (see above) — the only on-save option without third-party plugins; available only in Ultimate.

## Debugging

The OpenCode plugin writes every gate decision to a JSONL log (`~/.config/opencode/logs/comment-gate.jsonl`, path overridden by the `STOP_AI_SLOP_LOG` variable): `loaded`, `blocked` and `passed` events with the tool, file and rules. Inspect:

```
node skill/scripts/scan.mjs --audit        # counters + last 20 entries
node skill/scripts/scan.mjs --audit 50     # last 50
```

The plugin is loaded by the OpenCode process at session start: after editing `plugin/comment-gate.ts`, restart OpenCode, otherwise the old version runs (the audit log shows this immediately by the absence of new entries).

## Language profiles

Comment syntax comes from a language profile, not a single shared list: `#` is a comment in `.py/.sh/.yaml` but a preprocessor directive in `.c` and an attribute in `.rs`. 160 extensions and 26 file names are supported: `Dockerfile`, `Containerfile`, `Makefile`, `GNUmakefile`, `Justfile`, `Rakefile`, `Vagrantfile`, `Gemfile`, `CMakeLists.txt`, `Jenkinsfile`, `BUILD`, `BUILD.bazel`, `WORKSPACE`, `WORKSPACE.bazel`, `meson.build`, `SConstruct`, `SConscript`, `Pipfile`, `Procfile`, `.env`, `.gitignore`, `.dockerignore`, `.npmignore`, `.gitattributes`, `.gitmodules`, `.editorconfig`. Matching: exact file name → extension → name prefix, so suffixed variants (`Dockerfile.dev`, `Makefile.am`) are detected by prefix, while `build.gradle` stays c-family — a bare `BUILD` does not capture it.

| Profile | Line comment | Block / doc | Examples |
| --- | --- | --- | --- |
| c-family | `//` | `/* */`, `/** */`, `{/* */}` | ts, js, kt, java, go, rs, cs, c, cpp, swift, dart, scala, mts, cts, sol, v, sv, qml, styl, res |
| css | `//`, `/*` | `/* */` | css, scss, less |
| py | `#` | `"""` / `'''` | py, pyi, vy |
| hash | `#` | — | rb, php, sh, yaml, toml, ex, raku, awk, go.mod, go.sum, Dockerfile, Makefile, .gitignore |
| hashblock | `#`, `/*` | `/* */` | nix, hcl, tf, tfvars |
| powershell | `#` | `<# #>` | ps1, psm1 |
| julia | `#` | `#= =#` | jl |
| nim | `#` | `#[ ]#` | nim |
| sql | `--` | `/* */` | sql, plsql, pks, pkb |
| dash | `--` | — | vhd, vhdl, adb, ads |
| lua / haskell | `--` | `--[[ ]]` / `{- -}` | lua, hs, elm, purs, idr, agda, dhall |
| lisp | `;` | — | clj, el, scm, rkt |
| percent | `%` | — | tex, bib, erl |
| fortran / vb / batch / vim | `!` / `'` / `::`, `REM` / `"` | — | f90, vb, bat, vim |
| rst | `..` | — | rst |
| markup | `<!--` | `<!-- -->` | html, xml, svg, md, mdx, xsl |
| vue | `//`, `/*`, `<!--` | `/* */`, `{/* */}`, `<!-- -->` | vue, svelte, astro |
| ocaml | `(*` | `(* *)` | ml, mli |
| pascal | `//`, `(*` | `(* *)` | pas, pp, fs (F#) |
| coffee | `#` | `### ###` | coffee, litcoffee |
| adoc | `//` | `//// ////` | adoc, asciidoc |
| handlebars | `{{!` | `{{!-- --}}` | hbs |
| gotmpl | `{{/*` | `{{/* */}}` | tpl, gotmpl, gohtml, tmpl |
| ini / properties | `;`, `#` / `#`, `!` | — | ini, properties, .editorconfig |

`.m` is not scanned: the extension is ambiguous (Objective-C vs MATLAB). `.pp` is also ambiguous (Puppet vs Pascal) — marked as pascal. Not scanned: COBOL, assembly (`.asm`/`.s`), `.ahk`, `.ipynb`, server-side engine templates (`.erb`, `.ejs`, `.jsp`, `.cshtml`, `.razor`, `.twig`, `.blade.php`, `.pug`, `.haml`). A new language is added with one row in the `scan.mjs` profile table.

## Rules

| Rule | Severity | What it catches |
| --- | --- | --- |
| `multi-line-comment` | error | a comment spans 2+ consecutive lines (doc-blocks and `///` doc-comment runs exempt) |
| `changelog-marker` | error | a comment restates the diff: a pair of weak markers (было/стало, вместо/теперь, previously/instead of, …) inside one comment run, or a strong marker (`this fixes`, `must take over`, `was X, now Y`, `broke, so`) on its own; a lone weak marker is ordinary prose and is not flagged |
| `long-comment` | error | a comment line longer than 120 characters (doc-blocks exempt) |
| `vend/step-numbered` | warning | a numbered step in a comment (Step N / Шаг N / Schritt N / Étape N / Paso N / N., any language marker) |
| `vend/section-divider` | warning | a divider line made of -=#* characters |
| `vend/markdown-in-comment` | warning | markdown syntax inside a comment (**, -, \|); a table row needs at least three pipes (`\| a \| b \|`), a lone `\|flag\|` in prose is not flagged |
| `vend/this-function-opener` | warning | a comment starts with "This function/class/method/component", "Эта функция/Этот класс", "Diese Funktion", "Cette fonction" or "Esta función" |
| `vend/file-summary-header` | warning | a 2+ line summary-header comment at the top of a file |
| `vend/generic-todo` | warning | a TODO without a ticket link |
| `vend/self-suppression` | warning | a suppression directive arrives in the same diff as the code it suppresses |
| `vend/cjk-noise` | warning | CJK characters glued to Latin letters or digits in the code part of a line (a generation artifact) |
| `vend/zero-width-chars` | error | an invisible zero-width character (U+200B, U+200C, U+200D, U+2060, U+FEFF or an escape form) |
| `vend/bidi-controls` | error | BiDi controls (U+202A–U+202E, U+2066–U+2069 or an escape form) that override text direction |

Error rules do not apply to doc-blocks (JSDoc `/** … */`, Python docstrings, and `///` doc-comment lines — dartdoc, rustdoc, C# XML doc): contract documentation for classes and functions may be any length. Inside doc-blocks, changelog markers (error) and signature restatement "This function…" (warning) are still caught.

Text rules (`step-numbered`, `markdown-in-comment`, `this-function-opener`) are matched on the text after the comment marker is stripped, so they work in every profile — `# Шаг 3` in yaml and `-- Step 3` in sql are caught identically. `step-numbered`, `this-function-opener` and `changelog-marker` understand RU + EN + DE + FR + ES ("Шаг N", "Schritt N", "Étape N", "Diese Funktion", "au lieu de", "ya no", etc.); other natural languages are not covered. Structural rules (multi-line, divider, header, todo) do not depend on the wording language. `step-numbered` and `markdown-in-comment` do not fire inside doc-blocks.

Full rationale per rule (Why / Instead of / Write / Ignore it when, from the same `RULES` table):

```
node skill/scripts/scan.mjs --explain <rule-id>
```

Rule ids and service labels are EN; messages and rationales are RU. The `vend/` prefix = rules vendored from external pattern catalogs.

The detector sees inline comments after code (`const x = 1 // was`), block comments without a marker on middle lines, doc-blocks of any length (contract JSDoc/docstrings/`///`), UTF-16 files with a BOM; zero-width characters (U+200B–U+200F, U+FEFF) are stripped when matching markers and simultaneously flagged as findings on raw lines together with BiDi controls (U+202A–U+202E, U+2066–U+2069) — including escape forms in the source; a ZWJ inside emoji sequences and a BOM at position 0 are not flagged. CJK adjacency to Latin letters or digits is checked only in the code part of a line: Chinese comments and i18n strings without Latin adjacency are legitimate. In prose formats (`.md`/`.mdx`/`.html`/`.xml`/`.rst`/`.adoc`) CJK adjacency is not checked at all: mixed JP/CN prose with Latin brand names is normal there. Not scanned: languages without a profile (see the table above; `.m` is ambiguous), binary and office formats; `--staged` and `--diff` do not see untracked files. Warnings do not block the gate unless `--strict` is given. Non-ASCII file names are supported in diff modes.

**What the full scan walks.** Inside a git repository, `scan` enumerates files via `git ls-files --cached --others --exclude-standard`, so everything git-ignored is invisible: `__pycache__`, `.venv`, build outputs, vendored trees, downloaded toolchains, packaged runtimes, minified bundles, compiled `.dart.js`. Outside a repo it falls back to a directory walk. On top of that, hard-coded artifact directories are always skipped (`venv`, `build`, `.next`, `target`, `out`, `.gradle`, `Pods`, `__pycache__`, `.idea`, `.codegraph`, `site-packages`, `.dart_tool`, `coverage`, `.git`, `node_modules`, `dist`).

**Generated files are exempt from the slop rules** in every mode (full scan, diff, write-time gate) — detection layers, user signals and knobs are in [Generated code](#generated-code). A file whose first 8 KB contain a NUL byte is treated as binary and skipped (UTF-16 with a BOM is decoded first, so it is not mistaken for binary). YAML block scalars (`key: |`, `- >`) are string content, not comments: their lines are never flagged.

License headers are exempt from the multi-line rule. Inline comments are detected by the profile markers (`//`, `#`, `--`, `%`, `;`, `!`) except py/fs floor division (`//`).

## Generated code

Generated files are exempt from the slop rules in every mode (full scan, diff, write-time gate). Three detection layers, any one is enough:

1. **Unique file-name suffixes** nobody writes by hand — build_runner (`*.g.dart`, `*.freezed.dart`, `*.gr.dart`, `*.chopper.dart`, `*.pb*.dart`), protoc (`*_pb2.py`, `*_pb2.pyi`, `*_pb.go`, `*_grpc.pb.go`, `*.pb.cc/h/hpp/cpp`, `*.pb.mojom.*`), Kubernetes `zz_generated.*`, stringer `*_string.go`, sqlc (`*.sql.go`, `*.querier.go`), .NET (`*.Designer.cs`, `*.g.i.cs`, `*AssemblyAttributes.cs`, `GlobalUsings.g.cs`), bundles (`*.min.js`, `*.min.css`, `*.bundle.js`). Ambiguous names (`*.gen.go`, `*.generated.ts`, `*_Factory.java`, `*.g.cs`, `mock_*.go`, `*.d.ts`) are deliberately **not** name-exempt — too many false positives; they are exempt only through a header below.
2. **Tool-named headers** in the first 10 lines: `@generated`, `Code generated by … DO NOT EDIT`, `generated code - do not modify by hand`, `<auto-generated`, `automatically generated by rust-bindgen`, `@generated by prost-build`, `@javax.annotation.Generated(`, `generated by openapi-generator`, `code generated by sqlc`.
3. **Ad-hoc generators**: both `generat…`/`codegen` and `do not edit/modify` within the first 10 lines. A bare `DO NOT EDIT` without a generator word does not exempt — hand-written policy files stay linted.

Two user signals sit on top of the layers: a `.gitattributes` line with `linguist-generated` (the GitHub linguist convention) and the `generatedPaths` list in `.stop-ai-slop.yaml` (same prefix semantics as `excludePaths`).

Semantics: on a generated file the slop rules are exempt, but the security rules `vend/zero-width-chars`, `vend/bidi-controls` and `vend/cjk-noise` still fire — poisoned codegen is a supply-chain signal, not a style issue. The write-time gate ignores generated files entirely (machine output is not the moment to teach style). Set `scanGenerated: true` in `.stop-ai-slop.yaml` to lint generated code like any other file.

## Comparison with alternatives

Facts from the competitors' READMEs (aislop, ai-slop-linter, vibecheck-slop-stopper, slop-scan, windbag), September 2026 (re-verified 2026-09-28).

| | stop-ai-slop | aislop | ai-slop-linter | vibecheck | slop-scan | windbag |
| --- | --- | --- | --- | --- | --- | --- |
| What it scans | comments in code, 13 rules | code slop: 50+ rules, 10 languages | prose: commits, PRs, docs, 21 rules | 78 grep rules across all categories | JS/TS: error-handling, mocks | change-narration comments, 5 rules (HISTORY_NARRATION, HEDGE_LANGUAGE, TICKET_ID, VERBOSE_COMMENT, OBVIOUS_COMMENT), 10 languages |
| Blocks at the moment of the edit | yes: the OpenCode plugin rejects edit/write | claude/cursor/gemini/pi hooks, no OpenCode | no | no: the skill asks the LLM to run grep itself | no | yes for Claude Code (PostToolUse hook blocks), no OpenCode |
| Russian language | changelog markers ru+en, plus de/fr/es marker packs | EN rules | EN rules; their own benchmark: em-dash on correct Russian prose — 24 hits per 1000 words | EN | EN | EN only |
| Dependencies | 0: the scanner is one .mjs; the OpenCode plugin is a .ts | npm package + external engines (biome, ruff, oxlint) | 0 (npm package, zero runtime deps) | Python + ripgrep | npm package | Rust binary shipped as a PyPI wheel |
| Gate model | policy: rule → exit 1 | score 0–100 with a failBelow threshold | weighted score per 1000 words | severity levels | score and delta comparison | per-line violations, hook blocks |
| Custom policy | RULES table in one file, `--explain` per rule | per-rule severity, new rules only in their repo | ignore/only per file | rules.toml | config and plugins | none documented |
| Source of facts | competitor READMEs: scanaislop/aislop, Bubblegunn/ai-slop-linter, qinnovates/vibecheck-slop-stopper, modem-dev/slop-scan, scale-venture-partners/windbag (September 2026, re-verified 2026-09-28) | — | — | — | — | — |

Where we are narrower and do not claim: comment policy only. Swallowed exceptions, `as any`, dead code — the territory of aislop and grain; EN prose and commit messages — ai-slop-linter. stop-ai-slop complements them exactly where they do not reach: the moment of the edit in OpenCode, and Russian changelog markers.

## License

MIT — see [LICENSE](LICENSE).
