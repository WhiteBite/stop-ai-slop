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

One setting, `stopAiSlop.command` (default `npx stop-ai-slop`): the scanner invocation. The string is tokenized on whitespace (double quotes keep one token together) and executed through a shell, so point it at an absolute bin path when `npx` is not on PATH:

```json
{ "stopAiSlop.command": "node D:/Sources/WhiteBite/stop-ai-slop/skill/scripts/scan.mjs" }
```

Paths with spaces must be quoted in the setting itself:

```json
{ "stopAiSlop.command": "\"C:\\Program Files\\nodejs\\node.exe\" \"D:\\My Tools\\scan.mjs\"" }
```

## Windows

On Windows `npx` is a `.cmd` shim, so the extension runs the scanner through a shell (`shell: true`); spawning it without one fails with ENOENT. Every command and argument token containing spaces is quoted before the spawn. A scan that hangs is killed after 30 s and reported as a scanner failure.

## Commands and behavior

- `stop-ai-slop: Scan the current file` — scans the active file, replacing only that file's diagnostics.
- `stop-ai-slop: Scan the workspace` — scans the whole workspace, replacing all diagnostics.
- Saving a file re-scans it automatically.
- The extension activates on startup (`onStartupFinished`) and scans the visible editors, so findings appear without running a command first.

Findings land in the Problems panel with the rule id as the diagnostic code and severity mapped from the scanner (`error`/`warning`). If the scanner fails, the stale diagnostics of the affected file (or of the whole workspace scan) are cleared instead of lingering. Scanner errors (e.g. `npx` not found) go to the `stop-ai-slop` output channel, not to toast popups.

The zero-install alternative remains the `tasks.json` problem matcher from the repository README.
