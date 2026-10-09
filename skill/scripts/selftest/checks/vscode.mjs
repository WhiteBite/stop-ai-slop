import { execFileSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"

const win32 = process.platform === "win32"

function installLocalPackage(dir) {
  mkdirSync(join(dir, "node_modules", "stop-ai-slop"), { recursive: true })
  mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true })
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", version: "0.0.0" }))
  writeFileSync(
    join(dir, "node_modules", "stop-ai-slop", "package.json"),
    JSON.stringify({ name: "stop-ai-slop", version: "0.0.0", bin: { "stop-ai-slop": "cli.js" } }),
  )
  writeFileSync(join(dir, "node_modules", "stop-ai-slop", "cli.js"), 'console.log("src/a.ts:12 changelog-marker [error] npx finding")\n')
  if (win32) {
    writeFileSync(join(dir, "node_modules", ".bin", "stop-ai-slop.cmd"), '@echo off\r\nnode "%~dp0..\\stop-ai-slop\\cli.js" %*\r\n')
  } else {
    const sh = join(dir, "node_modules", ".bin", "stop-ai-slop")
    writeFileSync(sh, '#!/bin/sh\nexec node "$(dirname "$0")/../stop-ai-slop/cli.js" "$@"\n')
    chmodSync(sh, 0o755)
  }
}

async function removeDir(dir) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
}

function writeFakeScanner(dir) {
  writeFileSync(join(dir, "scan-cli.js"), 'const args = process.argv.slice(2)\nconsole.log(`src/a.ts:12 changelog-marker [error] args=${args.join("|")}`)\n')
  if (win32) {
    writeFileSync(join(dir, "scan.cmd"), '@echo off\r\nnode "%~dp0scan-cli.js" %*\r\n')
    return join(dir, "scan.cmd")
  }
  writeFileSync(join(dir, "scan.sh"), '#!/bin/sh\nexec node "$(dirname "$0")/scan-cli.js" "$@"\n')
  chmodSync(join(dir, "scan.sh"), 0o755)
  return join(dir, "scan.sh")
}

