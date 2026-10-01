import { readFileSync } from "node:fs"
import { RULE_BY_ID } from "./rules.mjs"
import {
  BIDI,
  BIDI_MARK,
  CHANGELOG_STRONG,
  CJK_ADJACENT,
  ISSUE_LINK,
  LONG_LINK,
  MARKDOWN_BOLD,
  MARKDOWN_LIST,
  MARKDOWN_TABLE,
  STEP_NUMBERED,
  STRIP_INVISIBLE,
  SUPPRESS_ANY,
  SUPPRESS_FILE,
  SUPPRESS_LINE,
  SUPPRESS_NEXT,
  THIS_OPENER,
  TICKET_REF,
  TODO_WORD,
  isCrossFileRef,
  isLicenseRun,
  isObviousComment,
  rulesOfTail,
  weakMarkerHits,
  zeroWidthHit,
} from "./markers.mjs"
import {
  MAX_COMMENT_LENGTH,
  PROFILES,
  PROSE_PROFILES,
  SKIPPED_SEGMENTS,
  inlineComment,
  inlineMarkerAt,
  isCommentLine,
  isDividerLine,
  profileFor,
  stripCommentMarker,
} from "./profiles.mjs"

export function finding(id, lineNo, lines) {
  return { rule: id, lineNo, lines, severity: RULE_BY_ID.get(id).severity }
}
export function fileSuppressIds(lines) {
  for (const raw of lines) {
    const m = SUPPRESS_FILE.exec(raw)
    if (m !== null) return rulesOfTail(m[1])
  }
  return null
}
export function collectSuppressions(lines, diffMode = false) {
  const perLine = new Map()
  let file = false
  const selfSuppress = []
  const rulesOf = rulesOfTail
  lines.forEach((raw, i) => {
    const next = SUPPRESS_NEXT.exec(raw)
    const same = next === null ? SUPPRESS_LINE.exec(raw) : null
    const isFile = SUPPRESS_FILE.test(raw)
    if (next === null && same === null && !isFile) return
    const ids = isFile ? rulesOfTail(SUPPRESS_FILE.exec(raw)[1]) : rulesOfTail((next ?? same)[1])
    if (diffMode && ids === null) {
      selfSuppress.push(i + 1)
      return
    }
    if (isFile) file = true
    else perLine.set(next !== null ? i + 2 : i + 1, ids)
  })
  return { file, perLine, selfSuppress }
}
export function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2))
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2))
  return buf.toString("utf8")
}
export function detectCommentSlop(addedLines, profile = PROFILES.legacy, diffMode = false, fileSuppress = null, options = null) {
  const maxCommentLength = options?.maxLength ?? MAX_COMMENT_LENGTH
  const rawLines = addedLines.map((l) => l ?? "")
  const lines = rawLines.map((l) => l.replace(STRIP_INVISIBLE, ""))
  const suppress = collectSuppressions(lines, diffMode)
  const YAML_LITERAL_KEY = /^( *)(?!#)(?:- )?.*?:\s*[|>][+-]?\d*\s*(?:#.*)?$/
  const YAML_LITERAL_SEQ = /^( *)-\s*[|>][+-]?\d*\s*(?:#.*)?$/
  const makeClassify = () => {
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
  const violations = []
  const push = (v) => {
    if (fileSuppress !== null && fileSuppress.has(v.rule)) return
    const s = suppress.perLine.get(v.lineNo)
    if (s === null || (s !== undefined && s.has(v.rule))) return
    violations.push(v)
  }
  for (const ln of suppress.selfSuppress) push(finding("vend/self-suppression", ln, [lines[ln - 1] ?? ""]))
  if (suppress.file) return violations
  const proseCjk = PROSE_PROFILES.has(profile)
  const testLine = (raw, i, doc) => {
    const t = raw.trim()
    if (CHANGELOG_STRONG.test(raw)) push(finding("changelog-marker", i + 1, [raw]))
    if (!doc && raw.length > maxCommentLength && !LONG_LINK.test(raw)) push(finding("long-comment", i + 1, [raw]))
    const stripped = stripCommentMarker(t)
    if (!doc && STEP_NUMBERED.test(stripped)) push(finding("vend/step-numbered", i + 1, [raw]))
    if (isDividerLine(t)) push(finding("vend/section-divider", i + 1, [raw]))
    if (!doc && (MARKDOWN_BOLD.test(stripped) || MARKDOWN_LIST.test(stripped) || MARKDOWN_TABLE.test(stripped))) {
      push(finding("vend/markdown-in-comment", i + 1, [raw]))
    }
    if (THIS_OPENER.test(stripped)) push(finding("vend/this-function-opener", i + 1, [raw]))
    if (TODO_WORD.test(t) && !TICKET_REF.test(t) && !ISSUE_LINK.test(t)) push(finding("vend/generic-todo", i + 1, [raw]))
    if (!doc && isCrossFileRef(stripped)) push(finding("vend/cross-file-ref", i + 1, [raw]))
    return weakMarkerHits(raw)
  }
  let runStart = -1
  const classifyRun = makeClassify()
  for (let i = 0; i <= lines.length; i++) {
    const cls = i < lines.length ? classifyRun(lines[i] ?? "") : null
    const inRun =
      cls !== null && cls.comment && !SUPPRESS_ANY.test(lines[i] ?? "") && !(i === 0 && (lines[0] ?? "").startsWith("#!"))
    if (inRun && runStart === -1) runStart = i
    if (!inRun && runStart !== -1) {
      const runLines = lines.slice(runStart, i)
      if (i - runStart >= 2 && !isLicenseRun(runLines)) push(finding("multi-line-comment", runStart + 1, runLines))
      runStart = -1
    }
  }
  let headerEnd = 0
  const classifyHeader = makeClassify()
  while (headerEnd < lines.length) {
    const line = lines[headerEnd] ?? ""
    if (!classifyHeader(line).comment || SUPPRESS_ANY.test(line) || (headerEnd === 0 && line.startsWith("#!"))) break
    headerEnd++
  }
  if (headerEnd >= 2 && !isLicenseRun(lines.slice(0, headerEnd))) {
    push(finding("vend/file-summary-header", 1, lines.slice(0, headerEnd)))
  }
  const classifyEach = makeClassify()
  const classifyLook = makeClassify()
  const lookCls = lines.map((l) => classifyLook(l))
  let weakRun = 0
  let weakRunLine = -1
  const flushWeakRun = () => {
    if (weakRun >= 2) push(finding("changelog-marker", weakRunLine, [lines[weakRunLine - 1] ?? ""]))
    weakRun = 0
    weakRunLine = -1
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const cls = classifyEach(line)
    const rawLine = rawLines[i] ?? ""
    if (rawLine !== "") {
      if (zeroWidthHit(rawLine, i)) push(finding("vend/zero-width-chars", i + 1, [rawLine]))
      if (BIDI.test(rawLine)) push(finding("vend/bidi-controls", i + 1, [rawLine]))
      if (!cls.comment && !cls.doc && cls.literal !== true && !proseCjk) {
        const m = inlineMarkerAt(rawLine, profile)
        const codePart = m === null ? rawLine : rawLine.slice(0, m.idx)
        if (BIDI_MARK.test(codePart)) push(finding("vend/bidi-controls", i + 1, [rawLine]))
        if (CJK_ADJACENT.test(codePart)) push(finding("vend/cjk-noise", i + 1, [rawLine]))
      }
    }
    if (cls.literal === true) continue
    if (SUPPRESS_ANY.test(line)) continue
    if (cls.comment || cls.doc) {
      const weak = testLine(line, i, cls.doc)
      if (weak > 0) {
        weakRun += weak
        if (weakRunLine === -1) weakRunLine = i + 1
      }
      if (cls.comment && !cls.doc && !proseCjk && !TODO_WORD.test(line)) {
        let j = i + 1
        while (j < lines.length && (lines[j] ?? "").trim() === "") j++
        const prevCls = i > 0 ? lookCls[i - 1] : null
        const nextCls = j < lines.length ? lookCls[j] : null
        if (
          nextCls !== null &&
          !nextCls.comment &&
          !nextCls.doc &&
          nextCls.literal !== true &&
          (prevCls === null || (!prevCls.comment && !prevCls.doc)) &&
          isObviousComment(stripCommentMarker(line.trim()), lines[j] ?? "")
        ) {
          push(finding("vend/obvious-comment", i + 1, [line]))
        }
      }
    } else {
      flushWeakRun()
      const inline = inlineComment(line, profile)
      if (inline !== null && testLine(inline, i, false) >= 2) push(finding("changelog-marker", i + 1, [inline]))
    }
  }
  flushWeakRun()
  return violations
}
export function multisetDiff(oldText, newText) {
  const remaining = new Map()
  for (const line of oldText.replaceAll("\r\n", "\n").split("\n")) {
    remaining.set(line, (remaining.get(line) ?? 0) + 1)
  }
  const added = []
  for (const line of newText.replaceAll("\r\n", "\n").split("\n")) {
    const count = remaining.get(line) ?? 0
    if (count > 0) remaining.set(line, count - 1)
    else added.push(line)
  }
  return added
}
export function isCodePath(filePath, extraSkippedSegments = []) {
  const skipped = extraSkippedSegments.length === 0 ? SKIPPED_SEGMENTS : new Set([...SKIPPED_SEGMENTS, ...extraSkippedSegments])
  if (filePath.split(/[\\/]/).some((segment) => skipped.has(segment))) return false
  return profileFor(filePath) !== null
}
export function readDisk(filePath) {
  try {
    return decodeText(readFileSync(filePath))
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? null : undefined
  }
}
