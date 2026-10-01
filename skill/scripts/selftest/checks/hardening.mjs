import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const SLOP = "// aaa\n// bbb\nconst x = 1\n"

export default async function ({ check, runCli, selfPath, dir }) {
  const bare = runCli(["--explain", "step-numbered"], dir)
  check(
    "explain-alias: bare id resolves to the vend/ prefixed rule [exit 0]",
    bare.status === 0 && bare.out.includes("vend/step-numbered [warning]"),
    `exit ${bare.status}: ${bare.out.slice(0, 200)}`,
  )
  const canonical = runCli(["--explain", "vend/step-numbered"], dir)
  check(
    "explain-alias: canonical id unchanged [exit 0]",
    canonical.status === 0 && canonical.out.includes("vend/step-numbered [warning]"),
    `exit ${canonical.status}: ${canonical.out.slice(0, 200)}`,
  )
  const bogus = runCli(["--explain", "bogus-rule"], dir)
  check("explain-alias: unresolvable id still exits 2", bogus.status === 2 && bogus.out.includes("bogus-rule"), `exit ${bogus.status}`)
  const prefixedBogus = runCli(["--explain", "vend/bogus"], dir)
  check("explain-alias: no fuzzy matching beyond the vend/ retry", prefixedBogus.status === 2, `exit ${prefixedBogus.status}`)

  for (const body of ["null", '"hello"', "42", "[]", "true"]) {
    const pkgDir = mkdtempSync(join(tmpdir(), "slop-gate-pkgshape-"))
    try {
      writeFileSync(join(pkgDir, "package.json"), body + "\n")
      const res = runCli(["--install"], pkgDir)
      const after = readFileSync(join(pkgDir, "package.json"), "utf8")
      check(
        `install-shape: valid JSON that is not an object (${body}) exits 2 and leaves the file untouched`,
        res.status === 2 && after === body + "\n",
        `exit ${res.status}: ${after.slice(0, 80)}`,
      )
    } finally {
      rmSync(pkgDir, { recursive: true, force: true })
    }
  }

  const mod = await import(pathToFileURL(selfPath).href)
  const cfgDir = mkdtempSync(join(tmpdir(), "slop-gate-cfgcache-"))
  try {
    const target = join(cfgDir, "x.ts")
    writeFileSync(join(cfgDir, ".stop-ai-slop.yaml"), "rules:\n  multi-line-comment: maybe\n")
    let threw = false
    try {
      mod.evaluateEdit("write", { filePath: target, content: SLOP })
    } catch {
      threw = true
    }
    check("config-cache: malformed config fails closed on the write-time gate", threw, "expected evaluateEdit to throw")
    writeFileSync(join(cfgDir, ".stop-ai-slop.yaml"), "rules:\n  multi-line-comment: off\n")
    const recovered = mod.evaluateEdit("write", { filePath: target, content: SLOP })
    check(
      "config-cache: a fixed config is picked up without restarting the host process",
      recovered.evaluated === true && recovered.blocked === false,
      JSON.stringify({ evaluated: recovered.evaluated, blocked: recovered.blocked }),
    )
  } finally {
    rmSync(cfgDir, { recursive: true, force: true })
  }
}