export default async function ({ check, selfRoot }) {
  const extDir = join(selfRoot, "editors", "vscode")
  const extPath = join(extDir, "extension.js")

  let syntaxDetail = ""
  try {
    execFileSync(process.execPath, ["--check", extPath], { stdio: "pipe" })
  } catch (error) {
    syntaxDetail = String(error.stderr ?? error.message)
  }
  check("vscode-ext-syntax: extension.js проходит node --check", syntaxDetail === "", syntaxDetail)

  const req = createRequire(join(extDir, "extension.js"))
  const ext = req("./extension.js")
  const sample = [
    "src/a.ts:12 changelog-marker [error] комментарий пересказывает дифф",
    "  instead: move the why into the commit message",
    "src/b.ts:7 vend/step-numbered [warning] нумерованный шаг в комментарии",
    "src/c.ts:42 long-comment [error] строка комментария длиннее 120 символов",
    "noise line that must be ignored",
    "slop-gate: 3 findings",
  ].join("\n")
  const got = ext.parseFindings(sample)
  const expected = [
    { file: "src/a.ts", line: 12, rule: "changelog-marker", severity: "error", message: "комментарий пересказывает дифф" },
    { file: "src/b.ts", line: 7, rule: "vend/step-numbered", severity: "warning", message: "нумерованный шаг в комментарии" },
    { file: "src/c.ts", line: 42, rule: "long-comment", severity: "error", message: "строка комментария длиннее 120 символов" },
  ]
  check(
    "vscode-ext-parse: parseFindings — 3 находки из текста с instead:/noise, поля совпадают",
    JSON.stringify(got) === JSON.stringify(expected),
    JSON.stringify(got),
  )
  const single = ext.toDiagnosticData("f.ts:1 long-comment [error] msg")
  const skip = ext.toDiagnosticData("  instead: not a finding")
  check(
    "vscode-ext-line: toDiagnosticData парсит строку находки и игнорирует instead:",
    single !== null && single.file === "f.ts" && single.line === 1 && skip === null,
    JSON.stringify({ single, skip }),
  )

  const manifest = JSON.parse(readFileSync(join(extDir, "package.json"), "utf8"))
  const commands = manifest.contributes?.commands?.map((c) => c.command) ?? []
  const props = Object.keys(manifest.contributes?.configuration?.properties ?? {})
  check(
    "vscode-ext-manifest: main/engines/contributes на месте",
    manifest.main === "./extension.js" &&
      typeof manifest.engines?.vscode === "string" &&
      commands.includes("stopAiSlop.scanFile") &&
      commands.includes("stopAiSlop.scanWorkspace") &&
      props.includes("stopAiSlop.command"),
    JSON.stringify({ main: manifest.main, engines: manifest.engines, commands, props }),
  )

  const activationEvents = manifest.activationEvents ?? []
  check(
    "vscode-ext-activation: activationEvents включает onStartupFinished",
    activationEvents.includes("onStartupFinished"),
    JSON.stringify(activationEvents),
  )

  const outcomeCalls = []
  const fakeCollection = {
    set: (uri, diags) => outcomeCalls.push(["set", uri, diags.length]),
    delete: (uri) => outcomeCalls.push(["delete", uri]),
  }
  const outcomeReady = typeof ext.applyScanOutcome === "function"
  if (outcomeReady) {
    ext.applyScanOutcome(fakeCollection, "file:///a.ts", null, [1])
    ext.applyScanOutcome(fakeCollection, "file:///a.ts", new Error("scanner failed"), [])
  }
  check(
    "vscode-ext-error: ошибка скана удаляет прежние диагностики файла",
    outcomeReady &&
      JSON.stringify(outcomeCalls) === JSON.stringify([["set", "file:///a.ts", 1], ["delete", "file:///a.ts"]]),
    outcomeReady ? JSON.stringify(outcomeCalls) : "applyScanOutcome не экспортируется",
  )

  const spawnReady = typeof ext.spawnScanner === "function"
  const fixture = mkdtempSync(join(tmpdir(), "slop-vscode-"))
  try {
    installLocalPackage(fixture)
    const spawn = spawnReady
      ? await new Promise((resolve) => ext.spawnScanner("npx stop-ai-slop", ["scan", "."], fixture, 20000, (err, stdout, stderr) => resolve({ err, stdout, stderr })))
      : null
    check(
      "vscode-ext-spawn: npx stop-ai-slop запускается без ENOENT (win32 .cmd-шим)",
      spawnReady && spawn.err?.code !== "ENOENT",
      spawnReady ? JSON.stringify({ code: spawn.err?.code ?? null, stderr: String(spawn.stderr).slice(0, 120) }) : "spawnScanner не экспортируется",
    )
    check(
      "vscode-ext-spawn-parse: вывод живого спавна парсится в находку",
      spawnReady && spawn.err === null && ext.parseFindings(spawn.stdout).length === 1,
      spawnReady ? JSON.stringify({ code: spawn.err?.code ?? null, stdout: String(spawn.stdout).slice(0, 120) }) : "spawnScanner не экспортируется",
    )

    const spaceDir = join(fixture, "dir with space")
    mkdirSync(spaceDir, { recursive: true })
    const shim = writeFakeScanner(spaceDir)
    const spaceArg = join(spaceDir, "my file.ts")
    writeFileSync(spaceArg, "")
    const quoted = spawnReady
      ? await new Promise((resolve) => ext.spawnScanner(`"${shim}"`, ["scan", spaceArg], fixture, 20000, (err, stdout, stderr) => resolve({ err, stdout, stderr })))
      : null
    check(
      "vscode-ext-quote: пути с пробелами в команде и аргументах доходят целиком",
      spawnReady && quoted.err === null && String(quoted.stdout).includes(`args=scan|${spaceArg}`),
      spawnReady ? JSON.stringify({ code: quoted.err?.code ?? null, stdout: String(quoted.stdout).slice(0, 160) }) : "spawnScanner не экспортируется",
    )

    const hang = join(spaceDir, "hang.js")
    writeFileSync(hang, "setTimeout(() => {}, 2000)\n")
    const slow = spawnReady
      ? await new Promise((resolve) => ext.spawnScanner("node", [hang], fixture, 1000, (err, stdout) => resolve({ err, stdout })))
      : null
    check(
      "vscode-ext-timeout: висячий скан убивается по таймауту",
      spawnReady && slow.err !== null && slow.stdout === "",
      spawnReady ? JSON.stringify({ killed: slow.err?.killed ?? false, code: slow.err?.code ?? null }) : "spawnScanner не экспортируется",
    )
  } finally {
    await removeDir(fixture)
  }
}
