import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { T } from "./i18n.mjs"

const ROTATION_SCAN_BYTES = 10000

export function auditLogPath() {
  return process.env.STOP_AI_SLOP_LOG ?? join(homedir(), ".config", "opencode", "logs", "comment-gate.jsonl")
}

export function appendAudit(entry, path = auditLogPath()) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    // lines.length > 10000 needs >= 10000 newlines, so a file under 10000 bytes can never rotate
    if (existsSync(path) && statSync(path).size >= ROTATION_SCAN_BYTES) {
      const lines = readFileSync(path, "utf8").split(/\r?\n/)
      if (lines.length > 10000) writeFileSync(path, lines.slice(-5000).join("\n") + "\n")
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
  for (const e of entries) {
    const key = e.verdict ?? e.event ?? "?"
    counts[key] = (counts[key] ?? 0) + 1
  }
  console.log(T("auditSummary", path, entries.length, Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")))
  for (const e of entries.slice(-limit)) {
    const rules = Array.isArray(e.rules) && e.rules.length > 0 ? ` [${e.rules.join(",")}]` : ""
    console.log(`${e.ts} ${e.verdict ?? e.event} ${e.tool ?? ""} ${e.filePath ?? ""}${rules}`)
  }
  return 0
}
