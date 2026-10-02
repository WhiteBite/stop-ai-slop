import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

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
}
