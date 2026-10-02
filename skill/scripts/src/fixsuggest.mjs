import { resolve } from "node:path"
import { FIXABLE_RULES } from "./rules.mjs"
import { PROFILES, profileFor } from "./profiles.mjs"
import { planFixes } from "./fix.mjs"
import { readScannable } from "./git.mjs"

export function fixSuggestions(root, findings) {
  const byRel = new Map()
  for (const f of findings) {
    if (!FIXABLE_RULES.has(f.rule)) continue
    const list = byRel.get(f.rel)
    if (list === undefined) byRel.set(f.rel, [f])
    else list.push(f)
  }
  const out = []
  for (const [rel, fileFindings] of byRel) {
    const text = readScannable(resolve(root, rel))
    if (text === null) continue
    const lines = text.replaceAll("\r\n", "\n").split("\n")
    const plan = planFixes(lines, fileFindings, profileFor(rel) ?? PROFILES.legacy)
    for (const f of fileFindings) {
      if (f.lineNo < 1 || f.lineNo > lines.length) continue
      if (f.rule === "multi-line-comment" || f.rule === "vend/file-summary-header") {
        const run = []
        for (let k = 0; k < f.lines.length; k++) {
          const ln = f.lineNo + k
          if (ln > lines.length || !plan.removed.has(ln)) {
            run.length = 0
            break
          }
          run.push(lines[ln - 1])
        }
        if (run.length > 0) out.push({ file: rel, line: f.lineNo, rule: f.rule, kind: "delete-run", from: run.join("\n"), to: null })
      } else if (plan.removed.has(f.lineNo)) {
        out.push({ file: rel, line: f.lineNo, rule: f.rule, kind: "delete-line", from: lines[f.lineNo - 1], to: null })
      } else if (plan.replaced.has(f.lineNo) && plan.replaced.get(f.lineNo) !== lines[f.lineNo - 1]) {
        out.push({ file: rel, line: f.lineNo, rule: f.rule, kind: "replace-line", from: lines[f.lineNo - 1], to: plan.replaced.get(f.lineNo) })
      }
    }
  }
  return out.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1))
}

export function printFixSuggestions(root, findings, format = "text") {
  const line = `fix-suggestions: ${JSON.stringify(fixSuggestions(root, findings))}`
  if (format === "text") console.log(line)
  else process.stderr.write(line + "\n")
}
