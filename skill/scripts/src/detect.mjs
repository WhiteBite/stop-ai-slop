import { RULE_BY_ID } from "./rules.mjs"
import {
  AI_PLAN_ACK,
  AI_PLAN_REFERENCE,
  AI_VOCAB_TOKENS,
  ADVISORY_REF,
  BIDI,
  BIDI_MARK,
  CHANGELOG_STRONG,
  CJK_ADJACENT,
  GO_DECL_NAME,
  ISSUE_LINK,
  LONG_LINK,
  MARKDOWN_BOLD,
  MARKDOWN_LIST,
  MARKDOWN_TABLE,
  STEP_NUMBERED,
  STEP_WORD,
  STRIP_INVISIBLE,
  THIS_OPENER,
  TICKET_REF,
  TODO_WORD,
  WHY_MARKERS,
  directiveHead,
  isCrossFileRef,
  isLicenseRun,
  isObviousComment,
  isResearchCitation,
  rulesOfTail,
  weakMarkerHits,
  zeroWidthHit,
} from "./markers.mjs"
import {
  MAX_COMMENT_LENGTH,
  PROFILES,
  PROSE_PROFILES,
  SKIPPED_SEGMENTS,
  dividerReason,
  inlineComment,
  inlineMarkerAt,
  isCommentLine,
  profileFor,
  stripCommentMarker,
} from "./profiles.mjs"

