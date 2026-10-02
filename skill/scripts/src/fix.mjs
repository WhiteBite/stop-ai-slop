import { writeFileSync } from "node:fs"
import { SECURITY_RULES, FIXABLE_RULES } from "./rules.mjs"
import { toRel } from "./paths.mjs"
import { PROFILES, inlineMarkerAt, isCommentLine, profileFor, stripCommentMarker } from "./profiles.mjs"
import { detectCommentSlop } from "./detect.mjs"
import { genContext, isGeneratedFile } from "./generated.mjs"
import { BLOCK_OPENER, COMMENT_LEAD_FIX, STEP_PREFIX_FIX, SUPPRESS_ANY, SUPPRESS_NEXT, stripBadInvisibles } from "./markers.mjs"
import { applyRuleConfig, configOptions, loadConfig } from "./config.mjs"
import { collectFiles, gitToplevel, readScannable } from "./git.mjs"
import { loadBaseline, maskBaselined } from "./baseline.mjs"
import { failsGate, printFindings } from "./report.mjs"
import { T } from "./i18n.mjs"

export function planFixes(lines, findings, profile) {
  const removed = new Set()
  const replaced = new Map()
  for (const f of findings) {
    if (!FIXABLE_RULES.has(f.rule)) continue
    const i = f.lineNo - 1
    const raw = lines[i] ?? ""
    if (SUPPRESS_ANY.test(raw)) continue
    if (f.rule === "multi-line-comment" || f.rule === "vend/file-summary-header") {
      for (let k = 0; k < f.lines.length; k++) {
        const ln = f.lineNo + k
        if (!SUPPRESS_ANY.test(lines[ln - 1] ?? "")) removed.add(ln)
      }
    } else if (f.rule === "changelog-marker" || f.rule === "vend/section-divider" || f.rule === "vend/cross-file-ref" || f.rule === "vend/obvious-comment") {
      const trimmed = raw.trim()
      if (BLOCK_OPENER.test(trimmed)) continue
      const inline = isCommentLine(trimmed, profile) ? null : inlineMarkerAt(raw, profile)
      if (inline !== null) replaced.set(f.lineNo, raw.slice(0, inline.idx).trimEnd())
      else removed.add(f.lineNo)
    } else if (f.rule === "vend/step-numbered") {
      if (isCommentLine(raw.trim(), profile)) {
        const stripped = stripCommentMarker(raw.trim())
        const m = STEP_PREFIX_FIX.exec(stripped)
        if (m === null) continue
        const rest = stripped.slice(m[0].length).trim()
        const lead = COMMENT_LEAD_FIX.exec(raw)
        if (rest === "") removed.add(f.lineNo)
        else if (lead !== null) replaced.set(f.lineNo, lead[0] + rest)
        continue
      }
      const inline = inlineMarkerAt(raw, profile)
      if (inline === null) continue
      const trimmedComment = raw.slice(inline.idx).trim()
      const stripped = stripCommentMarker(trimmedComment)
      const m = STEP_PREFIX_FIX.exec(stripped)
      if (m === null) continue
      const rest = stripped.slice(m[0].length).trim()
      const lead = raw.slice(0, inline.idx).trimEnd()
      if (rest === "") replaced.set(f.lineNo, lead)
      else {
        const marker = trimmedComment.slice(0, trimmedComment.indexOf(stripped)).trimEnd()
        replaced.set(f.lineNo, lead + " " + marker + " " + rest)
      }
    } else if (f.rule === "vend/zero-width-chars" || f.rule === "vend/bidi-controls") {
      const commentStart = isCommentLine(raw, profile) ? 0 : (inlineMarkerAt(raw, profile)?.idx ?? raw.length)
      const cleaned = stripBadInvisibles(raw, i, commentStart)
      if (cleaned !== raw) replaced.set(f.lineNo, cleaned)
    }
  }
  // a next-line directive whose target is being deleted would dangle
  for (const k of [...removed]) {
    if (!removed.has(k - 1) && SUPPRESS_NEXT.test(lines[k - 2] ?? "")) removed.add(k - 1)
  }
  return { removed, replaced }
}
export function applyPlan(lines, { removed, replaced }) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1
    if (removed.has(ln)) continue
    out.push(replaced.get(ln) ?? lines[i])
  }
  return out
}
export function renderFixDiff(rel, lines, { removed, replaced }, context = 2) {
  const entries = []
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1
    if (removed.has(ln)) entries.push({ kind: "del", text: lines[i] })
    else if (replaced.has(ln) && replaced.get(ln) !== lines[i]) entries.push({ kind: "rep", text: lines[i], newText: replaced.get(ln) })
    else entries.push({ kind: "keep", text: lines[i] })
  }
  const changed = []
  entries.forEach((e, idx) => {
    if (e.kind !== "keep") changed.push(idx)
  })
  if (changed.length === 0) return ""
  const groups = []
  let cur = [changed[0]]
  for (let k = 1; k < changed.length; k++) {
    if (changed[k] - changed[k - 1] <= context * 2 + 1) cur.push(changed[k])
    else {
      groups.push(cur)
      cur = [changed[k]]
    }
  }
  groups.push(cur)
  const out = [`--- a/${rel}`, `+++ b/${rel}`]
  for (const g of groups) {
    const start = Math.max(0, g[0] - context)
    const end = Math.min(entries.length - 1, g[g.length - 1] + context)
    let oldCount = 0
    let newCount = 0
    const body = []
    for (let i = start; i <= end; i++) {
      const e = entries[i]
      if (e.kind === "keep") {
        body.push(" " + e.text)
        oldCount++
        newCount++
      } else if (e.kind === "del") {
        body.push("-" + e.text)
        oldCount++
      } else {
        body.push("-" + e.text)
        body.push("+" + e.newText)
        oldCount++
        newCount++
      }
    }
    let newStart = 1
    for (let i = 0; i < start; i++) if (entries[i].kind !== "del") newStart++
    out.push(`@@ -${start + 1},${oldCount} +${newStart},${newCount} @@`, ...body)
  }
  return out.join("\n")
}
export function cmdFix(paths, { dryRun = false, strict = false } = {}) {
  const root = gitToplevel(process.cwd())
  let config
  try {
    config = loadConfig(root)
  } catch (error) {
    console.error(error.message)
    return 2
  }
  let files
  try {
    files = collectFiles(paths, root, config?.excludePaths ?? [])
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }
  const options = configOptions(config)
  const genCtx = genContext(root, config)
  const remaining = []
  let fixedOps = 0
  let fixedFiles = 0
  const previews = []
  for (const file of files) {
    const text = readScannable(file)
    if (text === null) continue
    const eol = text.includes("\r\n") ? "\r\n" : "\n"
    const lines = text.replaceAll("\r\n", "\n").split("\n")
    const profile = profileFor(file) ?? PROFILES.legacy
    const rel = toRel(root, file)
    const generated = isGeneratedFile(rel, text, genCtx)
    const visible = applyRuleConfig(
      detectCommentSlop(lines, profile, false, null, options).map((v) => ({ rel, ...v })),
      config,
    )
    const findings = generated ? visible.filter((f) => SECURITY_RULES.has(f.rule)) : visible
    if (findings.length === 0) continue
    const plan = planFixes(lines, findings, profile)
    const ops = plan.removed.size + [...plan.replaced].filter(([ln, v]) => v !== lines[ln - 1]).length
    if (ops === 0) {
      for (const f of findings) remaining.push({ rel, ...f })
      continue
    }
    const newLines = applyPlan(lines, plan)
    if (dryRun) previews.push(renderFixDiff(rel, lines, plan))
    else writeFileSync(file, newLines.join(eol))
    fixedOps += ops
    fixedFiles++
    const rest = applyRuleConfig(
      detectCommentSlop(newLines, profile, false, null, options).map((v) => ({ rel, ...v })),
      config,
    )
    for (const f of generated ? rest.filter((f) => SECURITY_RULES.has(f.rule)) : rest) {
      remaining.push({ rel, ...f })
    }
  }
  if (dryRun) {
    for (const d of previews) console.log(d)
    console.log(T("fixDryRun", fixedOps, fixedFiles, remaining.length))
    return 0
  }
  const baseline = loadBaseline(root)
  const fresh = maskBaselined(baseline, remaining)
  printFindings(fresh, "text", strict)
  console.log(T("fixApplied", fixedOps, fixedFiles))
  return failsGate(fresh, strict) ? 1 : 0
}
