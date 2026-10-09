import { dirname, resolve } from "node:path"
import { SECURITY_RULES } from "./rules.mjs"
import { T, rt } from "./i18n.mjs"
import { detectCommentSlop, isCodePath, multisetDiffLines } from "./detect.mjs"
import { readDisk } from "./diskio.mjs"
import { genContext, isGeneratedFile } from "./generated.mjs"
import { profileFor } from "./profiles.mjs"
import { applyRuleConfig, configOptions, loadConfig } from "./config.mjs"
import { toRel } from "./paths.mjs"
import { gitToplevel } from "./git.mjs"

const CONFIG_CACHE = new Map()
const ROOT_CACHE = new Map()
const CACHE_MAX = 512

function cacheSet(map, key, value) {
  if (map.size >= CACHE_MAX) map.delete(map.keys().next().value)
  map.set(key, value)
}

// root must come from the edited file, not cwd: the OpenCode host cwd is often another repo
function resolveConfigRoot(filePath) {
  const dir = dirname(resolve(filePath))
  if (ROOT_CACHE.has(dir)) return ROOT_CACHE.get(dir)
  const root = gitToplevel(dir)
  cacheSet(ROOT_CACHE, dir, root)
  return root
}

export function loadConfigCached(root) {
  if (CONFIG_CACHE.has(root)) return CONFIG_CACHE.get(root)
  const config = loadConfig(root)
  cacheSet(CONFIG_CACHE, root, config)
  return config
}

export function configFindings(root, filePath, lines, diffMode, config) {
  const cfg = config === undefined ? (root === null ? null : loadConfigCached(root)) : config
  const detected = detectCommentSlop(lines, profileFor(filePath) ?? undefined, diffMode, null, configOptions(cfg))
  if (root === null) return applyRuleConfig(detected, cfg)
  const rel = toRel(root, resolve(filePath))
  const disk = readDisk(filePath)
  const text = typeof disk === "string" ? disk : lines.join("\n")
  const visible = isGeneratedFile(rel, text, genContext(root, cfg))
    ? detected.filter((f) => SECURITY_RULES.has(f.rule))
    : detected
  return applyRuleConfig(visible.map((f) => ({ rel, ...f })), cfg)
}

const countLines = (text) => text.replaceAll("\r\n", "\n").split("\n").length
function lineOf(haystack, needle) {
  const idx = haystack.indexOf(needle)
  if (idx === -1) return null
  let line = 1
  for (let i = 0; i < idx; i++) if (haystack[i] === "\n") line++
  return line
}
export function addedFromToolArgs(tool, args, opts) {
  const filePath = typeof args.filePath === "string" ? args.filePath : null
  if (filePath === null || !isCodePath(filePath)) return null
  const genExtra = { gitattr: null, cfgPaths: [], scanGenerated: opts?.includeGenerated === true }
  if (opts?.keepGenerated !== true && isGeneratedFile(filePath, "", genExtra)) return null
  if (tool === "write") {
    if (typeof args.content !== "string" || (opts?.keepGenerated !== true && isGeneratedFile(filePath, args.content, genExtra))) return null
    const disk = readDisk(filePath)
    return { filePath, ...multisetDiffLines(disk ?? "", args.content) }
  }
  if (tool === "edit") {
    if (typeof args.oldString !== "string" || typeof args.newString !== "string") return null
    const { added, lineNos } = multisetDiffLines(args.oldString, args.newString)
    const disk = readDisk(filePath)
    const base = typeof disk === "string" ? lineOf(disk, args.oldString) : null
    return { filePath, added, lineNos: base === null ? null : lineNos.map((n) => n + base - 1) }
  }
  if (!Array.isArray(args.edits)) return null
  const added = []
  const lineNos = []
  const disk = readDisk(filePath)
  let shift = 0
  let known = typeof disk === "string"
  for (const entry of args.edits) {
    if (typeof entry !== "object" || entry === null) continue
    if (typeof entry.oldString !== "string" || typeof entry.newString !== "string") continue
    const part = multisetDiffLines(entry.oldString, entry.newString)
    added.push(...part.added)
    const baseInDisk = known ? lineOf(disk, entry.oldString) : null
    if (baseInDisk === null) {
      known = false
      continue
    }
    for (const n of part.lineNos) lineNos.push(n + baseInDisk + shift - 1)
    shift += countLines(entry.newString) - countLines(entry.oldString)
  }
  return { filePath, added, lineNos: known && lineNos.length === added.length ? lineNos : null }
}
// findings are indexed against the added-lines array; restore real file positions when known
export function locateViolations(violations, lineNos) {
  if (lineNos === null || lineNos === undefined) return violations
  return violations.map((v) => ({ ...v, lineNo: lineNos[v.lineNo - 1] ?? v.lineNo }))
}
export function formatFindings(filePath, violations, prefix = "comment-gate") {
  const blocks = violations.map((v) => {
    const at = v.lineNo === null || v.lineNo === undefined ? filePath : `${filePath}:${v.lineNo}`
    return `${prefix}: ${v.rule} [${v.severity}] at ${at}\n${v.lines.join("\n")}\ninstead: ${rt(v.rule, "instead") ?? ""}`
  })
  return `${blocks.join("\n\n")}\nPolicy: ${T("gatePolicy")}`
}
export const MUTATING_TOOLS = new Set(["edit", "write", "multiedit"])
const PRE_TOOL_READ_ONLY = /read|view|grep|search|glob|list|ls|bash|shell|exec|run|fetch|web|think|todo|plan/

