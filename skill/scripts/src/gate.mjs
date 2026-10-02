import { dirname, resolve } from "node:path"
import { SECURITY_RULES } from "./rules.mjs"
import { T, rt } from "./i18n.mjs"
import { detectCommentSlop, isCodePath, multisetDiff } from "./detect.mjs"
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

export function addedFromToolArgs(tool, args, opts) {
  const filePath = typeof args.filePath === "string" ? args.filePath : null
  if (filePath === null || !isCodePath(filePath)) return null
  const genExtra = { gitattr: null, cfgPaths: [], scanGenerated: opts?.includeGenerated === true }
  if (opts?.keepGenerated !== true && isGeneratedFile(filePath, "", genExtra)) return null
  if (tool === "write") {
    if (typeof args.content !== "string" || (opts?.keepGenerated !== true && isGeneratedFile(filePath, args.content, genExtra))) return null
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
export function evaluateEdit(tool, args, opts) {
  if (typeof tool !== "string" || !MUTATING_TOOLS.has(tool)) {
    return { tool, evaluated: false, blocked: false, filePath: null, addedCount: 0, violations: [], message: null }
  }
  const filePathArg = typeof args?.filePath === "string" ? args.filePath : null
  const root = typeof opts?.root === "string" ? opts.root : filePathArg === null ? null : resolveConfigRoot(filePathArg)
  const extracted = addedFromToolArgs(tool, args ?? {}, root === null ? opts : { ...opts, keepGenerated: true })
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
  const violations = configFindings(root, extracted.filePath, extracted.added, true).filter((v) => v.severity === "error")
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
            rt(v.rule, "instead") ?? ""
          }\nPolicy: ${T("gatePolicy")}`,
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
