import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { RULE_BY_ID } from "./rules.mjs"

export const CONFIG_KEYS = ["maxCommentLength", "excludePaths", "generatedPaths", "scanGenerated", "rules", "overrides", "ticketPattern"]

const normalizePattern = (p) => p.replace(/^\.\//, "").replace(/\/+$/, "")

export function pathMatches(rel, pattern) {
  if (typeof rel !== "string" || rel === "" || pattern === "") return false
  const p = normalizePattern(pattern)
  const r = normalizePattern(rel)
  if (!p.includes("*")) return r === p || r.startsWith(p + "/")
  const body = p
    .split(/(\*\*)/)
    .map((seg) => (seg === "**" ? ".*" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "[^/]*")))
    .join("")
  return new RegExp("^" + body + "$").test(r)
}

export function loadConfig(root) {
  const path = join(root, ".stop-ai-slop.yaml")
  if (!existsSync(path)) return null
  const config = { maxCommentLength: null, excludePaths: [], rules: new Map(), scanGenerated: null, generatedPaths: [], overrides: [], ticketPattern: null }
  const unquote = (v) => {
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1)
    return v
  }
  let section = null
  let entry = null
  let entryIndent = 0
  let sub = null
  const lines = readFileSync(path, "utf8").split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const t = raw.trim()
    if (t === "" || t.startsWith("#")) continue
    if ((section === "excludePaths" || section === "generatedPaths") && t.startsWith("-")) {
      const item = unquote(t.slice(1).trim())
      if (item !== "") config[section].push(normalizePattern(item))
      continue
    }
    if (section === "rules" && /^\s/.test(raw)) {
      const m = /^([^:]+):\s*(.*)$/.exec(t)
      if (m !== null) {
        const id = m[1].trim()
        const sev = unquote(m[2].trim())
        if (sev !== "off" && sev !== "warning" && sev !== "error") {
          throw new Error(`slop-gate: ${path}:${i + 1}: недопустимое severity "${sev}" (ожидается off, warning или error)`)
        }
        if (RULE_BY_ID.has(id)) config.rules.set(id, sev)
      }
      continue
    }
    if (section === "overrides" && (t.startsWith("-") || /^\s/.test(raw))) {
      const indent = raw.length - raw.trimStart().length
      let body = t
      if (body.startsWith("-")) {
        if (entry === null || indent <= entryIndent) {
          entry = { paths: [], rules: new Map() }
          entryIndent = indent
          sub = null
          config.overrides.push(entry)
          body = body.slice(1).trim()
        } else {
          if (sub === "paths") {
            const item = unquote(body.slice(1).trim())
            if (item !== "") entry.paths.push(normalizePattern(item))
          }
          continue
        }
      }
      if (entry !== null && (body !== t || indent > entryIndent)) {
        const m = /^([^:]+):\s*(.*)$/.exec(body)
        if (m !== null) {
          const key = m[1].trim()
          const value = unquote(m[2].trim())
          if (key === "paths") {
            sub = "paths"
            if (value !== "") entry.paths.push(normalizePattern(value))
          } else if (key === "rules") {
            sub = "rules"
          } else {
            if (value !== "off" && value !== "warning" && value !== "error") {
              throw new Error(`slop-gate: ${path}:${i + 1}: недопустимое severity "${value}" (ожидается off, warning или error)`)
            }
            if (RULE_BY_ID.has(key)) entry.rules.set(key, value)
          }
        }
      }
      continue
    }
    const top = /^(\S[^:]*):\s*(.*)$/.exec(raw)
    if (top === null) {
      section = null
      continue
    }
    const key = top[1].trim()
    const value = unquote(top[2].trim())
    if (key === "maxCommentLength") {
      const n = Number(value)
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`slop-gate: ${path}:${i + 1}: maxCommentLength должен быть положительным целым`)
      }
      config.maxCommentLength = n
      section = null
    } else if (key === "excludePaths") {
      section = "excludePaths"
      if (value !== "") config.excludePaths.push(normalizePattern(value))
    } else if (key === "generatedPaths") {
      section = "generatedPaths"
      if (value !== "") config.generatedPaths.push(normalizePattern(value))
    } else if (key === "scanGenerated") {
      if (value !== "true" && value !== "false") {
        throw new Error(`slop-gate: ${path}:${i + 1}: scanGenerated должен быть true или false`)
      }
      config.scanGenerated = value === "true"
      section = null
    } else if (key === "ticketPattern") {
      if (value === "") {
        throw new Error(`slop-gate: ${path}:${i + 1}: ticketPattern должен быть непустым регулярным выражением`)
      }
      try {
        config.ticketPattern = new RegExp(value).source
      } catch (error) {
        throw new Error(`slop-gate: ${path}:${i + 1}: ticketPattern не компилируется как RegExp: ${String(error.message ?? error)}`)
      }
      section = null
    } else if (key === "rules") {
      section = "rules"
    } else if (key === "overrides") {
      section = "overrides"
      entry = null
      sub = null
    } else if (RULE_BY_ID.has(key)) {
      throw new Error(`slop-gate: ${path}:${i + 1}: "${key}" — id правила; override severity пишется внутри секции rules: с отступом в два пробела`)
    } else {
      section = null
    }
  }
  return config
}
export function configOptions(config) {
  if (config === null) return null
  const opts = {}
  if (config.maxCommentLength !== null) opts.maxLength = config.maxCommentLength
  if (config.ticketPattern !== null) opts.ticketPattern = config.ticketPattern
  return Object.keys(opts).length === 0 ? null : opts
}
export function applyRuleConfig(findings, config) {
  if (config === null || (config.rules.size === 0 && config.overrides.length === 0)) return findings
  const out = []
  for (const f of findings) {
    let sev = config.rules.get(f.rule)
    for (const o of config.overrides) {
      if (!o.paths.some((p) => pathMatches(f.rel, p))) continue
      const oSev = o.rules.get(f.rule)
      if (oSev !== undefined) sev = oSev
    }
    if (sev === undefined) out.push(f)
    else if (sev !== "off") out.push({ ...f, severity: sev })
  }
  return out
}
