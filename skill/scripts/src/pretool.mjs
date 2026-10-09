import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { toRel } from "./paths.mjs"
import { profileFor } from "./profiles.mjs"
import { addedFromToolArgs, configFindings, extractPatchDeltas, formatFindings, loadConfigCached, locateViolations, normalizeToolArgs, shapeTool } from "./gate.mjs"
import { gitToplevel, readScannable } from "./git.mjs"
import { loadBaseline, maskBaselined } from "./baseline.mjs"
import { failsGate, findingsToText, printFindings } from "./report.mjs"
import { printFixSuggestions } from "./fixsuggest.mjs"
import { T } from "./i18n.mjs"

function loadConfigOrNull(root) {
  try {
    return loadConfigCached(root)
  } catch {
    return null
  }
}

export function cmdStdinPath(fixSuggestions = false) {
  const payload = readFileSync(0, "utf8")
  let filePath = null
  try {
    const parsed = JSON.parse(payload)
    filePath = parsed?.tool_input?.file_path ?? parsed?.tool_input?.filePath ?? null
  } catch {
    filePath = null
  }
  if (typeof filePath !== "string" || filePath === "") return 0
  const root = gitToplevel(process.cwd())
  if (profileFor(filePath) === null || !existsSync(filePath)) return 0
  const text = readScannable(filePath)
  if (text === null) return 0
  const findings = configFindings(root, filePath, text.replaceAll("\r\n", "\n").split("\n"), false, loadConfigOrNull(root)).map(
    (f) => ({ ...f, rel: toRel(root, resolve(filePath)) }),
  )
  const baseline = loadBaseline(root)
  const fresh = maskBaselined(baseline, findings)
  if (fixSuggestions) printFixSuggestions(root, fresh, "text")
  if (failsGate(fresh, false)) {
    // Claude Code delivers hook stderr to the model only on exit 2
    process.stderr.write(findingsToText(fresh) + "\n")
    return 2
  }
  printFindings(fresh)
  return 0
}

export function preToolPatch(ti) {
  const text = [ti.command, ti.input, ti.patch, ti.text].find((v) => typeof v === "string")
  if (text === undefined) return 0
  const deltas = extractPatchDeltas(text)
  if (deltas.length === 0) return 0
  const root = gitToplevel(process.cwd())
  const config = loadConfigOrNull(root)
  let blocked = false
  for (const { filePath, added } of deltas) {
    const violations = configFindings(root, filePath, added, true, config).filter((v) => v.severity === "error")
    if (violations.length > 0) {
      // V4A patches carry no line numbers, so an index would be a false anchor
      process.stderr.write(formatFindings(filePath, violations.map((v) => ({ ...v, lineNo: null })), "slop-gate") + "\n")
      blocked = true
    }
  }
  return blocked ? 2 : 0
}

export function cmdPreTool() {
  let payload
  try {
    payload = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    process.stderr.write(T("preToolNotJson") + "\n")
    return 0
  }
  const ti = payload?.tool_input ?? {}
  const shaped = shapeTool(payload?.tool_name, ti)
  if (shaped === null) return 0
  if (shaped === "apply_patch") return preToolPatch(ti)
  const root = gitToplevel(process.cwd())
  const config = loadConfigOrNull(root)
  const extracted = addedFromToolArgs(shaped, normalizeToolArgs(ti), {
    includeGenerated: config?.scanGenerated === true,
    keepGenerated: true,
  })
  if (extracted === null) return 0
  const violations = locateViolations(
    configFindings(root, extracted.filePath, extracted.added, true, config).filter((v) => v.severity === "error"),
    extracted.lineNos,
  )
  if (violations.length === 0) return 0
  process.stderr.write(formatFindings(extracted.filePath, violations, "slop-gate") + "\n")
  return 2
}
