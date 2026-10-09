import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
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

export default async function ({ check, selfRoot }) {
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

    const shapeDir = make("slop-gate-plugin-shape-")
    const capWrite = evaluateEdit("Write", { filePath: join(shapeDir, "cap.ts"), content: SLOP })
    check(
      "plugin-shape: Write нормализуется в write и блокирует slop",
      capWrite.evaluated === true && capWrite.blocked === true && capWrite.tool === "write",
      JSON.stringify({ evaluated: capWrite.evaluated, blocked: capWrite.blocked, tool: capWrite.tool }),
    )
    const snakeEdit = evaluateEdit("str_replace", {
      file_path: join(shapeDir, "sr.ts"),
      old_string: "const x = 1\n",
      new_string: "// one\n// two\nconst x = 1\n",
    })
    check(
      "plugin-shape: str_replace с old/new — edit-форма, блокирует",
      snakeEdit.evaluated === true && snakeEdit.blocked === true && snakeEdit.tool === "edit",
      JSON.stringify({ evaluated: snakeEdit.evaluated, blocked: snakeEdit.blocked, tool: snakeEdit.tool }),
    )
    const patchText =
      "*** Begin Patch\n*** Add File: " +
      join(shapeDir, "patched.ts").replaceAll("\\", "/") +
      "\n+// p one\n+// p two\n+const z = 1\n*** End Patch\n"
    const applyShaped = evaluateEdit("apply", { command: patchText })
    check(
      "plugin-shape: apply с V4A-патчем — apply_patch-форма, блокирует",
      applyShaped.evaluated === true && applyShaped.blocked === true && applyShaped.tool === "apply_patch",
      JSON.stringify({ evaluated: applyShaped.evaluated, blocked: applyShaped.blocked, tool: applyShaped.tool }),
    )
    const patchNamed = evaluateEdit("patch", { input: patchText })
    check(
      "plugin-shape: patch с патч-текстом — apply_patch-форма, блокирует",
      patchNamed.evaluated === true && patchNamed.blocked === true && patchNamed.tool === "apply_patch",
      JSON.stringify({ evaluated: patchNamed.evaluated, blocked: patchNamed.blocked, tool: patchNamed.tool }),
    )
    const unevaluated = evaluateEdit("Write", { filePath: join(shapeDir, "notes.txt"), content: SLOP })
    check(
      "plugin-shape: Write в не-кодовый путь — evaluated:false, filePath сохранён",
      unevaluated.evaluated === false && unevaluated.filePath === join(shapeDir, "notes.txt"),
      JSON.stringify({ evaluated: unevaluated.evaluated, filePath: unevaluated.filePath }),
    )

    const nodeMajor = Number(process.versions.node.split(".")[0])
    const nodeMinor = Number(process.versions.node.split(".")[1])
    if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 6)) {
      check("plugin-module: skip — node < 22.6", true, "skip: node < 22.6")
    } else {
      const pluginUrl = pathToFileURL(join(selfRoot, "plugin", "comment-gate.ts")).href
      const auditPath = join(shapeDir, "audit.jsonl")
      const fixture = join(shapeDir, "plugin-module-check.mjs")
      writeFileSync(
        fixture,
        `import { writeFileSync } from "node:fs"
const done = (payload) => {
  writeFileSync(1, JSON.stringify(payload) + "\\n")
  process.exit(0)
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
let mod
try {
  mod = await import(${JSON.stringify(pluginUrl)})
} catch (error) {
  done({ ok: false, error: "import: " + String(error && error.message ? error.message : error) })
}
try {
  let captured = null
  await mod.default.setup({
    tool: {
      hook: async (name, cb) => {
        captured = { name, cb }
        return { dispose: async () => {} }
      },
    },
  })
  assert(captured !== null && captured.name === "execute.before", "setup did not register execute.before")
  const slopTs = ${JSON.stringify(join(shapeDir, "mod-slop.ts"))}
  const txtPath = ${JSON.stringify(join(shapeDir, "mod-notes.txt"))}
  const slop = ${JSON.stringify(SLOP)}
  let threwWrite = false
  try {
    await captured.cb({ tool: "Write", input: { filePath: slopTs, content: slop } })
  } catch {
    threwWrite = true
  }
  assert(threwWrite === true, "capitalized Write with slop did not throw")
  let threwTxt = false
  try {
    await captured.cb({ tool: "Write", input: { filePath: txtPath, content: slop } })
  } catch {
    threwTxt = true
  }
  assert(threwTxt === false, "Write to a non-code path threw")
  await captured.cb({ tool: "read", input: { filePath: slopTs } })
  done({ ok: true })
} catch (error) {
  done({ ok: false, error: String(error && error.message ? error.message : error) })
}
`,
      )
      const run = spawnSync(process.execPath, ["--experimental-strip-types", fixture], {
        encoding: "utf8",
        env: { ...process.env, STOP_AI_SLOP_LOG: auditPath },
      })
      let moduleResult = null
      try {
        moduleResult = JSON.parse((run.stdout ?? "").trim().split(/\r?\n/).pop() ?? "")
      } catch {
        moduleResult = null
      }
      const auditEntries = existsSync(auditPath)
        ? readFileSync(auditPath, "utf8")
            .split(/\r?\n/)
            .filter((l) => l.trim() !== "")
            .map((l) => {
              try {
                return JSON.parse(l)
              } catch {
                return null
              }
            })
            .filter((e) => e !== null)
        : []
      const blockedEntry = auditEntries.find((e) => e.verdict === "blocked" && e.tool === "Write")
      const unevalEntry = auditEntries.find((e) => e.verdict === "unevaluated" && e.tool === "Write")
      const readAudited = auditEntries.some((e) => e.tool === "read")
      check(
        "plugin-module: guard блокирует Write, аудирует unevaluated, read молчит",
        run.status === 0 &&
          moduleResult !== null &&
          moduleResult.ok === true &&
          blockedEntry !== undefined &&
          unevalEntry !== undefined &&
          unevalEntry.filePath === join(shapeDir, "mod-notes.txt") &&
          !readAudited,
        moduleResult && moduleResult.error ? moduleResult.error : `exit ${run.status}: ${(run.stderr ?? "").slice(0, 300)}`,
      )
    }
  } finally {
    try {
      process.chdir(startCwd)
    } catch {}
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  }
}