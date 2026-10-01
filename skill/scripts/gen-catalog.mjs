#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { RULES } from "./scan.mjs"

const CATALOG_PATH = fileURLToPath(new URL("../../detekt-rules/rule-catalog.json", import.meta.url))

const KOTLIN_RULE = {
  "multi-line-comment": "StopAiSlopMultiLineComment",
  "changelog-marker": "StopAiSlopChangelogMarker",
  "long-comment": "StopAiSlopLongComment",
  "vend/step-numbered": "StopAiSlopStepNumbered",
  "vend/section-divider": "StopAiSlopSectionDivider",
  "vend/markdown-in-comment": "StopAiSlopMarkdownInComment",
  "vend/this-function-opener": "StopAiSlopThisFunctionOpener",
  "vend/file-summary-header": "StopAiSlopFileSummaryHeader",
  "vend/generic-todo": "StopAiSlopGenericTodo",
  "vend/cross-file-ref": "StopAiSlopCrossFileRef",
  "vend/obvious-comment": "StopAiSlopObviousComment",
  "vend/cjk-noise": "StopAiSlopCjkNoise",
  "vend/zero-width-chars": "StopAiSlopZeroWidthChars",
  "vend/bidi-controls": "StopAiSlopBidiControls",
}

const EXCLUDED = [
  {
    id: "vend/self-suppression",
    reason:
      "diff-mode-only: it needs the added-lines diff (a directive arriving in the same diff as the code it suppresses) and is meaningless in a whole-file PSI rule",
  },
]

function buildCatalog() {
  const excludedIds = new Set(EXCLUDED.map((e) => e.id))
  const unmapped = RULES.filter((r) => !(r.id in KOTLIN_RULE) && !excludedIds.has(r.id)).map((r) => r.id)
  if (unmapped.length > 0) {
    console.error(`catalog: unmapped rules (add a kotlinRule or an exclusion): ${unmapped.join(", ")}`)
    process.exit(2)
  }
  const rules = RULES.filter((r) => r.id in KOTLIN_RULE)
    .map((r) => ({ id: r.id, severity: r.severity, message: r.message, kotlinRule: KOTLIN_RULE[r.id] }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const excluded = EXCLUDED.map((e) => ({ id: e.id, reason: e.reason })).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  return { rules, excluded }
}

function serialize(catalog) {
  return JSON.stringify(catalog, null, 2) + "\n"
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
  const next = serialize(buildCatalog())
  const mode = argv[0]
  if (mode === "--write") {
    writeFileSync(CATALOG_PATH, next)
    console.log(`catalog: written ${CATALOG_PATH}`)
    return 0
  }
  if (mode === "--check") {
    const current = existsSync(CATALOG_PATH) ? readFileSync(CATALOG_PATH, "utf8") : ""
    if (current === next) {
      console.log("catalog: in sync")
      return 0
    }
    console.error("catalog: out of sync with RULES")
    reportDelta(current, next)
    return 1
  }
  console.error("usage: gen-catalog.mjs (--write | --check)")
  return 2
}

process.exit(main(process.argv.slice(2)))