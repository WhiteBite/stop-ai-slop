import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export default async function ({ check, runCli }) {
  const dir = mkdtempSync(join(tmpdir(), "slop-gate-doctor-"))
  try {
    execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "init", "-q", "-b", "main"], { cwd: dir, stdio: "pipe" })
    writeFileSync(join(dir, "package.json"), '{"name":"t","version":"0.0.0"}\n')
    execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "pipe" })
    execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "init"], {
      cwd: dir,
      stdio: "pipe",
    })
    const installed = runCli(["--install"], dir)
    const healthy = runCli(["--doctor"], dir)
    check(
      "doctor: после --install окружение зелёное, hook-строка со ✓ [exit 0]",
      installed.status === 0 && healthy.status === 0 && healthy.out.includes("✓ pre-commit hook:"),
      `install exit ${installed.status}; doctor exit ${healthy.status}: ${healthy.out.slice(0, 300)}`,
    )
    const hookFile = join(dir, ".git", "hooks", "pre-commit")
    const hook = readFileSync(hookFile, "utf8")
    const brokenPath = join(dir, "no-such-scan.mjs").split("\\").join("/")
    writeFileSync(hookFile, hook.replace(/node\s+"([^"]+)"\s+--staged/, `node "${brokenPath}" --staged`))
    const broken = runCli(["--doctor"], dir)
    check(
      "doctor: битый путь сканера в hook → ✗ с путём [exit 1]",
      broken.status === 1 && broken.out.includes("✗") && broken.out.includes(brokenPath),
      `exit ${broken.status}: ${broken.out.slice(0, 300)}`,
    )
    writeFileSync(join(dir, ".stop-ai-slop.yaml"), "rules:\n  multi-line-comment: maybe\n")
    const cfg = runCli(["--doctor"], dir)
    check(
      "doctor: битый конфиг → ✗ с ошибкой конфига [exit 1]",
      cfg.status === 1 && cfg.out.includes(".stop-ai-slop.yaml") && cfg.out.includes("maybe"),
      `exit ${cfg.status}: ${cfg.out.slice(0, 300)}`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
