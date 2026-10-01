import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { evaluateEdit } from "../../scan.mjs"

const LANG = { ...process.env, STOP_AI_SLOP_LANG: "ru" }
const ZW = String.fromCodePoint(0x200b)

function runWithInput(selfPath, cwd, args, payload) {
  try {
    const out = execFileSync(process.execPath, [selfPath, ...args], {
      input: JSON.stringify(payload),
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      env: LANG,
    })
    return { status: 0, out }
  } catch (error) {
    return { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

const preTool = (selfPath, cwd, payload) => runWithInput(selfPath, cwd, ["--pre-tool"], payload)
const stdinPath = (selfPath, cwd, payload) => runWithInput(selfPath, cwd, ["--stdin-path"], payload)

function git(cwd, args) {
  return execFileSync(
    "git",
    ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", stdio: "pipe" },
  )
}

export default async function ({ check, runCli, selfPath }) {
  const cfgRoot = mkdtempSync(join(tmpdir(), "slop-gate-cfgsurf-"))
  const repoRoot = mkdtempSync(join(tmpdir(), "slop-gate-cfgsurf-repo-"))
  try {
    writeFileSync(join(cfgRoot, ".stop-ai-slop.yaml"), "rules:\n  multi-line-comment: off\n")
    const s1 = preTool(selfPath, cfgRoot, {
      tool_name: "Write",
      tool_input: { file_path: join(cfgRoot, "s1.ts"), content: "// line one\n// line two\nconst x = 1\n" },
    })
    check("cfg-surface S1: --pre-tool чтит rules off [exit 0]", s1.status === 0, `exit ${s1.status}: ${s1.out.slice(0, 200)}`)

    writeFileSync(join(cfgRoot, ".stop-ai-slop.yaml"), "maxCommentLength: 40\n")
    const s2 = preTool(selfPath, cfgRoot, {
      tool_name: "Edit",
      tool_input: {
        file_path: join(cfgRoot, "s2.ts"),
        old_string: "const x = 1\n",
        new_string: "// " + "y".repeat(55) + "\nconst x = 1\n",
      },
    })
    check(
      "cfg-surface S2: --pre-tool чтит maxCommentLength [exit 2]",
      s2.status === 2 && s2.out.includes("long-comment"),
      `exit ${s2.status}: ${s2.out.slice(0, 200)}`,
    )

    writeFileSync(join(cfgRoot, ".stop-ai-slop.yaml"), "rules:\n  vend/step-numbered: error\n")
    const s3 = preTool(selfPath, cfgRoot, {
      tool_name: "Write",
      tool_input: { file_path: join(cfgRoot, "s3.ts"), content: "// Step 3: x\nconst x = 1\n" },
    })
    check(
      "cfg-surface S3: --pre-tool повышает warning до error [exit 2]",
      s3.status === 2 && s3.out.includes("vend/step-numbered"),
      `exit ${s3.status}: ${s3.out.slice(0, 200)}`,
    )

    rmSync(join(cfgRoot, ".stop-ai-slop.yaml"), { force: true })
    const s5sec = preTool(selfPath, cfgRoot, {
      tool_name: "Write",
      tool_input: { file_path: join(cfgRoot, "models.g.dart"), content: "final a = '" + ZW + "'\n" },
    })
    check(
      "cfg-surface S5: security-правило живо на generated [exit 2]",
      s5sec.status === 2 && s5sec.out.includes("vend/zero-width-chars"),
      `exit ${s5sec.status}: ${s5sec.out.slice(0, 200)}`,
    )
    const s5slop = preTool(selfPath, cfgRoot, {
      tool_name: "Write",
      tool_input: { file_path: join(cfgRoot, "models.g.dart"), content: "// one\n// two\nfinal a = 1\n" },
    })
    check("cfg-surface S5: slop на generated эксемптится [exit 0]", s5slop.status === 0, `exit ${s5slop.status}: ${s5slop.out.slice(0, 200)}`)

    const s4a = preTool(selfPath, cfgRoot, {
      tool_name: "Write",
      tool_input: { file_path: join(cfgRoot, "s4.ts"), content: "// one\n// two\nconst x = 1\n" },
    })
    const s4b = preTool(selfPath, cfgRoot, {
      tool_name: "Write",
      tool_input: { file_path: join(cfgRoot, "s4.ts"), content: "const x = 1\n" },
    })
    const s4c = preTool(selfPath, cfgRoot, { tool_name: "Read", tool_input: { file_path: join(cfgRoot, "s4.ts") } })
    check(
      "cfg-surface S4: без конфига --pre-tool как раньше",
      s4a.status === 2 && s4b.status === 0 && s4c.status === 0,
      `write ${s4a.status}, clean ${s4b.status}, read ${s4c.status}`,
    )

    writeFileSync(join(cfgRoot, ".stop-ai-slop.yaml"), "maxCommentLength: 40\n")
    const s6file = join(cfgRoot, "s6.ts")
    writeFileSync(s6file, "// " + "z".repeat(55) + "\nconst x = 1\n")
    const s6 = stdinPath(selfPath, cfgRoot, { tool_input: { file_path: s6file } })
    check(
      "cfg-surface S6: --stdin-path чтит maxCommentLength [exit 1]",
      s6.status === 1 && s6.out.includes("long-comment"),
      `exit ${s6.status}: ${s6.out.slice(0, 200)}`,
    )

    writeFileSync(join(cfgRoot, "scan-slop.ts"), "// one\n// two\nconst x = 1\n")
    const scanSlop = runCli(["scan", "."], cfgRoot)
    check(
      "cfg-surface S4: scan видит slop без конфига [exit 1]",
      scanSlop.status === 1 && scanSlop.out.includes("multi-line-comment"),
      `exit ${scanSlop.status}: ${scanSlop.out.slice(0, 200)}`,
    )

    git(repoRoot, ["init", "-q", "-b", "main"])
    writeFileSync(join(repoRoot, "clean.ts"), "const x = 1\n")
    git(repoRoot, ["add", "clean.ts"])
    git(repoRoot, ["commit", "-q", "-m", "init"])
    const diffClean = runCli(["--diff", "HEAD"], repoRoot)
    check("cfg-surface S4: --diff HEAD на чистом дереве [exit 0]", diffClean.status === 0, `exit ${diffClean.status}: ${diffClean.out.slice(0, 200)}`)
    writeFileSync(join(repoRoot, "slop.ts"), "// one\n// two\nconst x = 1\n")
    git(repoRoot, ["add", "slop.ts"])
    const stagedSlop = runCli(["--staged"], repoRoot)
    const diffSlop = runCli(["--diff", "HEAD"], repoRoot)
    check(
      "cfg-surface S4: --staged и --diff ловят slop [exit 1]",
      stagedSlop.status === 1 && diffSlop.status === 1,
      `staged ${stagedSlop.status}, diff ${diffSlop.status}`,
    )

    const ee = evaluateEdit("write", { filePath: join(cfgRoot, "ee.ts"), content: "// one\n// two\nconst x = 1\n" })
    const eeGen = evaluateEdit("write", { filePath: join(cfgRoot, "models.g.dart"), content: "final a = '" + ZW + "'\n" })
    const eeClean = evaluateEdit("write", { filePath: join(cfgRoot, "ee.ts"), content: "const x = 1\n" })
    check(
      "cfg-surface evaluateEdit: без opts root из файла — generated security-правило живо",
      ee.blocked === true &&
        ee.violations.some((v) => v.rule === "multi-line-comment") &&
        eeGen.blocked === true &&
        eeGen.violations.some((v) => v.rule === "vend/zero-width-chars") &&
        eeClean.blocked === false,
      JSON.stringify({ blocked: ee.blocked, genBlocked: eeGen.blocked, cleanBlocked: eeClean.blocked }),
    )
  } finally {
    rmSync(cfgRoot, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  }
}
