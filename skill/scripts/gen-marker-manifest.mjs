#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const MARKERS_PATH = fileURLToPath(new URL("./src/markers.mjs", import.meta.url))
const KT_MARKERS_PATH = fileURLToPath(new URL("../../detekt-rules/src/main/kotlin/whitebite/slop/SlopMarkers.kt", import.meta.url))
const MANIFEST_PATH = fileURLToPath(new URL("../../detekt-rules/src/test/resources/marker-manifest.json", import.meta.url))

const MARKER_MAP = [
  { js: "AI_PLAN_ACK", kt: "AI_PLAN_NARRATION" },
  { js: "AI_PLAN_REFERENCE", kt: "AI_PLAN_NARRATION" },
  { js: "AI_VOCAB_TOKENS", kt: "AI_VOCAB_TOKENS" },
  { js: "CHANGELOG_STRONG", kt: "CHANGELOG_STRONG" },
  { js: "CHANGELOG_WEAK", kt: "CHANGELOG_WEAK" },
  { js: "CITATION_ARXIV", kt: "CITATION_ARXIV" },
  { js: "CITATION_AUTHOR_YEAR", kt: "CITATION_AUTHOR_YEAR" },
  { js: "CROSS_FILE_REF", kt: "CROSS_FILE_REF" },
  { js: "DIVIDER_CHARS", kt: "DIVIDER" },
  { js: "GEN_HEADER_LAX[0]", kt: "GEN_HEADER_LAX[0]" },
  { js: "GEN_HEADER_LAX[1]", kt: "GEN_HEADER_LAX[1]" },
  { js: "GEN_HEADER_STRICT", kt: "GEN_HEADER_STRICT" },
  { js: "GEN_NAME_SAFE", kt: "GEN_NAME_SAFE" },
  { js: "ISSUE_LINK", kt: "ISSUE_LINK" },
  { js: "LONG_LINK", kt: "LONG_LINK" },
  { js: "MARKDOWN_BOLD", kt: "MARKDOWN_BOLD" },
  { js: "MARKDOWN_LIST", kt: "MARKDOWN_LIST" },
  { js: "MARKDOWN_TABLE", kt: "MARKDOWN_TABLE" },
  { js: "OBVIOUS_WHY", kt: "OBVIOUS_WHY" },
  { js: "STEP_NUMBERED", kt: "STEP_NUMBERED" },
  { js: "THIS_OPENER", kt: "THIS_OPENER" },
  { js: "TICKET_REF", kt: "TICKET_REF" },
  { js: "TODO_WORD", kt: "TODO_WORD" },
  { js: "WHY_MARKERS", kt: "WHY_MARKERS" },
]

const JS_ONLY = [
  { name: "ADVISORY_REF", reason: "vend/ticket-ref is config-gated and not ported" },
  { name: "BLOCK_OPENER", reason: "JS line-classifier internals; the port classifies comments via PSI" },
  { name: "COMMENT_LEAD_FIX", reason: "--fix is not ported" },
  { name: "GO_DECL_NAME", reason: "go doc-comment profile is not ported; the port is .kt-only" },
  { name: "LICENSE_HEAD", reason: "the port keeps licenseHead in SlopComments.kt, outside SlopMarkers.kt" },
  { name: "OBVIOUS_WORD_SPLIT", reason: "the port splits words via its own private Regex in SlopMarkers.kt" },
  { name: "STEP_PREFIX_FIX", reason: "--fix is not ported" },
  { name: "STEP_WORD", reason: "evidence label for step-word vs bare-number; the port reports no evidence labels" },
  { name: "SUPPRESS_ANY", reason: "the port matches all three directives with one DIRECTIVE_HEAD Regex" },
  { name: "SUPPRESS_FILE", reason: "the port matches all three directives with one DIRECTIVE_HEAD Regex" },
  { name: "SUPPRESS_LINE", reason: "the port matches all three directives with one DIRECTIVE_HEAD Regex" },
  { name: "SUPPRESS_NEXT", reason: "the port matches all three directives with one DIRECTIVE_HEAD Regex" },
]

