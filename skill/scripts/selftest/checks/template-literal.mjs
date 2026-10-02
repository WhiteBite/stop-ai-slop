import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CL = "// was here" + ", now gone"

export default async function ({ check, runCli }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-template-literal-"))
  try {
    writeFileSync(join(work, "content.ts"), "const s = `http://x " + CL + "`\n")
    const content = runCli(["scan", "content.ts"], work)
    check(
      "template-literal: // внутри backticks — контент строки, не комментарий [exit 0]",
      content.status === 0 && !content.out.includes("changelog-marker"),
      `exit ${content.status}: ${content.out.slice(0, 200)}`,
    )

    writeFileSync(join(work, "interp.ts"), 'const s = `a ${"b ' + CL + '"} d`\n')
    const interp = runCli(["scan", "interp.ts"], work)
    check(
      "template-literal: кавычки внутри ${ } интерполяции отслеживаются [exit 0]",
      interp.status === 0 && !interp.out.includes("changelog-marker"),
      `exit ${interp.status}: ${interp.out.slice(0, 200)}`,
    )

    writeFileSync(join(work, "trailing.ts"), "const s = `done` " + CL + "\n")
    const trailing = runCli(["scan", "trailing.ts"], work)
    check(
      "template-literal: trailing-комментарий после закрытого template флагается [exit 1]",
      trailing.status === 1 && trailing.out.includes("trailing.ts:1 changelog-marker"),
      `exit ${trailing.status}: ${trailing.out.slice(0, 200)}`,
    )

    writeFileSync(join(work, "block.ts"), 'const s = `a` + "b" /* was here, now gone */\n')
    const block = runCli(["scan", "block.ts"], work)
    check(
      "template-literal: trailing-блок после template флагается [exit 1]",
      block.status === 1 && block.out.includes("block.ts:1 changelog-marker"),
      `exit ${block.status}: ${block.out.slice(0, 200)}`,
    )

    writeFileSync(join(work, "nested.ts"), "const s = `a ${f(`nested ${y} z`)} b` " + CL + "\n")
    const nested = runCli(["scan", "nested.ts"], work)
    check(
      "template-literal: вложенный template в интерполяции не ломает trailing [exit 1]",
      nested.status === 1 && nested.out.includes("nested.ts:1 changelog-marker"),
      `exit ${nested.status}: ${nested.out.slice(0, 200)}`,
    )

    writeFileSync(join(work, "quote-fn.ts"), 'const x = "it\'s" ' + CL + "\n")
    const quoteFn = runCli(["scan", "quote-fn.ts"], work)
    check(
      "template-literal: апостроф в строке больше не прячет trailing-комментарий [exit 1]",
      quoteFn.status === 1 && quoteFn.out.includes("quote-fn.ts:1 changelog-marker"),
      `exit ${quoteFn.status}: ${quoteFn.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
