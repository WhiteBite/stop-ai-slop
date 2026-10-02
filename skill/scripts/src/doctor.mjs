import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { T } from "./i18n.mjs"
import { loadConfig } from "./config.mjs"
import { loadBaseline } from "./baseline.mjs"
import { hooksDirFor, SLOP_GATE_ID } from "./install.mjs"

const HOOK_BLOCK_RE = new RegExp(`# >>> ${SLOP_GATE_ID} >>>[\\s\\S]*?# <<< ${SLOP_GATE_ID} <<<\\r?\\n?`)
const HOOK_INVOCATION_RE = /node\s+"([^"]+)"\s+--staged/

export function cmdDoctor() {
  let failed = false
  const ok = (text) => console.log(`✓ ${text}`)
  const bad = (text) => {
    failed = true
    console.log(`✗ ${text}`)
  }
  const info = (text) => console.log(`! ${text}`)

  const nodeMajor = Number(process.versions.node.split(".")[0])
  if (nodeMajor >= 18) ok(T("doctorNodeOk", process.versions.node))
  else bad(T("doctorNodeOld", process.versions.node))

  let gitVersion = null
  try {
    gitVersion = execFileSync("git", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .trim()
      .replace(/^git version /, "")
  } catch {}
  if (gitVersion === null) bad(T("doctorGitMissing"))
  else ok(T("doctorGitOk", gitVersion))

  let toplevel = null
  try {
    toplevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  } catch {}
  if (toplevel === null) info(T("doctorRepoNone"))
  else ok(T("doctorRepoOk", toplevel))
  const root = toplevel ?? process.cwd()

  if (toplevel !== null) {
    const hooksDir = hooksDirFor(root)
    const hookPath = hooksDir === null ? null : join(hooksDir, "pre-commit")
    const hookText = hookPath !== null && existsSync(hookPath) ? readFileSync(hookPath, "utf8") : null
    if (hookText === null || !HOOK_BLOCK_RE.test(hookText)) {
      info(T("doctorHookAbsent"))
    } else {
      const m = HOOK_INVOCATION_RE.exec(hookText)
      if (m === null) bad(T("doctorHookUnparsed", hookPath))
      else if (existsSync(m[1])) ok(T("doctorHookOk", m[1]))
      else bad(T("doctorHookBroken", m[1]))
    }
  }

  const pkgPath = join(root, "package.json")
  if (existsSync(pkgPath)) {
    let scripts = null
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
      if (typeof pkg === "object" && pkg !== null && !Array.isArray(pkg) && typeof pkg.scripts === "object" && pkg.scripts !== null) {
        scripts = pkg.scripts
      }
    } catch {}
    if (scripts !== null && typeof scripts["stop-ai-slop"] === "string" && typeof scripts["stop-ai-slop:all"] === "string") ok(T("doctorPkgOk"))
    else bad(T("doctorPkgMissing"))
  }

  if (existsSync(join(root, ".stop-ai-slop.yaml"))) {
    try {
      loadConfig(root)
      ok(T("doctorConfigOk"))
    } catch (error) {
      bad(T("doctorConfigBad", error instanceof Error ? error.message : String(error)))
    }
  }

  if (existsSync(join(root, "stop-ai-slop.baseline.txt"))) {
    const baseline = loadBaseline(root)
    info(T("doctorBaseline", baseline.fp.size > 0 ? baseline.fp.size : baseline.legacy.size))
  }

  const pluginsDir = join(homedir(), ".config", "opencode", "plugins")
  if (existsSync(pluginsDir)) {
    const stub = readdirSync(pluginsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .find((e) => readFileSync(join(pluginsDir, e.name), "utf8").includes("comment-gate.ts"))
    if (stub === undefined) info(T("doctorPluginNone"))
    else info(T("doctorPluginFound", stub.name))
  }

  return failed ? 1 : 0
}
