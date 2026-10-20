import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { T } from "./i18n.mjs"

const ROTATE_AT_BYTES = 512 * 1024
const KEEP_BYTES = 256 * 1024

export function auditLogPath() {
  return process.env.STOP_AI_SLOP_LOG ?? join(homedir(), ".config", "opencode", "logs", "comment-gate.jsonl")
}

export function appendAudit(entry, path = auditLogPath()) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    if (existsSync(path) && statSync(path).size >= ROTATE_AT_BYTES) {
      const content = readFileSync(path, "utf8")
      const keepStart = Math.max(0, content.length - KEEP_BYTES)
      const nl = content.indexOf("\n", keepStart)
      const start = nl === -1 ? keepStart : nl + 1
      writeFileSync(path, content.slice(start))
    }
    appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n")
  } catch {
    return
  }
}

export function cmdAudit(limit) {
  const path = auditLogPath()
  if (!existsSync(path)) {
    console.log(T("auditEmpty"))
    return 0
  }
  const entries = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter((e) => e !== null)
  const counts = {}
  const unevalByTool = {}
  for (const e of entries) {
    const key = e.verdict ?? e.event ?? "?"
    counts[key] = (counts[key] ?? 0) + 1
    if (e.verdict === "unevaluated") unevalByTool[e.tool ?? "?"] = (unevalByTool[e.tool ?? "?"] ?? 0) + 1
  }
  console.log(T("auditSummary", path, entries.length, Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")))
  if (Object.keys(unevalByTool).length > 0) {
    console.log(T("auditUnevaluatedByTool", Object.entries(unevalByTool).map(([k, v]) => `${k}: ${v}`).join(", ")))
  }
  for (const e of entries.slice(-limit)) {
    const rules = Array.isArray(e.rules) && e.rules.length > 0 ? ` [${e.rules.join(",")}]` : ""
    console.log(`${e.ts} ${e.verdict ?? e.event} ${e.tool ?? ""} ${e.filePath ?? ""}${rules}`)
  }
  return 0
}