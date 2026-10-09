"use strict"

const { execFile } = require("node:child_process")
const path = require("node:path")

const SCAN_TIMEOUT_MS = 30000

let vscodeModule = null
function getVSCode() {
  if (vscodeModule === null) vscodeModule = require("vscode")
  return vscodeModule
}

function toDiagnosticData(line) {
  const m = line.match(/^(.+):(\d+)\s+(\S+)\s+\[(error|warning)\]\s+(.*)$/)
  if (!m) return null
  return { file: m[1], line: Number(m[2]), rule: m[3], severity: m[4], message: m[5] }
}

function parseFindings(text) {
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const data = toDiagnosticData(line)
    if (data !== null) out.push(data)
  }
  return out
}

function tokenizeCommand(line) {
  const tokens = []
  const re = /"([^"]*)"|(\S+)/g
  let m
  while ((m = re.exec(line)) !== null) tokens.push(m[1] !== undefined ? m[1] : m[2])
  return tokens
}

function quoteToken(token) {
  if (!/[\s"]/.test(token)) return token
  if (process.platform === "win32") return `"${token}"`
  return `'${token.replace(/'/g, `'\\''`)}'`
}

// npx on Windows is a .cmd shim: execFile without a shell spawns ENOENT
function spawnScanner(commandLine, args, cwd, timeoutMs, done) {
  // with shell:true node only concatenates args, so every token is quoted here
  const line = [...tokenizeCommand(commandLine), ...args].map(quoteToken).join(" ")
  execFile(line, [], { cwd, shell: true, timeout: timeoutMs, windowsHide: true }, done)
}

let collection = null
let output = null

function configuredCommand() {
  return getVSCode().workspace.getConfiguration("stopAiSlop").get("command", "npx stop-ai-slop")
}

function toDiagnostic(data) {
  const vs = getVSCode()
  const ln = Math.max(0, data.line - 1)
  const severity = data.severity === "error" ? vs.DiagnosticSeverity.Error : vs.DiagnosticSeverity.Warning
  const diag = new vs.Diagnostic(new vs.Range(ln, 0, ln, 1), `${data.rule} ${data.message}`, severity)
  diag.source = "stop-ai-slop"
  diag.code = data.rule
  return diag
}

function runScan(args, cwd, handler) {
  spawnScanner(configuredCommand(), args, cwd, SCAN_TIMEOUT_MS, (err, stdout, stderr) => {
    if (stderr) output.appendLine(String(stderr).trimEnd())
    if (err && !stdout) {
      output.appendLine(`scanner failed: ${err.message}`)
      handler(err, [])
      return
    }
    handler(null, parseFindings(stdout))
  })
}

function applyScanOutcome(target, uri, err, diagnostics) {
  if (err !== null) target.delete(uri)
  else target.set(uri, diagnostics)
}

function scanFile(uri) {
  const vs = getVSCode()
  const folder = vs.workspace.getWorkspaceFolder(uri)
  const cwd = folder ? folder.uri.fsPath : path.dirname(uri.fsPath)
  runScan(["scan", uri.fsPath], cwd, (err, findings) => {
    applyScanOutcome(collection, uri, err, findings.map(toDiagnostic))
  })
}

function scanWorkspace() {
  const vs = getVSCode()
  const folders = vs.workspace.workspaceFolders
  if (!folders || folders.length === 0) return
  const root = folders[0].uri.fsPath
  runScan(["scan", "."], root, (err, findings) => {
    collection.clear()
    if (err !== null) return
    const byFile = new Map()
    for (const data of findings) {
      const abs = path.isAbsolute(data.file) ? data.file : path.join(root, data.file)
      const list = byFile.get(abs) ?? []
      list.push(toDiagnostic(data))
      byFile.set(abs, list)
    }
    for (const [abs, list] of byFile) collection.set(vs.Uri.file(abs), list)
  })
}

function activate(context) {
  const vs = getVSCode()
  collection = vs.languages.createDiagnosticCollection("stop-ai-slop")
  output = vs.window.createOutputChannel("stop-ai-slop")
  context.subscriptions.push(collection, output)
  context.subscriptions.push(
    vs.commands.registerCommand("stopAiSlop.scanFile", (uri) => {
      const target = uri ?? vs.window.activeTextEditor?.document.uri
      if (target) scanFile(target)
    }),
  )
  context.subscriptions.push(vs.commands.registerCommand("stopAiSlop.scanWorkspace", scanWorkspace))
  context.subscriptions.push(
    vs.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.scheme === "file") scanFile(doc.uri)
    }),
  )
  for (const editor of vs.window.visibleTextEditors) {
    if (editor.document.uri.scheme === "file") scanFile(editor.document.uri)
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  parseFindings,
  toDiagnosticData,
  tokenizeCommand,
  spawnScanner,
  applyScanOutcome,
}
