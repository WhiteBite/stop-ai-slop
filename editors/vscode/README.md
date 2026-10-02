# stop-ai-slop VS Code extension

Inline comment-slop findings in the Problems panel. Zero-build: plain CommonJS, no dependencies, VS Code loads `extension.js` directly.

## Install

Copy or link this directory into your VS Code extensions folder:

```
# Windows (PowerShell)
New-Item -ItemType Junction -Path "$env:USERPROFILE\.vscode\extensions\whitebite.stop-ai-slop-0.1.0" -Target "<repo>\editors\vscode"

# Linux / macOS
ln -s <repo>/editors/vscode ~/.vscode/extensions/whitebite.stop-ai-slop-0.1.0
```

Restart VS Code (or run `Developer: Reload Window`).

## Configuration

One setting, `stopAiSlop.command` (default `npx stop-ai-slop`): the scanner invocation. The string is split on whitespace and executed without a shell, so point it at an absolute bin path when `npx` is not on PATH:

```json
{ "stopAiSlop.command": "node D:/Sources/WhiteBite/stop-ai-slop/skill/scripts/scan.mjs" }
```

## Commands and behavior

- `stop-ai-slop: Scan the current file` — scans the active file, replacing only that file's diagnostics.
- `stop-ai-slop: Scan the workspace` — scans the whole workspace, replacing all diagnostics.
- Saving a file re-scans it automatically.

Findings land in the Problems panel with the rule id as the diagnostic code and severity mapped from the scanner (`error`/`warning`). Scanner errors (e.g. `npx` not found) go to the `stop-ai-slop` output channel, not to toast popups.

The zero-install alternative remains the `tasks.json` problem matcher from the repository README.
