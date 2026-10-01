import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { evaluateEdit } from "../../scan.mjs"

const ZW = String.fromCodePoint(0x200b)
const SLOP = "// line one\n// line two\nconst x = 1\n"

function gitInit(dir) {
  execFileSync(
    "git",
    ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", "init", "-q", "-b", "main"],
    { cwd: dir, stdio: "pipe" },
  )
}

export default async function ({ check }) {
  const dirs = []
  const make = (prefix) => {
    const d = mkdtempSync(join(tmpdir(), prefix))
    dirs.push(d)
    return d
  }
  const startCwd = process.cwd()
  try {
    const repoA = make("slop-gate-plugin-a-")
    const repoB = make("slop-gate-plugin-b-")
    gitInit(repoA)
    gitInit(repoB)
    writeFileSync(join(repoA, ".stop-ai-slop.yaml"), "rules:\n  multi-line-comment: off\n")
    process.chdir(repoB)
    const fromA = evaluateEdit("write", { filePath: join(repoA, "x.ts"), content: SLOP })
    const fromB = evaluateEdit("write", { filePath: join(repoB, "y.ts"), content: SLOP })
    process.chdir(startCwd)
    check(
      "plugin-cfg: root из файла, не cwd — конфиг repo A гасит, repo B без конфига блокирует",
      fromA.blocked === false && fromB.blocked === true,
      `cwd=${repoB} A.blocked=${fromA.blocked} B.blocked=${fromB.blocked}`,
    )

    const repoLen = make("slop-gate-plugin-len-")
    gitInit(repoLen)
    writeFileSync(join(repoLen, ".stop-ai-slop.yaml"), "maxCommentLength: 40\n")
    const long = evaluateEdit("write", { filePath: join(repoLen, "s.ts"), content: "// " + "y".repeat(55) + "\nconst x = 1\n" })
    check(
      "plugin-cfg: maxCommentLength из конфига repo A применяется",
      long.blocked === true && long.violations.some((v) => v.rule === "long-comment"),
      JSON.stringify(long.violations),
    )

    const repoRules = make("slop-gate-plugin-rules-")
    gitInit(repoRules)
    writeFileSync(join(repoRules, ".stop-ai-slop.yaml"), "rules:\n  multi-line-comment: off\n  vend/step-numbered: error\n")
    const off = evaluateEdit("write", { filePath: join(repoRules, "off.ts"), content: SLOP })
    const promoted = evaluateEdit("write", { filePath: join(repoRules, "step.ts"), content: "// Step 3: normalize\nconst x = 1\n" })
    check("plugin-cfg: правило off в конфиге не блокирует", off.blocked === false, JSON.stringify(off.violations))
    check(
      "plugin-cfg: warning→error из конфига блокирует (error-фильтр после remap)",
      promoted.blocked === true && promoted.violations.some((v) => v.rule === "vend/step-numbered" && v.severity === "error"),
      JSON.stringify(promoted.violations),
    )

    const repoNone = make("slop-gate-plugin-none-")
    gitInit(repoNone)
    const noCfgSlop = evaluateEdit("write", { filePath: join(repoNone, "z.ts"), content: SLOP })
    const noCfgClean = evaluateEdit("write", { filePath: join(repoNone, "z.ts"), content: "const x = 1\n" })
    const noCfgRead = evaluateEdit("read", { filePath: join(repoNone, "z.ts") })
    check(
      "plugin-cfg: без конфига дефолты — slop блокирует, clean проходит, не-mutating evaluated:false",
      noCfgSlop.blocked === true && noCfgClean.blocked === false && noCfgRead.evaluated === false,
      `slop=${noCfgSlop.blocked} clean=${noCfgClean.blocked} read=${noCfgRead.evaluated}`,
    )

    const plain = make("slop-gate-plugin-plain-")
    const plainSlop = evaluateEdit("write", { filePath: join(plain, "p.ts"), content: SLOP })
    check("plugin-cfg: файл вне git-репо — fallback, дефолты, без краха", plainSlop.blocked === true, `blocked=${plainSlop.blocked}`)

    const repoCache = make("slop-gate-plugin-cache-")
    gitInit(repoCache)
    const first = evaluateEdit("write", { filePath: join(repoCache, "c.ts"), content: SLOP })
    writeFileSync(join(repoCache, ".stop-ai-slop.yaml"), "rules:\n  multi-line-comment: off\n")
    const second = evaluateEdit("write", { filePath: join(repoCache, "c.ts"), content: SLOP })
    check(
      "plugin-cfg: конфиг кэширован по root — созданный после первого вызова не подхвачен",
      first.blocked === true && second.blocked === true,
      `first=${first.blocked} second=${second.blocked}`,
    )

    const repoGen = make("slop-gate-plugin-gen-")
    gitInit(repoGen)
    const genSec = evaluateEdit("write", { filePath: join(repoGen, "models.g.dart"), content: "final a = '" + ZW + "'\n" })
    const genSlop = evaluateEdit("write", { filePath: join(repoGen, "models.g.dart"), content: "// one\n// two\nfinal x = 1\n" })
    check(
      "plugin-cfg: generated — security-правило живо, slop эксемптится",
      genSec.blocked === true && genSec.violations.some((v) => v.rule === "vend/zero-width-chars") && genSlop.blocked === false,
      `sec=${genSec.blocked} slop=${genSlop.blocked} rules=${genSec.violations.map((v) => v.rule).join(",")}`,
    )
  } finally {
    try {
      process.chdir(startCwd)
    } catch {}
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  }
}