// hand-written files carry a few terse comments; generated ones narrate every few lines
const OBVIOUS_DENSITY = 0.02
const AI_VOCAB_MIN = 3
const YAML_LITERAL_KEY = /^( *)(?!#)(?:- )?.*?:\s*[|>][+-]?\d*\s*(?:#.*)?$/
const YAML_LITERAL_SEQ = /^( *)-\s*[|>][+-]?\d*\s*(?:#.*)?$/

export function finding(id, lineNo, lines, reason) {
  const v = { rule: id, lineNo, lines, severity: RULE_BY_ID.get(id).severity }
  if (reason !== undefined) v.reason = reason
  return v
}
const makeClassify = (profile) => {
  let blockClose = null
  let docClose = null
  let literalIndent = null
  return (line) => {
    const t = line.trim()
    if (profile.blockScalars === true) {
      if (literalIndent !== null) {
        if (t === "") return { comment: false, doc: false, literal: true }
        if (line.length - line.trimStart().length > literalIndent) return { comment: false, doc: false, literal: true }
        literalIndent = null
      }
      const key = YAML_LITERAL_KEY.exec(line) ?? YAML_LITERAL_SEQ.exec(line)
      if (key !== null) literalIndent = key[1].length
    }
    if (docClose !== null) {
      if (t.includes(docClose)) docClose = null
      return { comment: false, doc: true }
    }
    if (blockClose !== null) {
      if (t.includes(blockClose)) blockClose = null
      return { comment: true, doc: false }
    }
    for (const d of profile.doc) {
      const m = t.match(d.openRe)
      if (m !== null) {
        if (!t.slice(m[0].length).includes(d.close)) docClose = d.close
        return { comment: false, doc: true }
      }
    }
    for (const [open, close] of profile.blocks) {
      if (t.startsWith(open) && !t.slice(open.length).includes(close)) {
        blockClose = close
        return { comment: true, doc: false }
      }
    }
    return { comment: isCommentLine(line, profile), doc: false }
  }
}
// honored only as the first token after a real comment marker; docstring/block-scalar are not comments
const directiveOf = (line, profile, cls) => {
  if (cls === null || cls === undefined || cls.doc || cls.literal === true) return null
  let body = null
  if (isCommentLine(line, profile)) body = stripCommentMarker(line.trim())
  else {
    const m = inlineMarkerAt(line, profile)
    if (m !== null) body = line.slice(m.idx + m.marker.length)
  }
  return body === null ? null : directiveHead(body)
}
export function fileSuppressIds(lines, profile = PROFILES.legacy) {
  const classify = makeClassify(profile)
  const clss = lines.map((l) => classify(l ?? ""))
  let scoped = null
  for (let i = 0; i < lines.length; i++) {
    const d = directiveOf(lines[i] ?? "", profile, clss[i])
    if (d === null || d.kind !== "file") continue
    const ids = rulesOfTail(d.tail)
    if (ids === null) return null
    scoped = scoped === null ? new Set(ids) : new Set([...scoped, ...ids])
  }
  return scoped
}
export function collectSuppressions(lines, clss, profile = PROFILES.legacy, diffMode = false) {
  const perLine = new Map()
  let fileAll = false
  let fileScoped = null
  const selfSuppress = []
  for (let i = 0; i < lines.length; i++) {
    const d = directiveOf(lines[i] ?? "", profile, clss[i])
    if (d === null) continue
    const ids = rulesOfTail(d.tail)
    if (diffMode && ids === null) {
      selfSuppress.push(i + 1)
      continue
    }
    if (d.kind === "file") {
      if (ids === null) fileAll = true
      else fileScoped = fileScoped === null ? new Set(ids) : new Set([...fileScoped, ...ids])
    } else {
      perLine.set(d.kind === "next" ? i + 2 : i + 1, ids)
    }
  }
  return { fileAll, fileScoped, perLine, selfSuppress }
}
export function detectCommentSlop(addedLines, profile = PROFILES.legacy, diffMode = false, fileSuppress = null, options = null) {
  const maxCommentLength = options?.maxLength ?? MAX_COMMENT_LENGTH
  const ticketRe = typeof options?.ticketPattern === "string" && options.ticketPattern !== "" ? new RegExp(options.ticketPattern) : null
  const rawLines = addedLines.map((l) => l ?? "")
  const lines = rawLines.map((l) => l.replace(STRIP_INVISIBLE, ""))
  const classify = makeClassify(profile)
  const clss = lines.map((l) => classify(l))
  const suppress = collectSuppressions(lines, clss, profile, diffMode)
  const violations = []
  const obvious = []
  let codeLines = 0
  const aiVocab = new Set()
  let aiVocabLine = -1
  const aiVocabHit = (text, i) => {
    for (const m of text.matchAll(AI_VOCAB_TOKENS)) {
      if (aiVocabLine === -1) aiVocabLine = i + 1
      aiVocab.add(m[0].toLowerCase())
    }
  }
  const push = (v) => {
    if (suppress.fileAll) return
    if (fileSuppress !== null && fileSuppress.has(v.rule)) return
    if (suppress.fileScoped !== null && suppress.fileScoped.has(v.rule)) return
    const s = suppress.perLine.get(v.lineNo)
    if (s === null || (s !== undefined && s.has(v.rule))) return
    violations.push(v)
  }
  for (const ln of suppress.selfSuppress) violations.push(finding("vend/self-suppression", ln, [lines[ln - 1] ?? ""]))
  if (suppress.fileAll) return violations
  const proseCjk = PROSE_PROFILES.has(profile)
  const testLine = (raw, i, doc) => {
    const t = raw.trim()
    if (CHANGELOG_STRONG.test(raw)) push(finding("changelog-marker", i + 1, [raw], "strong-marker"))
    const stripped = stripCommentMarker(t)
    if (!doc && raw.length > maxCommentLength && !LONG_LINK.test(raw) && !WHY_MARKERS.test(stripped)) {
      push(finding("long-comment", i + 1, [raw]))
    }
    if (!doc && STEP_NUMBERED.test(stripped)) {
      push(finding("vend/step-numbered", i + 1, [raw], STEP_WORD.test(stripped) ? "step-word" : "bare-number"))
    }
    const divider = dividerReason(t)
    if (divider !== null) push(finding("vend/section-divider", i + 1, [raw], divider))
    if (!doc && (MARKDOWN_BOLD.test(stripped) || MARKDOWN_LIST.test(stripped) || MARKDOWN_TABLE.test(stripped))) {
      push(finding("vend/markdown-in-comment", i + 1, [raw], MARKDOWN_BOLD.test(stripped) ? "bold" : MARKDOWN_LIST.test(stripped) ? "list" : "table"))
    }
    if (THIS_OPENER.test(stripped)) push(finding("vend/this-function-opener", i + 1, [raw]))
    const planReference = AI_PLAN_REFERENCE.test(stripped)
    if ((planReference || AI_PLAN_ACK.test(stripped)) && !(TODO_WORD.test(stripped) && (TICKET_REF.test(t) || ISSUE_LINK.test(t)))) {
      push(finding("vend/ai-plan-narration", i + 1, [raw], planReference ? "plan-reference" : "instruction-ack"))
    }
    if (TODO_WORD.test(stripped) && !TICKET_REF.test(t) && !ISSUE_LINK.test(t)) push(finding("vend/generic-todo", i + 1, [raw]))
    if (ticketRe !== null && !doc && ticketRe.test(stripped) && !TODO_WORD.test(stripped) && !ISSUE_LINK.test(t) && !ADVISORY_REF.test(t)) {
      push(finding("vend/ticket-ref", i + 1, [raw]))
    }
    if (!doc && isCrossFileRef(stripped)) push(finding("vend/cross-file-ref", i + 1, [raw]))
    if (!doc && isResearchCitation(stripped)) push(finding("vend/research-citation", i + 1, [raw]))
    return weakMarkerHits(raw)
  }
  const goDocRun = (runLines, nextLine) => {
    if (profile.goDoc !== true) return false
    const m = GO_DECL_NAME.exec(nextLine ?? "")
    if (m === null) return false
    if (!runLines.every((l) => l.trim().startsWith("//"))) return false
    return (stripCommentMarker(runLines[0].trim()).split(/\s+/)[0] ?? "") === m[1]
  }
  let runStart = -1
  const wrappedWhy = (runLines) => {
    if (runLines.length !== 2) return false
    const text = runLines.map((l) => stripCommentMarker(l.trim())).join(" ")
    return text.length <= maxCommentLength && WHY_MARKERS.test(text)
  }
  for (let i = 0; i <= lines.length; i++) {
    const cls = i < lines.length ? clss[i] : null
    const inRun = cls !== null && cls.comment && !(i === 0 && (lines[0] ?? "").startsWith("#!"))
    if (inRun && runStart === -1) runStart = i
    if (!inRun && runStart !== -1) {
      const runLines = lines.slice(runStart, i)
      if (i - runStart >= 2 && profile.noMultiLine !== true && !isLicenseRun(runLines) && !goDocRun(runLines, lines[i]) && !wrappedWhy(runLines)) {
        push(finding("multi-line-comment", runStart + 1, runLines))
      }
      runStart = -1
    }
  }
  let headerEnd = 0
  while (headerEnd < lines.length) {
    const line = lines[headerEnd] ?? ""
    if (!clss[headerEnd].comment || directiveOf(line, profile, clss[headerEnd]) !== null || (headerEnd === 0 && line.startsWith("#!"))) break
    headerEnd++
  }
  if (!diffMode && headerEnd >= 2 && profile.noSummaryHeader !== true && !isLicenseRun(lines.slice(0, headerEnd)) && !goDocRun(lines.slice(0, headerEnd), lines[headerEnd])) {
    push(finding("vend/file-summary-header", 1, lines.slice(0, headerEnd)))
  }
  let weakRun = 0
  let weakRunLine = -1
  const flushWeakRun = () => {
    if (weakRun >= 2) push(finding("changelog-marker", weakRunLine, [lines[weakRunLine - 1] ?? ""], "weak-marker-pair"))
    weakRun = 0
    weakRunLine = -1
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const cls = clss[i]
    const rawLine = rawLines[i] ?? ""
    if (!cls.comment && !cls.doc && line.trim() !== "") codeLines++
    if (rawLine !== "") {
      if (zeroWidthHit(rawLine, diffMode ? -1 : i)) push(finding("vend/zero-width-chars", i + 1, [rawLine]))
      if (BIDI.test(rawLine)) push(finding("vend/bidi-controls", i + 1, [rawLine]))
      if (!cls.comment && !cls.doc && cls.literal !== true && !proseCjk) {
        const m = inlineMarkerAt(rawLine, profile)
        const codePart = m === null ? rawLine : rawLine.slice(0, m.idx)
        if (BIDI_MARK.test(codePart)) push(finding("vend/bidi-controls", i + 1, [rawLine]))
        if (CJK_ADJACENT.test(codePart)) push(finding("vend/cjk-noise", i + 1, [rawLine]))
      }
    }
    if (cls.literal === true) continue
    if (directiveOf(line, profile, cls) !== null) continue
    if (cls.comment || cls.doc) {
      const weak = testLine(line, i, cls.doc)
      if (!cls.doc) aiVocabHit(line, i)
      if (weak > 0) {
        weakRun += weak
        if (weakRunLine === -1) weakRunLine = i + 1
      }
      if (cls.comment && !cls.doc && !proseCjk && !TODO_WORD.test(stripCommentMarker(line.trim()))) {
        let j = i + 1
        while (j < lines.length && (lines[j] ?? "").trim() === "") j++
        const prevCls = i > 0 ? clss[i - 1] : null
        const nextCls = j < lines.length ? clss[j] : null
        if (
          nextCls !== null &&
          !nextCls.comment &&
          !nextCls.doc &&
          nextCls.literal !== true &&
          (prevCls === null || (!prevCls.comment && !prevCls.doc)) &&
          isObviousComment(stripCommentMarker(line.trim()), lines[j] ?? "")
        ) {
          obvious.push(finding("vend/obvious-comment", i + 1, [line]))
        }
      }
    } else {
      flushWeakRun()
      const inline = inlineComment(line, profile)
      if (inline !== null && testLine(inline, i, false) >= 2) push(finding("changelog-marker", i + 1, [inline], "inline-weak-marker-pair"))
      if (inline !== null) aiVocabHit(inline, i)
    }
  }
  flushWeakRun()
  if (obvious.length > 0 && codeLines > 0 && obvious.length / codeLines >= OBVIOUS_DENSITY) {
    for (const v of obvious) push(v)
  }
  if (aiVocab.size >= AI_VOCAB_MIN) push(finding("vend/ai-vocab-density", aiVocabLine, [lines[aiVocabLine - 1] ?? ""]))
  return violations
}
export function multisetDiffLines(oldText, newText) {
  const remaining = new Map()
  for (const line of oldText.replaceAll("\r\n", "\n").split("\n")) {
    remaining.set(line, (remaining.get(line) ?? 0) + 1)
  }
  const added = []
  const lineNos = []
  const newLines = newText.replaceAll("\r\n", "\n").split("\n")
  for (let i = 0; i < newLines.length; i++) {
    const count = remaining.get(newLines[i]) ?? 0
    if (count > 0) remaining.set(newLines[i], count - 1)
    else {
      added.push(newLines[i])
      lineNos.push(i + 1)
    }
  }
  return { added, lineNos }
}
export function multisetDiff(oldText, newText) {
  return multisetDiffLines(oldText, newText).added
}
export function isCodePath(filePath, extraSkippedSegments = []) {
  const skipped = extraSkippedSegments.length === 0 ? SKIPPED_SEGMENTS : new Set([...SKIPPED_SEGMENTS, ...extraSkippedSegments])
  if (filePath.split(/[\\/]/).some((segment) => skipped.has(segment))) return false
  return profileFor(filePath) !== null
}

