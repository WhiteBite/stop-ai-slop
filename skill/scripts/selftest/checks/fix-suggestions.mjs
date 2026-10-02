import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const PREFIX = "fix-suggestions: "

export default async function ({ check, selfPath }) {
  const run = (args, cwd, input) => {
    const env = { ...process.env, STOP_AI_SLOP_LANG: "ru" }
    try {
      return {
        status: 0,
        stdout: execFileSync(process.execPath, [selfPath, ...args], { cwd, encoding: "utf8", stdio: "pipe", env, input }),
        stderr: "",
      }
    } catch (error) {
      return { status: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }
    }
  }
  const parseLine = (s) => {
    const last = s.trimEnd().split("\n").at(-1)
    if (!last.startsWith(PREFIX)) return null
    try {
      return JSON.parse(last.slice(PREFIX.length))
    } catch {
      return null
    }
  }
  const work = mkdtempSync(join(tmpdir(), "slop-gate-fixsug-"))
  try {
    const longLine = "// " + "lorem ".repeat(40).trimEnd()
    const content = ["// this fixes the cache miss", "const a = 1", "// Step 1: normalize the payload", "const b = 2", longLine, "const c = 3", ""].join("\n")
    writeFileSync(join(work, "target.ts"), content)
    const fileLines = content.split("\n")

    const res = run(["scan", ".", "--fix-suggestions"], work)
    const entries = parseLine(res.stdout)
    check(
      "fix-suggestions: scan --fix-suggestions завершается строкой с валидным JSON [exit 1]",
      res.status === 1 && entries !== null,
      `exit ${res.status}: ${res.stdout.slice(-300)}`,
    )
    const shapeOk = (e) => JSON.stringify(Object.keys(e).sort()) === JSON.stringify(["file", "from", "kind", "line", "rule", "to"])
    const del = entries?.find((e) => e.rule === "changelog-marker")
    const rep = entries?.find((e) => e.rule === "vend/step-numbered")
    check(
      "fix-suggestions: delete-line/replace-line совпадают с планом --fix, from = реальная строка файла",
      entries !== null &&
        entries.length === 2 &&
        entries.every(shapeOk) &&
        del?.kind === "delete-line" &&
        del.line === 1 &&
        del.file === "target.ts" &&
        del.to === null &&
        del.from === fileLines[0] &&
        rep?.kind === "replace-line" &&
        rep.line === 3 &&
        rep.from === fileLines[2] &&
        rep.to === "// normalize the payload",
      JSON.stringify(entries),
    )
    check(
      "fix-suggestions: long-comment (не чинится автоматически) записи не получает",
      entries !== null && !entries.some((e) => e.rule === "long-comment"),
      JSON.stringify(entries),
    )

    const j = run(["scan", ".", "--format", "json", "--fix-suggestions"], work)
    let rd = null
    try {
      rd = JSON.parse(j.stdout)
    } catch {
      rd = null
    }
    check(
      "fix-suggestions: --format json — stdout остаётся валидным JSON, строка подсказок уходит в stderr",
      rd !== null && Array.isArray(rd.diagnostics) && parseLine(j.stderr) !== null,
      `stdout: ${j.stdout.slice(0, 200)} | stderr: ${j.stderr.slice(-200)}`,
    )

    const payload = JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(work, "target.ts"), content } })
    const sp = run(["--stdin-path", "--fix-suggestions"], work, payload)
    const spEntries = parseLine(sp.stdout)
    check(
      "fix-suggestions: --stdin-path печатает строку подсказок после находок",
      spEntries !== null && spEntries.length === 2,
      `exit ${sp.status}: ${sp.stdout.slice(-300)}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
