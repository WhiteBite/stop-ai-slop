import { HELP_EN, HELP_RU } from "../messages.mjs"
import { gitDiffRef, gitStagedDiff, gitToplevel, collectFiles, runDiffGate, scanFiles } from "./git.mjs"
import { applyRuleConfig, configOptions, loadConfig } from "./config.mjs"
import { genContext } from "./generated.mjs"
import { baselineKey, fingerprint, loadBaseline, maskBaselined, writeBaselineFile } from "./baseline.mjs"
import { cmdExplain, failsGate, printFindings } from "./report.mjs"
import { currentLang, resolveLang, setLang, T } from "./i18n.mjs"
import { cmdInstall, cmdInstallHooks, cmdInstallRules } from "./install.mjs"
import { cmdFix } from "./fix.mjs"
import { cmdAudit } from "./audit.mjs"
import { cmdMcp } from "./mcp.mjs"
import { cmdPreTool, cmdStdinPath } from "./pretool.mjs"
import { cmdBench } from "./bench.mjs"

export function cmdScan(paths, { writeBaseline = false, strict = false, prune = false, format = "text" } = {}) {
  const root = gitToplevel(process.cwd())
  let config
  try {
    config = loadConfig(root)
  } catch (error) {
    console.error(error.message)
    return 2
  }
  let files
  try {
    files = collectFiles(paths, root, config?.excludePaths ?? [])
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }
  const findings = applyRuleConfig(scanFiles(files, root, configOptions(config), genContext(root, config)), config)
  if (writeBaseline) {
    const n = writeBaselineFile(root, findings)
    console.log(T("baselineWritten", n))
    return 0
  }
  if (prune) {
    const baseline = loadBaseline(root)
    if (baseline.fp.size > 0) {
      const n = writeBaselineFile(root, findings.filter((f) => baseline.fp.has(fingerprint(f))))
      console.log(T("baselinePruned", baseline.fp.size - n))
      return 0
    }
    const keys = new Set(findings.map(baselineKey))
    const kept = [...baseline.legacy].filter((k) => keys.has(k)).sort()
    const body = ["# slop-gate baseline: relpath:line", ...kept].join("\n") + "\n"
    writeFileSync(join(root, "stop-ai-slop.baseline.txt"), body)
    console.log(T("baselinePruned", baseline.legacy.size - kept.length))
    return 0
  }
  const baseline = loadBaseline(root)
  const fresh = maskBaselined(baseline, findings)
  printFindings(fresh, format, strict)
  return failsGate(fresh, strict) ? 1 : 0
}
export function cmdStaged(strict = false, format = "text") {
  const root = gitToplevel(process.cwd())
  let config
  try {
    config = loadConfig(root)
  } catch (error) {
    console.error(error.message)
    return 2
  }
  let diff
  try {
    diff = gitStagedDiff(root)
  } catch (error) {
    console.error(T("gitError", error.message))
    return 2
  }
  if (diff === null) {
    console.log(T("notGitStaged"))
    return 0
  }
  return runDiffGate(diff, root, strict, format, config, genContext(root, config))
}
export function cmdDiff(ref, strict = false, format = "text") {
  const root = gitToplevel(process.cwd())
  let config
  try {
    config = loadConfig(root)
  } catch (error) {
    console.error(error.message)
    return 2
  }
  let diff
  try {
    diff = gitDiffRef(ref, root)
  } catch (error) {
    console.error(T("gitError", error.message))
    return 2
  }
  if (diff === null) {
    console.log(T("notGitDiff"))
    return 0
  }
  return runDiffGate(diff, root, strict, format, config, genContext(root, config))
}
export const KNOWN_FLAGS = new Set([
  "--self-test",
  "--explain",
  "--strict",
  "--install",
  "--install-hooks",
  "--install-rules",
  "--staged",
  "--diff",
  "--fix",
  "--dry-run",
  "--baseline-write",
  "--baseline-prune",
  "--bench",
  "--bench-write",
  "--audit",
  "--stdin-path",
  "--mcp",
  "--pre-tool",
  "--format",
  "--lang",
  "--help",
])

export const FORMATS = new Set(["text", "json", "sarif"])

export function parseFormat(argv) {
  const idx = argv.indexOf("--format")
  if (idx === -1) return { format: "text", rest: argv }
  const value = argv[idx + 1]
  if (value === undefined || value.startsWith("--") || !FORMATS.has(value)) {
    console.error("slop-gate: --format требует значение text, json или sarif")
    return null
  }
  return { format: value, rest: [...argv.slice(0, idx), ...argv.slice(idx + 2)] }
}
export function cmdUsage() {
  console.log((currentLang() === "en" ? HELP_EN : HELP_RU).join("\n"))
  return 0
}

export const positionalPaths = (argv) => {
  const paths = argv.filter((a) => a !== "scan" && !a.startsWith("--"))
  return paths.length > 0 ? paths : ["."]
}

export const MODES = [
  ["--install", (argv, { strict }) => cmdInstall(strict)],
  ["--install-hooks", () => cmdInstallHooks()],
  ["--install-rules", () => cmdInstallRules()],
  ["--fix", (argv, { strict }) => cmdFix(positionalPaths(argv), { dryRun: argv.includes("--dry-run"), strict })],
  ["--staged", (argv, { strict, format }) => cmdStaged(strict, format)],
  [
    "--diff",
    (argv, { strict, format }) => {
      const ref = argv[argv.indexOf("--diff") + 1]
      if (ref === undefined || ref.startsWith("--")) {
        console.error("slop-gate: --diff требует ref (например, main)")
        return 2
      }
      return cmdDiff(ref, strict, format)
    },
  ],
  ["--help", () => cmdUsage()],
  [
    "--audit",
    (argv) => {
      const n = Number(argv[argv.indexOf("--audit") + 1])
      return cmdAudit(Number.isInteger(n) && n > 0 ? n : 20)
    },
  ],
  ["--baseline-prune", (argv) => cmdScan(positionalPaths(argv), { prune: true })],
  ["--bench-write", () => cmdBench(true)],
  ["--bench", () => cmdBench(false)],
  ["--stdin-path", () => cmdStdinPath()],
  ["--mcp", () => cmdMcp()],
  ["--pre-tool", () => cmdPreTool()],
]

export function main(argv) {
  if (argv.includes("--self-test")) return import("../selftest.mjs").then((m) => m.cmdSelfTest())
  const lang = resolveLang(argv)
  if (lang.error) {
    console.error(T("langNeedsValue"))
    return 2
  }
  setLang(lang.lang)
  const langIdx = argv.indexOf("--lang")
  if (langIdx !== -1) argv = [...argv.slice(0, langIdx), ...argv.slice(langIdx + 2)]
  const explainIdx = argv.indexOf("--explain")
  if (explainIdx !== -1) {
    const ruleId = argv[explainIdx + 1]
    if (ruleId === undefined || ruleId.startsWith("--")) {
      console.error(T("explainNeedsId"))
      return 2
    }
    return cmdExplain(ruleId)
  }
  const strict = argv.includes("--strict")
  const parsed = parseFormat(argv)
  if (parsed === null) return 2
  const { format } = parsed
  argv = parsed.rest
  for (const [flag, run] of MODES) {
    if (argv.includes(flag)) return run(argv, { strict, format })
  }
  const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN_FLAGS.has(a) && a !== "--lang")
  if (unknown.length > 0) {
    console.error(T("unknownFlag", unknown[0]))
    return 2
  }
  return cmdScan(positionalPaths(argv), { writeBaseline: argv.includes("--baseline-write"), strict, format })
}