const KT_ONLY = [
  { name: "CAMEL", reason: "private camelSplit helper; js keeps the regex inline in camelSplit" },
  { name: "CJK_ANY", reason: "js builds it as new RegExp(CJK) from the CJK const; the port inlines the class literal" },
  { name: "HAS_LETTER", reason: "private word filter; js keeps the regex inline in commentContentWords" },
]

function scanJsRegexLiteral(text, start) {
  let i = start + 1
  let inClass = false
  while (i < text.length) {
    const c = text[i]
    if (c === "\\") {
      i += 2
      continue
    }
    if (inClass) {
      if (c === "]") inClass = false
    } else if (c === "[") {
      inClass = true
    } else if (c === "/") {
      const flags = /^[a-z]*/.exec(text.slice(i + 1))[0]
      return { source: text.slice(start + 1, i), end: i + 1 + flags.length }
    }
    i++
  }
  return null
}

const sortedRecord = (map) => {
  const out = {}
  for (const key of [...map.keys()].sort()) out[key] = map.get(key)
  return out
}

export function extractJsMarkers(source) {
  const out = new Map()
  const lines = source.replaceAll("\r\n", "\n").split("\n")
  for (let i = 0; i < lines.length; i++) {
    const m = /^export const (\w+) =\s*(.*)$/.exec(lines[i])
    if (m === null) continue
    const value = m[2] === "" ? (lines[i + 1] ?? "").trim() : m[2].trim()
    if (value.startsWith("/")) {
      const re = scanJsRegexLiteral(value, 0)
      if (re !== null && re.end === value.length) out.set(m[1], re.source)
    } else if (value.startsWith("[")) {
      let pos = 1
      let idx = 0
      while (pos < value.length) {
        while (pos < value.length && /[\s,]/.test(value[pos])) pos++
        if (value[pos] !== "/") break
        const re = scanJsRegexLiteral(value, pos)
        if (re === null) break
        out.set(`${m[1]}[${idx}]`, re.source)
        idx++
        pos = re.end
      }
    }
  }
  return sortedRecord(out)
}

function scanKtRawString(text, openIdx) {
  const close = text.indexOf('"""', openIdx + 3)
  if (close === -1) return null
  return { source: text.slice(openIdx + 3, close), end: close + 3 }
}

function rawStringArgIndex(text, callParenIdx) {
  let i = callParenIdx + 1
  while (i < text.length && /\s/.test(text[i])) i++
  return text.startsWith('"""', i) ? i : -1
}

function balancedBody(text, openParenIdx) {
  let depth = 1
  let i = openParenIdx + 1
  while (i < text.length) {
    if (text.startsWith('"""', i)) {
      const close = text.indexOf('"""', i + 3)
      if (close === -1) return null
      i = close + 3
      continue
    }
    const c = text[i]
    if (c === "(") depth++
    else if (c === ")") {
      depth--
      if (depth === 0) return text.slice(openParenIdx + 1, i)
    }
    i++
  }
  return null
}

// ${D} is the raw-string escape for a literal $ in SlopMarkers.kt
const normalizeKtSource = (source) => source.replaceAll("${D}", "$")

