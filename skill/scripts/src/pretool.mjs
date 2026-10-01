import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { SECURITY_RULES } from "./rules.mjs"
import { toRel } from "./paths.mjs"
import { profileFor } from "./profiles.mjs"
import { detectCommentSlop, readDisk } from "./detect.mjs"
import { genContext, isGeneratedFile } from "./generated.mjs"
import { addedFromToolArgs, extractPatchDeltas } from "./gate.mjs"
import { loadConfig } from "./config.mjs"
import { gitToplevel, scanFiles } from "./git.mjs"
import { loadBaseline, maskBaselined } from "./baseline.mjs"
import { failsGate, printFindings } from "./report.mjs"
import { T, rt } from "./i18n.mjs"

export function cmdStdinPath() {
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
  const profile = profileFor(filePath)
  if (profile === null || !existsSync(filePath)) return 0
  let config = null
  try {
    config = loadConfig(root)
  } catch {
    config = null
  }
  const findings = scanFiles([filePath], root, null, genContext(root, config)).map((f) => ({ ...f, rel: toRel(root, resolve(filePath)) }))
  const baseline = loadBaseline(root)
  const fresh = maskBaselined(baseline, findings)
  printFindings(fresh)
  return failsGate(fresh, false) ? 1 : 0
}
export const PRE_TOOL_READ_ONLY = /read|view|grep|search|glob|list|ls|bash|shell|exec|run|fetch|web|think|todo|plan/

export function preToolPatch(ti) {
  const text = [ti.command, ti.input, ti.patch, ti.text].find((v) => typeof v === "string")
  if (text === undefined) return 0
  const deltas = extractPatchDeltas(text)
  if (deltas.length === 0) return 0
  const root = gitToplevel(process.cwd())
  let config = null
  try {
    config = loadConfig(root)
  } catch {
    config = null
  }
  let blocked = false
  for (const { filePath, added } of deltas) {
    if (isGeneratedFile(filePath, "", { gitattr: null, cfgPaths: [], scanGenerated: config?.scanGenerated === true })) continue
    let violations = detectCommentSlop(added, profileFor(filePath) ?? undefined, true).filter((v) => v.severity === "error")
    const disk = readDisk(filePath)
    const genText = typeof disk === "string" ? disk : added.join("\n")
    if (isGeneratedFile(toRel(root, resolve(filePath)), genText, genContext(root, config))) {
      violations = violations.filter((v) => SECURITY_RULES.has(v.rule))
    }
    for (const v of violations) {
      process.stderr.write(`slop-gate: ${v.rule} [${v.severity}] at ${filePath}:${v.lineNo}\n${v.lines.join("\n")}\ninstead: ${rt(v.rule, "instead")}\n`)
    }
    if (violations.length > 0) blocked = true
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
  let tool = String(payload?.tool_name ?? "").toLowerCase()
  if (tool === "write_file") tool = "write"
  else if (tool === "replace") tool = "edit"
  const ti = payload?.tool_input ?? {}
  if (tool === "apply_patch") return preToolPatch(ti)
  if (tool !== "write" && tool !== "edit" && tool !== "multiedit") {
    if (PRE_TOOL_READ_ONLY.test(tool)) return 0
    const shapePath = ti.file_path ?? ti.filePath
    const shapePatch = [ti.command, ti.input, ti.patch, ti.text].find((v) => typeof v === "string")
    if (typeof shapePath === "string" && typeof ti.content === "string") tool = "write"
    else if (
      typeof shapePath === "string" &&
      typeof (ti.old_string ?? ti.oldString ?? ti.old_str) === "string" &&
      typeof (ti.new_string ?? ti.newString ?? ti.new_str) === "string"
    )
      tool = "edit"
    else if (typeof shapePath === "string" && Array.isArray(ti.edits)) tool = "multiedit"
    else if (typeof shapePatch === "string" && shapePatch.includes("*** Begin Patch")) return preToolPatch(ti)
    else return 0
  }
  const root = gitToplevel(process.cwd())
  let config = null
  try {
    config = loadConfig(root)
  } catch {
    config = null
  }
  const extracted = addedFromToolArgs(
    tool,
    {
      filePath: ti.file_path ?? ti.filePath,
      content: ti.content,
      oldString: ti.old_string ?? ti.oldString ?? ti.old_str,
      newString: ti.new_string ?? ti.newString ?? ti.new_str,
      edits: Array.isArray(ti.edits)
        ? ti.edits.map((e) => ({ oldString: e?.old_string ?? e?.oldString, newString: e?.new_string ?? e?.newString }))
        : ti.edits,
    },
    { includeGenerated: config?.scanGenerated === true },
  )
  if (extracted === null) return 0
  let violations = detectCommentSlop(extracted.added, profileFor(extracted.filePath) ?? undefined, true).filter((v) => v.severity === "error")
  const disk = readDisk(extracted.filePath)
  const genText = typeof disk === "string" ? disk : extracted.added.join("\n")
  if (isGeneratedFile(toRel(root, resolve(extracted.filePath)), genText, genContext(root, config))) {
    violations = violations.filter((v) => SECURITY_RULES.has(v.rule))
  }
  if (violations.length === 0) return 0
  for (const v of violations) {
    process.stderr.write(`slop-gate: ${v.rule} [${v.severity}] at ${extracted.filePath}:${v.lineNo}\n${v.lines.join("\n")}\ninstead: ${rt(v.rule, "instead")}\n`)
  }
  return 2
}
