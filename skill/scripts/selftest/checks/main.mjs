import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

const SENTINEL = "library-import-ok"

export default async function ({ check, runCli, selfPath, dir }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-main-"))
  const siblingLink = join(dirname(selfPath), ".selftest-main-link.mjs")
  try {
    const direct = runCli(["--help"], dir)
    check("main-direct: прямой запуск бина [exit 0, help]", direct.status === 0 && direct.out.includes("stop-ai-slop"), `exit ${direct.status}: stdout ${direct.out.length} bytes`)
    const importer = join(work, "importer.mjs")
    writeFileSync(importer, `import ${JSON.stringify(pathToFileURL(selfPath).href)}\nconsole.log("${SENTINEL}")\n`)
    const lib = spawnSync(process.execPath, [importer], { encoding: "utf8", cwd: dir })
    check(
      "main-library: import фасада не запускает main()",
      lib.status === 0 && lib.stdout.trim() === SENTINEL,
      `exit ${lib.status}: ${JSON.stringify(lib.stdout.slice(0, 160))}`,
    )
    const namesake = join(work, "scan.mjs")
    writeFileSync(namesake, `import ${JSON.stringify(pathToFileURL(selfPath).href)}\nconsole.log("${SENTINEL}")\n`)
    const ns = spawnSync(process.execPath, [namesake], { encoding: "utf8", cwd: dir })
    check(
      "main-namesake: entry потребителя с именем scan.mjs, импортирующий фасад, не запускает main()",
      ns.status === 0 && ns.stdout.trim() === SENTINEL,
      `exit ${ns.status}: ${JSON.stringify(ns.stdout.slice(0, 160))}`,
    )
    const link = join(work, "stop-ai-slop")
    let symlinkOk = false
    try {
      symlinkSync(selfPath, link)
      symlinkSync(selfPath, siblingLink)
      symlinkOk = true
    } catch {
      check("main-symlink: skip — symlink creation not permitted", true, "skip: symlink creation not permitted (Windows needs developer mode or admin)")
      check("main-preserve: skip — symlink creation not permitted", true, "skip: symlink creation not permitted")
      check("main-preserve-main: skip — symlink creation not permitted", true, "skip: symlink creation not permitted")
    }
    if (symlinkOk) {
      try {
        const env = { ...process.env, STOP_AI_SLOP_LANG: "ru" }
        const viaLink = spawnSync(process.execPath, [link, "--help"], { encoding: "utf8", cwd: dir, env })
        check(
          "main-symlink: запуск через symlink выполняет CLI [exit 0, help]",
          viaLink.status === 0 && viaLink.stdout.includes("stop-ai-slop"),
          `exit ${viaLink.status}: stdout ${viaLink.stdout.length} bytes`,
        )
        const preserved = spawnSync(process.execPath, ["--preserve-symlinks", link, "--help"], { encoding: "utf8", cwd: dir, env })
        check(
          "main-preserve: --preserve-symlinks через symlink выполняет CLI [exit 0, help]",
          preserved.status === 0 && preserved.stdout.includes("stop-ai-slop"),
          `exit ${preserved.status}: stdout ${preserved.stdout.length} bytes`,
        )
        const preservedMain = spawnSync(process.execPath, ["--preserve-symlinks-main", siblingLink, "--help"], { encoding: "utf8", cwd: dir, env })
        check(
          "main-preserve-main: --preserve-symlinks-main через symlink в одном каталоге с бинарём [exit 0, help]",
          preservedMain.status === 0 && preservedMain.stdout.includes("stop-ai-slop"),
          `exit ${preservedMain.status}: stdout ${preservedMain.stdout.length} bytes`,
        )
      } finally {
        rmSync(siblingLink, { force: true })
      }
    }
  } finally {
    rmSync(siblingLink, { force: true })
    rmSync(work, { recursive: true, force: true })
  }
}