export function extractKtMarkers(source) {
  const text = source.replaceAll("\r\n", "\n")
  const out = new Map()
  for (const m of text.matchAll(/val\s+(\w+)\s*=\s*Pat\.of\(/g)) {
    const litIdx = rawStringArgIndex(text, m.index + m[0].length - 1)
    if (litIdx === -1) continue
    const raw = scanKtRawString(text, litIdx)
    if (raw !== null) out.set(m[1], normalizeKtSource(raw.source))
  }
  for (const m of text.matchAll(/val\s+(\w+)\s*=\s*listOf\(/g)) {
    const body = balancedBody(text, m.index + m[0].length - 1)
    if (body === null) continue
    let idx = 0
    for (const p of body.matchAll(/Pat\.of\(/g)) {
      const litIdx = rawStringArgIndex(body, p.index + p[0].length - 1)
      if (litIdx === -1) continue
      const raw = scanKtRawString(body, litIdx)
      if (raw !== null) out.set(`${m[1]}[${idx}]`, normalizeKtSource(raw.source))
      idx++
    }
  }
  return sortedRecord(out)
}

export function buildManifest() {
  const js = extractJsMarkers(readFileSync(MARKERS_PATH, "utf8"))
  const kt = extractKtMarkers(readFileSync(KT_MARKERS_PATH, "utf8"))
  const jsNames = new Set(Object.keys(js))
  const ktNames = new Set(Object.keys(kt))
  const jsMapped = new Set(MARKER_MAP.map((e) => e.js))
  const ktMapped = new Set(MARKER_MAP.map((e) => e.kt))
  const jsOnly = new Set(JS_ONLY.map((e) => e.name))
  const ktOnly = new Set(KT_ONLY.map((e) => e.name))
  const problems = []
  for (const e of MARKER_MAP) {
    if (!jsNames.has(e.js)) problems.push(`mapped js marker missing in markers.mjs: ${e.js}`)
    if (!ktNames.has(e.kt)) problems.push(`mapped kt marker missing in SlopMarkers.kt: ${e.kt}`)
  }
  for (const name of jsNames) {
    if (!jsMapped.has(name) && !jsOnly.has(name)) problems.push(`unmapped js marker (add a MARKER_MAP entry or a JS_ONLY exemption): ${name}`)
  }
  for (const name of ktNames) {
    if (!ktMapped.has(name) && !ktOnly.has(name)) problems.push(`unmapped kt marker (add a MARKER_MAP entry or a KT_ONLY exemption): ${name}`)
  }
  for (const e of JS_ONLY) {
    if (!jsNames.has(e.name)) problems.push(`stale JS_ONLY exemption (name not extracted from markers.mjs): ${e.name}`)
  }
  for (const e of KT_ONLY) {
    if (!ktNames.has(e.name)) problems.push(`stale KT_ONLY exemption (name not extracted from SlopMarkers.kt): ${e.name}`)
  }
  if (problems.length > 0) throw new Error(`marker-manifest: ${problems.join("; ")}`)
  return { js, kt }
}

function serialize(manifest) {
  return JSON.stringify(manifest, null, 2) + "\n"
}

function reportDelta(current, next) {
  const a = current.split("\n")
  const b = next.split("\n")
  const total = Math.max(a.length, b.length)
  let shown = 0
  for (let i = 0; i < total && shown < 20; i++) {
    if (a[i] !== b[i]) {
      console.error(`line ${i + 1}:`)
      console.error(`  - ${a[i] ?? ""}`)
      console.error(`  + ${b[i] ?? ""}`)
      shown++
    }
  }
  if (total - shown > 0 && a.length !== b.length) console.error(`… ${Math.abs(a.length - b.length)} line(s) difference in length`)
}

function main(argv) {
  let next
  try {
    next = serialize(buildManifest())
  } catch (error) {
    console.error(String(error.message ?? error))
    return 2
  }
  const mode = argv[0]
  if (mode === "--write") {
    writeFileSync(MANIFEST_PATH, next)
    console.log(`marker-manifest: written ${MANIFEST_PATH}`)
    return 0
  }
  if (mode === "--check") {
    const current = existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, "utf8") : ""
    if (current === next) {
      console.log("marker-manifest: in sync")
      return 0
    }
    console.error("marker-manifest: out of sync with markers.mjs / SlopMarkers.kt")
    reportDelta(current, next)
    return 1
  }
  console.error("usage: gen-marker-manifest.mjs (--write | --check)")
  return 2
}

// Node realpaths the main module before import.meta.url; argv[1] keeps the symlink, so compare realpaths
const isMain = (() => {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    try {
      return process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
    } catch {
      return false
    }
  }
})()
if (isMain) process.exit(main(process.argv.slice(2)))
