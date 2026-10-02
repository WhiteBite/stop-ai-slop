import { RULES, RULE_BY_ID } from "./rules.mjs"
import { T, rt } from "./i18n.mjs"
import { packageVersion } from "./version.mjs"

export function sortedFindings(findings) {
  return [...findings].sort((a, b) => (a.rel === b.rel ? a.lineNo - b.lineNo : a.rel < b.rel ? -1 : 1))
}
const withReason = (msg, f) => (f.reason === undefined ? msg : `${msg} (${f.reason})`)
export function toolVersion() {
  try {
    return packageVersion()
  } catch {
    return "0.0.0"
  }
}
export function toRdjson(findings) {
  const sorted = sortedFindings(findings)
  const out = {
    source: { name: "stop-ai-slop", url: "https://github.com/WhiteBite/stop-ai-slop" },
    diagnostics: sorted.map((f) => ({
      message: withReason(RULE_BY_ID.get(f.rule).message, f),
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
            message: { text: withReason(RULE_BY_ID.get(f.rule).message, f) },
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
    lines.push(`${f.rel}:${f.lineNo} ${f.rule} [${f.severity}] ${withReason(rt(f.rule, "message"), f)}`)
    lines.push(`  instead: ${rt(f.rule, "instead")}`)
  }
  const errors = findings.filter((f) => f.severity === "error").length
  if (findings.length === 0) lines.push(T("clean"))
  else if (strict && errors === 0) lines.push(T("findingsStrict", findings.length))
  else lines.push(T("findingsCount", findings.length, errors))
  return lines.join("\n")
}

export function escapeAnnotationMessage(msg) {
  return msg.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A").replaceAll(":", "%3A")
}

export function annotationsToText(findings) {
  const lines = []
  for (const f of sortedFindings(findings)) {
    const level = f.severity === "error" ? "error" : "warning"
    lines.push(`::${level} file=${f.rel},line=${f.lineNo}::${escapeAnnotationMessage(`${f.rule} ${withReason(rt(f.rule, "message"), f)}`)}`)
  }
  return lines.join("\n")
}

export function printFindings(findings, format = "text", strict = false, annotations = false) {
  if (format === "json") {
    console.log(toRdjson(findings))
    return
  }
  if (format === "sarif") {
    console.log(toSarif(findings))
    return
  }
  if (annotations && findings.length > 0) console.log(annotationsToText(findings))
  console.log(findingsToText(findings, strict))
}
export function failsGate(findings, strict) {
  return strict ? findings.length > 0 : findings.some((f) => f.severity === "error")
}
export function resolveRuleId(ruleId) {
  if (RULE_BY_ID.has(ruleId)) return ruleId
  const prefixed = `vend/${ruleId}`
  return RULE_BY_ID.has(prefixed) ? prefixed : null
}
export function explainText(ruleId) {
  const id = resolveRuleId(ruleId)
  if (id === null) return null
  const rule = RULE_BY_ID.get(id)
  return [
    `${rt(id, "id") ?? rule.id} [${rule.severity}]`,
    `Message: ${rt(id, "message")}`,
    `Why: ${rt(id, "why")}`,
    `Instead of: ${rt(id, "instead")}`,
    `Write: ${rt(id, "write")}`,
    `Ignore it when: ${rt(id, "ignoreWhen")}`,
  ].join("\n")
}

export function cmdPolicy() {
  const lines = [T("gatePolicy")]
  for (const r of RULES) lines.push(`${r.id} [${r.severity}] ${rt(r.id, "message")}`)
  console.log(lines.join("\n"))
  return 0
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
