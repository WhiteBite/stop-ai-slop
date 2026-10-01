import { RULE_BY_ID } from "./rules.mjs"
import { detectCommentSlop, isCodePath, multisetDiff, readDisk } from "./detect.mjs"
import { isGeneratedFile } from "./generated.mjs"
import { profileFor } from "./profiles.mjs"

export function addedFromToolArgs(tool, args, opts) {
  const filePath = typeof args.filePath === "string" ? args.filePath : null
  if (filePath === null || !isCodePath(filePath)) return null
  const genExtra = { gitattr: null, cfgPaths: [], scanGenerated: opts?.includeGenerated === true }
  if (isGeneratedFile(filePath, "", genExtra)) return null
  if (tool === "write") {
    if (typeof args.content !== "string" || isGeneratedFile(filePath, args.content, genExtra)) return null
    const disk = readDisk(filePath)
    return {
      filePath,
      added: multisetDiff(disk ?? "", args.content),
    }
  }
  if (tool === "edit") {
    if (typeof args.oldString !== "string" || typeof args.newString !== "string") return null
    return { filePath, added: multisetDiff(args.oldString, args.newString) }
  }
  if (!Array.isArray(args.edits)) return null
  const added = []
  for (const entry of args.edits) {
    if (typeof entry !== "object" || entry === null) continue
    if (typeof entry.oldString === "string" && typeof entry.newString === "string") {
      added.push(...multisetDiff(entry.oldString, entry.newString))
    }
  }
  return { filePath, added }
}
export const MUTATING_TOOLS = new Set(["edit", "write", "multiedit"])
export const GATE_POLICY =
  "комментарий — максимум одна строка и только неочевидное внешнее ограничение/инвариант/воркэраунд; пересказ диффа (было/стало/почему тест существует) живёт в коммите и имени теста. Убери комментарий или сожми до одной строки WHY."
export function evaluateEdit(tool, args, opts) {
  if (typeof tool !== "string" || !MUTATING_TOOLS.has(tool)) {
    return { tool, evaluated: false, blocked: false, filePath: null, addedCount: 0, violations: [], message: null }
  }
  const extracted = addedFromToolArgs(tool, args ?? {}, opts)
  if (extracted === null) {
    return {
      tool,
      evaluated: false,
      blocked: false,
      filePath: typeof args?.filePath === "string" ? args.filePath : null,
      addedCount: 0,
      violations: [],
      message: null,
    }
  }
  const violations = detectCommentSlop(extracted.added, profileFor(extracted.filePath) ?? undefined, true).filter(
    (v) => v.severity === "error",
  )
  const result = {
    tool,
    evaluated: true,
    blocked: violations.length > 0,
    filePath: extracted.filePath,
    addedCount: extracted.added.length,
    violations,
    message: null,
  }
  if (violations.length > 0) {
    result.message = violations
      .map(
        (v) =>
          `comment-gate: ${v.rule} [${v.severity}] at ${extracted.filePath}:${v.lineNo}\n${v.lines.join("\n")}\ninstead: ${
            RULE_BY_ID.get(v.rule)?.instead ?? ""
          }\nPolicy: ${GATE_POLICY}`,
      )
      .join("\n\n")
  }
  return result
}
export function extractPatchDeltas(patchText) {
  const byFile = new Map()
  let currentFile = null
  for (const line of patchText.split(/\r?\n/)) {
    if (line.startsWith("*** Add File: ")) currentFile = line.slice(14).trim()
    else if (line.startsWith("*** Update File: ")) currentFile = line.slice(17).trim()
    else if (line.startsWith("*** Move to: ")) currentFile = line.slice(13).trim()
    else if (line.startsWith("*** Delete File: ")) currentFile = null
    else if (line.startsWith("*** ")) continue
    else if (currentFile !== null && line.startsWith("+")) {
      const list = byFile.get(currentFile) ?? []
      list.push(line.slice(1))
      byFile.set(currentFile, list)
    }
  }
  const out = []
  for (const [filePath, added] of byFile) {
    if (filePath === "" || added.length === 0 || !isCodePath(filePath)) continue
    out.push({ filePath, added })
  }
  return out
}
