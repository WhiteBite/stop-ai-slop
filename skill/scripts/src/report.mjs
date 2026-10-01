import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { RULES, RULE_BY_ID } from "./rules.mjs"
import { T, rt } from "./i18n.mjs"

export function sortedFindings(findings) {
  return [...findings].sort((a, b) => (a.rel === b.rel ? a.lineNo - b.lineNo : a.rel < b.rel ? -1 : 1))
}
export let toolVersionCache = null
export function toolVersion() {
  if (toolVersionCache === null) {
    try {
      toolVersionCache = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "package.json"), "utf8")).version
    } catch {
      toolVersionCache = "0.0.0"
    }
  }
  return toolVersionCache
}
export function toRdjson(findings) {
  const sorted = sortedFindings(findings)
  const out = {
    source: { name: "stop-ai-slop", url: "https://github.com/WhiteBite/stop-ai-slop" },
    diagnostics: sorted.map((f) => ({
      message: RULE_BY_ID.get(f.rule).message,
      location: { path: f.rel, range: { start: { line: f.lineNo } } },
      code: { value: f.rule },
      ruleId: f.rule,
      severity: f.severity === "error" ? "ERROR" : "WARNING",
    })),
  }
  if (sorted.length > 0) out.severity = sorted.some((f) => f.severity === "error") ? "ERROR" : "WARNING"
  return JSON.stringify(out)
}

export function toSarif(findings) {
  return JSON.stringify(
    {
      $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "stop-ai-slop",
              version: toolVersion(),
              informationUri: "https://github.com/WhiteBite/stop-ai-slop",
              rules: RULES.map((r) => ({
                id: r.id,
                shortDescription: { text: r.message },
                defaultConfiguration: { level: r.severity },
              })),
            },
          },
          results: sortedFindings(findings).map((f) => ({
            ruleId: f.rule,
            level: f.severity,
            message: { text: RULE_BY_ID.get(f.rule).message },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: f.rel, uriBaseId: "SRCROOT" },
                  region: { startLine: f.lineNo },
                },
              },
            ],
          })),
        },
      ],
    },
    null,
    2,
  )
}
export function findingsToText(findings, strict = false) {
  const lines = []
  for (const f of sortedFindings(findings)) {
    lines.push(`${f.rel}:${f.lineNo} ${f.rule} [${f.severity}] ${rt(f.rule, "message")}`)
    lines.push(`  instead: ${rt(f.rule, "instead")}`)
  }
  const errors = findings.filter((f) => f.severity === "error").length
  if (findings.length === 0) lines.push(T("clean"))
  else if (strict && errors === 0) lines.push(T("findingsStrict", findings.length))
  else lines.push(T("findingsCount", findings.length, errors))
  return lines.join("\n")
}

export function printFindings(findings, format = "text", strict = false) {
  if (format === "json") {
    console.log(toRdjson(findings))
    return
  }
  if (format === "sarif") {
    console.log(toSarif(findings))
    return
  }
  console.log(findingsToText(findings, strict))
}
export function failsGate(findings, strict) {
  return strict ? findings.length > 0 : findings.some((f) => f.severity === "error")
}
export function explainText(ruleId) {
  const rule = RULE_BY_ID.get(ruleId)
  if (rule === undefined) return null
  return [
    `${rt(ruleId, "id") ?? rule.id} [${rule.severity}]`,
    `Message: ${rt(ruleId, "message")}`,
    `Why: ${rt(ruleId, "why")}`,
    `Instead of: ${rt(ruleId, "instead")}`,
    `Write: ${rt(ruleId, "write")}`,
    `Ignore it when: ${rt(ruleId, "ignoreWhen")}`,
  ].join("\n")
}

export function cmdExplain(ruleId) {
  const text = explainText(ruleId)
  if (text === null) {
    console.error(T("unknownRule", ruleId, RULES.map((r) => r.id).join(", ")))
    return 2
  }
  console.log(text)
  return 0
}
