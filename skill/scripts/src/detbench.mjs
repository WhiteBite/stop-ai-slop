import { existsSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { auditLogPath } from "./audit.mjs"
import { gitToplevel } from "./git.mjs"
import { detectCommentSlop } from "./detect.mjs"
import { profileFor } from "./profiles.mjs"
import { T } from "./i18n.mjs"

export const DETBENCH_FILENAME = "detbench-corpus.json"

export function detbenchCorpusPath(root) {
  return process.env.STOP_AI_SLOP_DETBENCH ?? join(root, DETBENCH_FILENAME)
}

export function detbenchLogPath() {
  return auditLogPath()
}

export function detbenchEntryFromFileFinding({ file, rule, text, ts }) {
  const lines = rule === "multi-line-comment" ? [text, text, text] : [text]
  return { file, lines, rule, ts }
}

const validEntry = (e) =>
  e !== null &&
  typeof e === "object" &&
  typeof e.file === "string" &&
  typeof e.rule === "string" &&
  Array.isArray(e.lines) &&
  e.lines.every((l) => typeof l === "string")

export function entryFires(entry) {
  if (!validEntry(entry)) return false
  const profile = profileFor(entry.file)
  if (!profile) return false
  const findings = detectCommentSlop(entry.lines, profile, false, null, null)
  return Array.isArray(findings) && findings.some((f) => f.rule === entry.rule)
}

export function mineAuditLog(logPath) {
  const raw = readFileSync(logPath, "utf8")
  const findings = []
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event?.verdict !== "blocked" || !Array.isArray(event.findings)) continue
    const file = typeof event.filePath === "string" ? basename(event.filePath) : null
    if (file === null) continue
    const ts = typeof event.ts === "string" ? event.ts.slice(0, 10) : null
    for (const f of event.findings) {
      if (f === null || typeof f !== "object") continue
      if (typeof f.text !== "string" || f.text.trim() === "" || typeof f.rule !== "string") continue
      findings.push({ file, rule: f.rule, text: f.text, ts })
    }
  }
  return findings
}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const entryKey = (e) => `${e.file}\n${e.rule}\n${e.lines.join("\n")}`

export function normalizeDetBench(entries) {
  const seen = new Map()
  for (const e of entries) {
    if (!validEntry(e)) continue
    const key = entryKey(e)
    if (!seen.has(key)) seen.set(key, e)
  }
  return [...seen.values()].sort((a, b) =>
    a.file !== b.file ? cmpStr(a.file, b.file) : a.rule !== b.rule ? cmpStr(a.rule, b.rule) : cmpStr(a.lines.join("\n"), b.lines.join("\n")),
  )
}

export function loadDetBenchCorpus(path) {
  if (!existsSync(path)) return { corpus: null, missing: true }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return { corpus: null, missing: false }
  }
  if (!Array.isArray(parsed)) return { corpus: null, missing: false }
  return { corpus: parsed, missing: false }
}

export function cmdDetBench() {
  const root = gitToplevel(process.cwd())
  const path = detbenchCorpusPath(root)
  const { corpus, missing } = loadDetBenchCorpus(path)
  if (missing) {
    console.log(T("detbenchMissing", path))
    return 0
  }
  if (corpus === null) {
    console.error(`slop-gate: detbench: ${path} — не JSON или не массив`)
    return 2
  }
  const perRule = new Map()
  let misses = 0
  for (const entry of corpus) {
    const ok = entryFires(entry)
    const stat = perRule.get(entry.rule) ?? { hit: 0, total: 0 }
    stat.total++
    if (ok) stat.hit++
    else {
      misses++
      console.error(T("detbenchMissLine", entry.rule, entry.file))
    }
    perRule.set(entry.rule, stat)
  }
  for (const [rule, stat] of [...perRule.entries()].sort((a, b) => cmpStr(a[0], b[0]))) {
    console.log(`${rule}: ${stat.hit}/${stat.total}`)
  }
  const hit = corpus.length - misses
  console.log(misses === 0 ? T("detbenchClean", corpus.length) : T("detbenchMiss", hit, misses))
  return misses === 0 ? 0 : 1
}
