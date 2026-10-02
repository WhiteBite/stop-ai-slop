import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { escapeAnnotationMessage } from "../../src/report.mjs"

export default async function ({ check, runCli }) {
  check(
    "annotations-escape: % и : экранируются в порядке GitHub Actions",
    escapeAnnotationMessage("100% rate: ok") === "100%25 rate%3A ok",
    escapeAnnotationMessage("100% rate: ok"),
  )

  const dir = mkdtempSync(join(tmpdir(), "slop-gate-anno-"))
  try {
    writeFileSync(join(dir, "anno.ts"), "// FIXME drop the cache\nconst x = 1\n")
    const warn = runCli(["scan", ".", "--annotations"], dir)
    const warnLines = warn.out.split("\n")
    check(
      "annotations-warning: ::warning-строка + обычная строка находки [exit 0]",
      warn.status === 0 &&
        warnLines.some((l) => l.startsWith("::warning file=anno.ts,line=1::") && l.includes("vend/generic-todo")) &&
        warnLines.some((l) => l.startsWith("anno.ts:1 vend/generic-todo [warning]")),
      `exit ${warn.status}: ${warn.out.slice(0, 300)}`,
    )

    writeFileSync(join(dir, "anno.ts"), "// see handler.py:147 for the layout\nconst x = 1\n")
    const colon = runCli(["scan", ".", "--annotations"], dir)
    check(
      "annotations-colon: «:» в сообщении экранируется как %3A",
      colon.out.includes("::warning file=anno.ts,line=1::") && colon.out.includes("handler.py%3A147"),
      `exit ${colon.status}: ${colon.out.slice(0, 300)}`,
    )

    writeFileSync(join(dir, "err.ts"), "// первая строка блока\n// вторая строка блока\nconst x = 1\n")
    const err = runCli(["scan", ".", "--annotations"], dir)
    check(
      "annotations-error: error-находка → ::error [exit 1]",
      err.status === 1 && err.out.includes("::error file=err.ts,line=1::"),
      `exit ${err.status}: ${err.out.slice(0, 300)}`,
    )

    const json = runCli(["scan", ".", "--annotations", "--format", "json"], dir)
    check(
      "annotations-json: с --format json флаг — no-op, workflow-команд нет [exit 1]",
      json.status === 1 && !json.out.includes("::error") && !json.out.includes("::warning"),
      `exit ${json.status}: ${json.out.slice(0, 300)}`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