export function shapeTool(tool, args) {
  let name = String(tool ?? "").toLowerCase()
  if (name === "write_file") name = "write"
  else if (name === "replace") name = "edit"
  if (name === "apply_patch") return "apply_patch"
  if (MUTATING_TOOLS.has(name)) return name
  if (PRE_TOOL_READ_ONLY.test(name)) return null
  const shapePath = args?.file_path ?? args?.filePath
  const shapePatch = [args?.command, args?.input, args?.patch, args?.text].find((v) => typeof v === "string")
  if (typeof shapePath === "string" && typeof args?.content === "string") return "write"
  if (
    typeof shapePath === "string" &&
    typeof (args?.old_string ?? args?.oldString ?? args?.old_str) === "string" &&
    typeof (args?.new_string ?? args?.newString ?? args?.new_str) === "string"
  )
    return "edit"
  if (typeof shapePath === "string" && Array.isArray(args?.edits)) return "multiedit"
  if (typeof shapePatch === "string" && shapePatch.includes("*** Begin Patch")) return "apply_patch"
  return null
}

export function normalizeToolArgs(args) {
  return {
    filePath: args?.file_path ?? args?.filePath,
    content: args?.content,
    oldString: args?.old_string ?? args?.oldString ?? args?.old_str,
    newString: args?.new_string ?? args?.newString ?? args?.new_str,
    edits: Array.isArray(args?.edits)
      ? args.edits.map((e) => ({ oldString: e?.old_string ?? e?.oldString, newString: e?.new_string ?? e?.newString }))
      : args?.edits,
  }
}

export function evaluateEdit(tool, args, opts) {
  const raw = args ?? {}
  const filePathArg = typeof raw.filePath === "string" ? raw.filePath : typeof raw.file_path === "string" ? raw.file_path : null
  const shaped = typeof tool === "string" ? shapeTool(tool, raw) : null
  if (shaped === null) {
    return { tool, evaluated: false, blocked: false, filePath: filePathArg, addedCount: 0, violations: [], message: null }
  }
  if (shaped === "apply_patch") {
    const text = [raw.command, raw.input, raw.patch, raw.text].find((v) => typeof v === "string")
    const deltas = typeof text === "string" ? extractPatchDeltas(text) : []
    if (deltas.length === 0) {
      return { tool: shaped, evaluated: false, blocked: false, filePath: null, addedCount: 0, violations: [], message: null }
    }
    const groups = []
    let addedCount = 0
    for (const { filePath, added } of deltas) {
      addedCount += added.length
      const root = typeof opts?.root === "string" ? opts.root : resolveConfigRoot(filePath)
      const violations = configFindings(root, filePath, added, true).filter((v) => v.severity === "error")
      if (violations.length > 0) groups.push({ filePath, violations: violations.map((v) => ({ ...v, lineNo: null })) })
    }
    const merged = groups.flatMap((g) => g.violations)
    const result = {
      tool: shaped,
      evaluated: true,
      blocked: merged.length > 0,
      filePath: deltas[0].filePath,
      addedCount,
      violations: merged,
      message: null,
    }
    if (merged.length > 0) result.message = groups.map((g) => formatFindings(g.filePath, g.violations)).join("\n")
    return result
  }
  const root = typeof opts?.root === "string" ? opts.root : filePathArg === null ? null : resolveConfigRoot(filePathArg)
  const extracted = addedFromToolArgs(shaped, normalizeToolArgs(raw), root === null ? opts : { ...opts, keepGenerated: true })
  if (extracted === null) {
    return { tool: shaped, evaluated: false, blocked: false, filePath: filePathArg, addedCount: 0, violations: [], message: null }
  }
  const violations = locateViolations(
    configFindings(root, extracted.filePath, extracted.added, true).filter((v) => v.severity === "error"),
    extracted.lineNos,
  )
  const result = {
    tool: shaped,
    evaluated: true,
    blocked: violations.length > 0,
    filePath: extracted.filePath,
    addedCount: extracted.added.length,
    violations,
    message: null,
  }
  if (violations.length > 0) result.message = formatFindings(extracted.filePath, violations)
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
