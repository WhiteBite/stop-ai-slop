import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve, sep } from "node:path"

export default async function ({ check, runCli, selfPath }) {
  const abs = selfPath.split(sep).join("/")
  const staged = `node "${abs}" --staged`
  const all = `node "${abs}" scan`
  const scriptsOk = (pkg) => pkg.scripts["stop-ai-slop"] === staged && pkg.scripts["stop-ai-slop:all"] === all

  const dWt = mkdtempSync(join(tmpdir(), "slop-gate-worktree-"))
  try {
    const mainDir = join(dWt, "main")
    mkdirSync(mainDir)
    const gitW = (args, cwd) =>
      execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", ...args], { cwd, encoding: "utf8", stdio: "pipe" })
    gitW(["init", "-q", "-b", "main"], mainDir)
    writeFileSync(join(mainDir, "package.json"), '{\n    "name": "consumer",\n    "scripts": {\n        "test": "echo test"\n    }\n}\n')
    gitW(["add", "package.json"], mainDir)
    gitW(["commit", "-q", "-m", "init"], mainDir)
    const wtDir = join(dWt, "wt")
    gitW(["worktree", "add", "-q", wtDir], mainDir)
    const res = runCli(["--install"], wtDir)
    const hooksDir = resolve(wtDir, gitW(["rev-parse", "--git-path", "hooks"], wtDir).trim())
    const doctor = runCli(["--doctor"], wtDir)
    check(
      "install-worktree: --install в git worktree — exit 0, hook в git rev-parse --git-path hooks, doctor его видит",
      res.status === 0 &&
        existsSync(join(hooksDir, "pre-commit")) &&
        scriptsOk(JSON.parse(readFileSync(join(wtDir, "package.json"), "utf8"))) &&
        doctor.status === 0 &&
        doctor.out.includes("pre-commit hook: "),
      `exit ${res.status}/${doctor.status}: hooksDir ${hooksDir}: ${res.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(dWt, { recursive: true, force: true })
  }

  const dFakeGit = mkdtempSync(join(tmpdir(), "slop-gate-fakegit-"))
  try {
    writeFileSync(join(dFakeGit, ".git"), "gitdir: nowhere")
    const res = runCli(["--install"], dFakeGit)
    check(
      "install-hook-write-failure: битый .git-файл — exit 2 с сообщением про pre-commit, не необработанный крэш",
      res.status === 2 && res.out.includes("pre-commit"),
      `exit ${res.status}: ${res.out.slice(0, 300)}`,
    )
  } finally {
    rmSync(dFakeGit, { recursive: true, force: true })
  }

  const dHy = mkdtempSync(join(tmpdir(), "slop-gate-hooks-hygiene-"))
  try {
    mkdirSync(join(dHy, ".codex"), { recursive: true })
    const foreign = { matcher: "Bash", hooks: [{ type: "command", command: "my-own-check.sh" }] }
    writeFileSync(join(dHy, ".codex", "hooks.json"), JSON.stringify({ hooks: { PreToolUse: [foreign] } }, null, 2) + "\n")
    const first = runCli(["--install-hooks"], dHy)
    const codexFile = join(dHy, ".codex", "hooks.json")
    const mtimeFirst = statSync(codexFile).mtimeMs
    const second = runCli(["--install-hooks"], dHy)
    const mtimeSecond = statSync(codexFile).mtimeMs
    const baks = []
    const walkBaks = (d) => {
      for (const entry of readdirSync(d)) {
        const full = join(d, entry)
        if (statSync(full).isDirectory()) walkBaks(full)
        else if (entry.endsWith(".bak")) baks.push(relative(dHy, full))
      }
    }
    walkBaks(dHy)
    check(
      "install-hooks-hygiene: повторный запуск не оставляет .bak, не пишет ownership-сайдкар, байт-идентичную запись пропускает",
      first.status === 0 &&
        second.status === 0 &&
        baks.length === 0 &&
        !existsSync(join(dHy, ".harness-kit")) &&
        mtimeSecond === mtimeFirst,
      `exit ${first.status}/${second.status}; .bak: ${baks.join(",") || "—"}; .harness-kit: ${existsSync(join(dHy, ".harness-kit"))}; mtime ${mtimeFirst} -> ${mtimeSecond}`,
    )
  } finally {
    rmSync(dHy, { recursive: true, force: true })
  }
}
