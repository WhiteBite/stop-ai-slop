import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

function git(cwd, args) {
  return execFileSync(
    "git",
    ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", stdio: "pipe" },
  )
}

export default async function ({ check, selfPath }) {
  const gatePath = resolve(dirname(selfPath), "check-coship.mjs")
  const runGate = (args, cwd) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, [gatePath, ...args], { cwd, encoding: "utf8", stdio: "pipe" }) }
    } catch (error) {
      return { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
    }
  }
  const repo = mkdtempSync(join(tmpdir(), "slop-gate-coship-"))
  try {
    git(repo, ["init", "-q", "-b", "main"])
    mkdirSync(join(repo, "src"), { recursive: true })
    writeFileSync(join(repo, "src", "markers.mjs"), "const a = 1\n")
    writeFileSync(join(repo, "src", "detect.mjs"), "const c = 3\n")
    writeFileSync(join(repo, "src", "baseline.mjs"), "const b = 2\n")
    writeFileSync(join(repo, "other.ts"), "const d = 4\n")
    git(repo, ["add", "."])
    git(repo, ["commit", "-q", "-m", "init"])
    git(repo, ["checkout", "-q", "-b", "feature"])
    writeFileSync(join(repo, "src", "markers.mjs"), "const a = 11\n")
    writeFileSync(join(repo, "src", "baseline.mjs"), "const b = 22\n")
    git(repo, ["add", "."])
    const sab = runGate(["--staged"], repo)
    check(
      "coship: саботаж — staged трогает markers+baseline → блок [exit 1], обе группы в выводе",
      sab.status === 1 &&
        sab.out.includes("detector-semantics") &&
        sab.out.includes("baseline-semantics") &&
        sab.out.includes("src/markers.mjs") &&
        sab.out.includes("src/baseline.mjs"),
      `exit ${sab.status}: ${sab.out.slice(0, 300)}`,
    )
    const allowed = runGate(["--staged", "--allow-coship", "coordinated rework KRY-1"], repo)
    check(
      "coship: --allow-coship на саботаже [exit 0], причина напечатана",
      allowed.status === 0 && allowed.out.includes("coordinated rework KRY-1"),
      `exit ${allowed.status}: ${allowed.out.slice(0, 300)}`,
    )
    git(repo, ["commit", "-q", "-m", "coship"])
    const sabDiff = runGate(["--diff", "main"], repo)
    check(
      "coship: саботаж в --diff main → блок [exit 1]",
      sabDiff.status === 1 && sabDiff.out.includes("detector-semantics") && sabDiff.out.includes("baseline-semantics"),
      `exit ${sabDiff.status}: ${sabDiff.out.slice(0, 300)}`,
    )
    const allowedDiff = runGate(["--diff", "main", "--allow-coship", "reason two"], repo)
    check(
      "coship: --allow-coship в --diff режиме [exit 0], причина напечатана",
      allowedDiff.status === 0 && allowedDiff.out.includes("reason two"),
      `exit ${allowedDiff.status}: ${allowedDiff.out.slice(0, 300)}`,
    )
    git(repo, ["checkout", "-q", "main"])
    git(repo, ["checkout", "-q", "-b", "det-only"])
    writeFileSync(join(repo, "src", "markers.mjs"), "const a = 111\n")
    git(repo, ["add", "."])
    git(repo, ["commit", "-q", "-m", "det"])
    const det = runGate(["--diff", "main"], repo)
    check("coship: только detector-semantics проходит [exit 0]", det.status === 0, `exit ${det.status}: ${det.out.slice(0, 200)}`)
    git(repo, ["checkout", "-q", "main"])
    git(repo, ["checkout", "-q", "-b", "base-only"])
    writeFileSync(join(repo, "src", "baseline.mjs"), "const b = 222\n")
    git(repo, ["add", "."])
    git(repo, ["commit", "-q", "-m", "base"])
    const base = runGate(["--diff", "main"], repo)
    check("coship: только baseline-semantics проходит [exit 0]", base.status === 0, `exit ${base.status}: ${base.out.slice(0, 200)}`)
    git(repo, ["checkout", "-q", "main"])
    git(repo, ["checkout", "-q", "-b", "unrel"])
    writeFileSync(join(repo, "other.ts"), "const d = 44\n")
    git(repo, ["add", "."])
    git(repo, ["commit", "-q", "-m", "unrel"])
    const unrel = runGate(["--diff", "main"], repo)
    check("coship: посторонний changeset проходит [exit 0]", unrel.status === 0, `exit ${unrel.status}: ${unrel.out.slice(0, 200)}`)
    const stagedClean = runGate(["--staged"], repo)
    check("coship: чистый staged [exit 0]", stagedClean.status === 0, `exit ${stagedClean.status}: ${stagedClean.out.slice(0, 200)}`)
    const help = runGate(["--help"], repo)
    check(
      "coship: --help [exit 0] документирует режимы и escape hatch",
      help.status === 0 && help.out.includes("--staged") && help.out.includes("--diff") && help.out.includes("--allow-coship"),
      `exit ${help.status}: ${help.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
  const noRepo = mkdtempSync(join(tmpdir(), "slop-gate-coship-norepo-"))
  try {
    const outside = runGate(["--staged"], noRepo)
    check(
      "coship: вне git-репо — fail-open с пометкой [exit 0]",
      outside.status === 0 && outside.out.includes("не git-репозиторий"),
      `exit ${outside.status}: ${outside.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(noRepo, { recursive: true, force: true })
  }
}
