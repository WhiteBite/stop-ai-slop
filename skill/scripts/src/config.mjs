import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { RULE_BY_ID } from "./rules.mjs"

export const CONFIG_KEYS = ["maxCommentLength", "excludePaths", "generatedPaths", "scanGenerated", "rules"]
export function loadConfig(root) {
  const path = join(root, ".stop-ai-slop.yaml")
  if (!existsSync(path)) return null
  const config = { maxCommentLength: null, excludePaths: [], rules: new Map(), scanGenerated: null, generatedPaths: [] }
  const unquote = (v) => {
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1)
    return v
  }
  let section = null
  const lines = readFileSync(path, "utf8").split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const t = raw.trim()
    if (t === "" || t.startsWith("#")) continue
    if ((section === "excludePaths" || section === "generatedPaths") && t.startsWith("-")) {
      const item = unquote(t.slice(1).trim())
      if (item !== "") config[section].push(item.replace(/^\.\//, "").replace(/\/+$/, ""))
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
      if (value !== "") config.excludePaths.push(value.replace(/^\.\//, "").replace(/\/+$/, ""))
    } else if (key === "generatedPaths") {
      section = "generatedPaths"
      if (value !== "") config.generatedPaths.push(value.replace(/^\.\//, "").replace(/\/+$/, ""))
    } else if (key === "scanGenerated") {
      if (value !== "true" && value !== "false") {
        throw new Error(`slop-gate: ${path}:${i + 1}: scanGenerated должен быть true или false`)
      }
      config.scanGenerated = value === "true"
      section = null
    } else if (key === "rules") {
      section = "rules"
    } else if (RULE_BY_ID.has(key)) {
      throw new Error(`slop-gate: ${path}:${i + 1}: "${key}" — id правила; override severity пишется внутри секции rules: с отступом в два пробела`)
    } else {
      section = null
    }
  }
  return config
}
export function configOptions(config) {
  return config !== null && config.maxCommentLength !== null ? { maxLength: config.maxCommentLength } : null
}
export function applyRuleConfig(findings, config) {
  if (config === null || config.rules.size === 0) return findings
  const out = []
  for (const f of findings) {
    const sev = config.rules.get(f.rule)
    if (sev === undefined) out.push(f)
    else if (sev !== "off") out.push({ ...f, severity: sev })
  }
  return out
}
