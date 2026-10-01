import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CRASH =
  /ReferenceError|is not defined|TypeError|Cannot read properties|Cannot read property|RangeError|SyntaxError|UnhandledPromiseRejection|Cannot find module|ERR_MODULE_NOT_FOUND|at cmd|at async/i

const git = (cwd, args) =>
  execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    stdio: "pipe",
  })

const run = (selfPath, args, cwd, input) => {
  const env = { ...process.env, STOP_AI_SLOP_LANG: "ru" }
  try {
    return { status: 0, out: execFileSync(process.execPath, [selfPath, ...args], { cwd, encoding: "utf8", stdio: "pipe", env, input }) }
  } catch (error) {
    return { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

const payload = (file) => JSON.stringify({ tool_name: "Write", tool_input: { file_path: file, content: "const x = 1\n" } })

const MODES = [
  { name: "scan", args: ["scan", "."], input: null },
  { name: "scan-strict", args: ["scan", ".", "--strict"], input: null },
  { name: "scan-format-json", args: ["scan", ".", "--format", "json"], input: null },
  { name: "scan-format-sarif", args: ["scan", ".", "--format", "sarif"], input: null },
  { name: "scan-lang-en", args: ["--lang", "en", "scan", "."], input: null },
  { name: "staged", args: ["--staged"], input: null, expect: 0 },
  { name: "diff", args: ["--diff", "HEAD"], input: null, expect: 0 },
  { name: "fix-dry-run", args: ["--fix", "--dry-run"], input: null, expect: 0 },
  { name: "baseline-write", args: ["--baseline-write"], input: null, expect: 0 },
  { name: "baseline-prune", args: ["--baseline-prune"], input: null, expect: 0 },
  { name: "explain", args: ["--explain", "changelog-marker"], input: null, expect: 0 },
  { name: "explain-bare-id", args: ["--explain", "step-numbered"], input: null, expect: 0 },
  { name: "help", args: ["--help"], input: null, expect: 0 },
  { name: "audit", args: ["--audit"], input: null, expect: 0 },
  { name: "install", args: ["--install"], input: null, expect: 0 },
  { name: "install-hooks", args: ["--install-hooks"], input: null, expect: 0 },
  { name: "install-rules", args: ["--install-rules"], input: null, expect: 0 },
  { name: "stdin-path", args: ["--stdin-path"], input: (cwd) => payload(join(cwd, "a.ts")) },
  { name: "pre-tool", args: ["--pre-tool"], input: (cwd) => payload(join(cwd, "a.ts")), expect: 0 },
  {
    name: "mcp",
    args: ["--mcp"],
    input: () => JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2026-07-28" } }) + "\n",
  },
  { name: "unknown-flag", args: ["--definitely-not-a-flag"], input: null, expect: 2 },
  { name: "missing-path", args: ["scan", "no-such-dir-xyz"], input: null, expect: 2 },
]

const V1_BASELINE = "# slop-gate baseline: relpath:line\na.ts:1\n"

export default async function ({ check, selfPath }) {
  for (const variant of ["clean", "v1-baseline"]) {
    const dir = mkdtempSync(join(tmpdir(), `slop-gate-smoke-${variant}-`))
    try {
      git(dir, ["init", "-q", "-b", "main"])
      writeFileSync(join(dir, "a.ts"), "// this fixes the cache miss\nconst x = 1\n")
      writeFileSync(join(dir, ".gitignore"), "node_modules/\n")
      if (variant === "v1-baseline") writeFileSync(join(dir, "stop-ai-slop.baseline.txt"), V1_BASELINE)
      git(dir, ["add", "-A"])
      git(dir, ["commit", "-q", "-m", "init"])
      for (const mode of MODES) {
        const res = run(selfPath, mode.args, dir, mode.input === null ? undefined : mode.input(dir))
        const crashed = CRASH.test(res.out)
        const badStatus = mode.expect === undefined ? res.status > 2 : res.status !== mode.expect
        check(
          `cli-smoke[${variant}]: ${mode.name} не падает`,
          !crashed && !badStatus,
          `exit ${res.status}: ${res.out.slice(0, 300)}`,
        )
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const v1Dir = mkdtempSync(join(tmpdir(), "slop-gate-v1prune-"))
  try {
    writeFileSync(join(v1Dir, "a.ts"), "// this fixes the cache miss\n// second line of it\nconst x = 1\n")
    writeFileSync(join(v1Dir, "stop-ai-slop.baseline.txt"), V1_BASELINE)
    const pruned = run(selfPath, ["--baseline-prune"], v1Dir)
    const body = readFileSync(join(v1Dir, "stop-ai-slop.baseline.txt"), "utf8")
    check(
      "baseline-v1-prune: легаси-baseline прорежается и перезаписывается [exit 0]",
      pruned.status === 0 && !CRASH.test(pruned.out) && body.includes("a.ts:1") && body.startsWith("# slop-gate baseline"),
      `exit ${pruned.status}: ${pruned.out.slice(0, 200)} | ${body.slice(0, 120)}`,
    )
    const scanned = run(selfPath, ["scan", "."], v1Dir)
    check("baseline-v1-prune: после прореживания легаси остаётся замаскированным [exit 0]", scanned.status === 0, `exit ${scanned.status}: ${scanned.out.slice(0, 200)}`)
    mkdirSync(join(v1Dir, "sub"), { recursive: true })
    writeFileSync(join(v1Dir, "sub", "b.ts"), "// стало иначе\n// было по-другому\nconst x = 1\n")
    const resurfaced = run(selfPath, ["scan", "."], v1Dir)
    check("baseline-v1-prune: новый слоп поверх легаси блокирует [exit 1]", resurfaced.status === 1, `exit ${resurfaced.status}: ${resurfaced.out.slice(0, 200)}`)
  } finally {
    rmSync(v1Dir, { recursive: true, force: true })
  }
}
