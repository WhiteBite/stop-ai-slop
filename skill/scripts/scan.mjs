#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, extname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const RULES = [
  {
    id: "multi-line-comment",
    severity: "error",
    message: "комментарий занимает 2+ строки подряд",
    why: "Многострочный комментарий — почти всегда пересказ кода или диффа. Через год его никто не перечитает, а рассинхрон с кодом не заметит никто.",
    instead: "удалить или сжать до одной строки: только неочевидное внешнее ограничение, инвариант или воркэраунд",
    write: "// сбрасываем здесь, т.к. ниже освобождаем слот",
    ignoreWhen: "никогда для нового кода; легаси — через baseline",
  },
  {
    id: "changelog-marker",
    severity: "error",
    message: "комментарий пересказывает дифф (было/стало/раньше/вместо/fixes)",
    why: "История изменений живёт в гите. «Было/стало» в коде устаревает в момент коммита и дальше только врёт.",
    instead: "убрать комментарий; «почему» — в сообщение коммита",
    write: "ничего в коде — причину пишем в сообщение коммита",
    ignoreWhen: "дословная цитата внешней спеки, где формулировка зафиксирована",
  },
  {
    id: "long-comment",
    severity: "error",
    message: "строка комментария длиннее 120 символов",
    why: "Длинная строка — признак простыни. Ограничение, достойное комментария, формулируется коротко.",
    instead: "сжать мысль до одной короткой строки или удалить",
    write: "// сбрасываем здесь, т.к. ниже освобождаем слот",
    ignoreWhen: "единственная строка с длинной ссылкой на спеку/issue",
  },
  {
    id: "vend/step-numbered",
    severity: "warning",
    message: "нумерованный шаг в комментарии (// Step N или // N.)",
    why: "Нумерация дублирует порядок строк кода. После первой правки шаги вставляются между — номера врут.",
    instead: "говорящие имена функций и переменных вместо номеров; комментарий удалить",
    write: "const normalized = normalize(payload)",
    ignoreWhen: "протокол из внешнего документа с фиксированной нумерацией шагов",
  },
  {
    id: "vend/section-divider",
    severity: "warning",
    message: "строка-разделитель из символов -=#*",
    why: "Баннеры — признак файла-простыни. Навигацию даёт структура кода, а не линейки.",
    instead: "разбить файл или убрать разделитель",
    write: "ничего — навигацию даёт структура модулей",
    ignoreWhen: "сгенерированный файл",
  },
  {
    id: "vend/markdown-in-comment",
    severity: "warning",
    message: "markdown-разметка внутри комментария (**, -, |)",
    why: "Markdown в комментарии — документация, которую никто не читает рядом с кодом; она устаревает.",
    instead: "убрать; документация — в README, why — в одну строку",
    write: "// сбрасываем здесь, т.к. ниже освобождаем слот",
    ignoreWhen: "docstring, который реально рендерится генератором доков",
  },
  {
    id: "vend/this-function-opener",
    severity: "warning",
    message: "комментарий начинается с «This function/class/method/component»",
    why: "«This function does X» пересказывает сигнатуру. Ценность только в неочевидном ограничении.",
    instead: "удалить или переформулировать как инвариант/воркэраунд",
    write: "// дедупликация по id, т.к. источник шлёт повторы",
    ignoreWhen: "публичный API с обязательным JSDoc по внешнему требованию",
  },
  {
    id: "vend/file-summary-header",
    severity: "warning",
    message: "шапка-резюме из 2+ строк комментария в начале файла",
    why: "Оглавление файла устаревает при первой же правке. Структуру видно по символам файла.",
    instead: "убрать шапку; имя файла и структура говорят сами",
    write: "ничего — файл начинается с кода",
    ignoreWhen: "лицензионная шапка, требуемая политикой репо",
  },
  {
    id: "vend/generic-todo",
    severity: "warning",
    message: "TODO без ссылки на тикет",
    why: "TODO без тикета — вечный долг: некому искать и некогда чинить.",
    instead: "добавить тикет: // TODO ABC-123 ... — или удалить",
    write: "// TODO KRY-482 снять воркэраунд после фикса upstream",
    ignoreWhen: "локальный черновик до первого коммита",
  },
]

const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]))

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"])
const SKIPPED_SEGMENTS = new Set(["node_modules", "dist"])
const CLI_SKIPPED_SEGMENTS = new Set([...SKIPPED_SEGMENTS, "coverage", ".git"])
const MAX_COMMENT_LENGTH = 120
// \b is ASCII-only in JS — Cyrillic markers must stay bare substrings or they never match
const CHANGELOG_MARKER =
  /было|стало|раньше|вместо|теперь|\bnow we\b|\bpreviously\b|\binstead of\b|\bthis fixes\b|\bthis fix\b|\bmust take over\b|\bno longer\b|broke, so/i
const STEP_NUMBERED = /^\/\/\s*(?:step\s+\d+|\d+\.)/i
const DIVIDER_CHARS = /^[-=#*\s─-╿]{6,}$/
const MARKDOWN_BOLD = /^\/\/\s*\*\*/
const MARKDOWN_LIST = /^\/\/\s*-\s+\S/
const MARKDOWN_TABLE = /^\/\/\s*\|/
const THIS_OPENER = /^this\s+(?:function|class|method|component)\b/i
const TODO_WORD = /\bTODO\b/
const TICKET_REF = /[A-Z]+-\d+/
const ISSUE_LINK = /https?:\/\/\S+|#\d+/

export function isCommentLine(line) {
  const t = line.trim()
  return t.startsWith("//") || t.startsWith("#") || t.startsWith("/*") || t.startsWith("*") || t.endsWith("*/")
}

function stripCommentMarker(line) {
  return line
    .trim()
    .replace(/^(?:\/\/+|\/\*+|\*+|#+)\s?/, "")
    .replace(/\*\/\s*$/, "")
    .replace(/^[rbf]?"""/, "")
    .replace(/"""$/, "")
}

function isDividerLine(trimmed) {
  if (DIVIDER_CHARS.test(trimmed)) return true
  const inner = stripCommentMarker(trimmed).trim()
  return inner.length >= 6 && DIVIDER_CHARS.test(inner)
}

function finding(id, lineNo, lines) {
  return { rule: id, lineNo, lines, severity: RULE_BY_ID.get(id).severity }
}

const SUPPRESS_NEXT = /stop-ai-slop-ignore-next-line\b(.*)$/
const SUPPRESS_LINE = /stop-ai-slop-ignore-line\b(.*)$/
const SUPPRESS_FILE = /stop-ai-slop-ignore-file\b/
const SUPPRESS_ANY = /stop-ai-slop-ignore-(?:next-line|line|file)\b/

function collectSuppressions(lines) {
  const perLine = new Map()
  let file = false
  const rulesOf = (tail) => {
    const ids = tail.split("--")[0].trim().split(/\s+/).filter((w) => w !== "")
    return ids.length === 0 ? null : new Set(ids)
  }
  lines.forEach((raw, i) => {
    const next = SUPPRESS_NEXT.exec(raw)
    if (next !== null) perLine.set(i + 2, rulesOf(next[1]))
    const same = SUPPRESS_LINE.exec(raw)
    if (same !== null) perLine.set(i + 1, rulesOf(same[1]))
    if (SUPPRESS_FILE.test(raw)) file = true
  })
  return { file, perLine }
}

function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2))
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2))
  return buf.toString("utf8")
}

function inlineComment(line) {
  for (const marker of ["//", " #"]) {
    const idx = line.indexOf(marker)
    if (idx <= 0) continue
    const prefix = line.slice(0, idx)
    if (marker === "//" && prefix.trimEnd().endsWith(":")) continue
    if ((prefix.match(/["'`]/g) ?? []).length % 2 !== 0) continue
    return marker === "//" ? line.slice(idx) : "//" + line.slice(idx + 1).trimStart()
  }
  return null
}

export function detectCommentSlop(addedLines) {
  const lines = addedLines.map((l) => (l ?? "").replace(/[​-‏﻿]/g, ""))
  const suppress = collectSuppressions(lines)
  if (suppress.file) return []
  const makeClassify = () => {
    let inJsxBlock = false
    let inBlock = false
    let inDoc = false
    return (line) => {
      const t = line.trim()
      if (inJsxBlock) {
        if (t.endsWith("*/}")) inJsxBlock = false
        return { comment: true, doc: false }
      }
      if (inBlock) {
        if (t.includes("*/")) inBlock = false
        return { comment: true, doc: false }
      }
      if (inDoc) {
        if (t.includes('"""')) inDoc = false
        return { comment: false, doc: true }
      }
      if (t.startsWith("{/*")) {
        if (!t.endsWith("*/}")) inJsxBlock = true
        return { comment: true, doc: false }
      }
      if (t.startsWith("/*") && !t.includes("*/")) {
        inBlock = true
        return { comment: true, doc: false }
      }
      if (/^[rbf]?"""/.test(t)) {
        if (!t.slice(3).includes('"""')) inDoc = true
        return { comment: false, doc: true }
      }
      return { comment: isCommentLine(line), doc: false }
    }
  }
  const violations = []
  const push = (v) => {
    const s = suppress.perLine.get(v.lineNo)
    if (s === null || (s !== undefined && s.has(v.rule))) return
    violations.push(v)
  }
  const testLine = (raw, i) => {
    const t = raw.trim()
    if (CHANGELOG_MARKER.test(raw)) push(finding("changelog-marker", i + 1, [raw]))
    if (raw.length > MAX_COMMENT_LENGTH) push(finding("long-comment", i + 1, [raw]))
    if (STEP_NUMBERED.test(t)) push(finding("vend/step-numbered", i + 1, [raw]))
    if (isDividerLine(t)) push(finding("vend/section-divider", i + 1, [raw]))
    if (MARKDOWN_BOLD.test(t) || MARKDOWN_LIST.test(t) || MARKDOWN_TABLE.test(t)) {
      push(finding("vend/markdown-in-comment", i + 1, [raw]))
    }
    if (THIS_OPENER.test(stripCommentMarker(t))) push(finding("vend/this-function-opener", i + 1, [raw]))
    if (TODO_WORD.test(t) && !TICKET_REF.test(t) && !ISSUE_LINK.test(t)) push(finding("vend/generic-todo", i + 1, [raw]))
  }
  let runStart = -1
  const classifyRun = makeClassify()
  for (let i = 0; i <= lines.length; i++) {
    const cls = i < lines.length ? classifyRun(lines[i] ?? "") : null
    const inRun = cls !== null && cls.comment && !SUPPRESS_ANY.test(lines[i] ?? "")
    if (inRun && runStart === -1) runStart = i
    if (!inRun && runStart !== -1) {
      if (i - runStart >= 2) push(finding("multi-line-comment", runStart + 1, lines.slice(runStart, i)))
      runStart = -1
    }
  }
  let headerEnd = 0
  const classifyHeader = makeClassify()
  while (headerEnd < lines.length) {
    const line = lines[headerEnd] ?? ""
    if (!classifyHeader(line).comment || SUPPRESS_ANY.test(line)) break
    headerEnd++
  }
  if (headerEnd >= 2) push(finding("vend/file-summary-header", 1, lines.slice(0, headerEnd)))
  const classifyEach = makeClassify()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const cls = classifyEach(line)
    if (SUPPRESS_ANY.test(line)) continue
    if (cls.comment || cls.doc) testLine(line, i)
    else {
      const inline = inlineComment(line)
      if (inline !== null) testLine(inline, i)
    }
  }
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
  return CODE_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function readDisk(filePath) {
  try {
    return decodeText(readFileSync(filePath))
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? null : undefined
  }
}

export function addedFromToolArgs(tool, args) {
  const filePath = typeof args.filePath === "string" ? args.filePath : null
  if (filePath === null || !isCodePath(filePath)) return null
  if (tool === "write") {
    if (typeof args.content !== "string") return null
    const disk = readDisk(filePath)
    return {
      filePath,
      added: multisetDiff(disk ?? "", args.content),
    }
  }
  if (tool === "edit") {
    if (typeof args.oldString !== "string" || typeof args.newString !== "string") return null
    return { filePath, added: multisetDiff(args.oldString, args.newString) }
  }
  if (!Array.isArray(args.edits)) return null
  const added = []
  for (const entry of args.edits) {
    if (typeof entry !== "object" || entry === null) continue
    if (typeof entry.oldString === "string" && typeof entry.newString === "string") {
      added.push(...multisetDiff(entry.oldString, entry.newString))
    }
  }
  return { filePath, added }
}

function toRel(root, absPath) {
  return relative(root, absPath).split(sep).join("/")
}

function collectFiles(paths, root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!CLI_SKIPPED_SEGMENTS.has(entry.name)) walk(full)
      } else if (isCodePath(toRel(root, full), [...CLI_SKIPPED_SEGMENTS])) {
        out.push(full)
      }
    }
  }
  for (const p of paths) {
    const abs = resolve(root, p)
    if (!existsSync(abs)) continue
    if (statSync(abs).isDirectory()) walk(abs)
    else if (CODE_EXTENSIONS.has(extname(abs).toLowerCase())) out.push(abs)
  }
  return out
}

function scanFiles(files, root) {
  const findings = []
  for (const file of files) {
    let text
    try {
      text = decodeText(readFileSync(file))
    } catch {
      continue
    }
    const rel = toRel(root, file)
    for (const v of detectCommentSlop(text.replaceAll("\r\n", "\n").split("\n"))) {
      findings.push({ rel, ...v })
    }
  }
  return findings
}

function loadBaseline(root) {
  const path = join(root, "stop-ai-slop.baseline.txt")
  const set = new Set()
  if (!existsSync(path)) return set
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (t === "" || t.startsWith("#")) continue
    set.add(t)
  }
  return set
}

function baselineKey(f) {
  return `${f.rel}:${f.lineNo}`
}

function printFindings(findings) {
  const sorted = [...findings].sort((a, b) => (a.rel === b.rel ? a.lineNo - b.lineNo : a.rel < b.rel ? -1 : 1))
  for (const f of sorted) {
    const rule = RULE_BY_ID.get(f.rule)
    console.log(`${f.rel}:${f.lineNo} ${f.rule} [${f.severity}] ${rule.message}`)
    console.log(`  instead: ${rule.instead}`)
  }
  const errors = findings.filter((f) => f.severity === "error").length
  if (findings.length === 0) console.log("slop-gate: чисто")
  else console.log(`slop-gate: ${findings.length} находок, ошибок: ${errors}`)
}

function failsGate(findings, strict) {
  return strict ? findings.length > 0 : findings.some((f) => f.severity === "error")
}

function gitToplevel(root) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  } catch {
    return root
  }
}

function cmdScan(paths, { writeBaseline = false, strict = false, prune = false } = {}) {
  const root = gitToplevel(process.cwd())
  const findings = scanFiles(collectFiles(paths, root), root)
  if (writeBaseline) {
    const lines = [...new Set(findings.map(baselineKey))].sort()
    const body = ["# slop-gate baseline: relpath:line", ...lines].join("\n") + "\n"
    writeFileSync(join(root, "stop-ai-slop.baseline.txt"), body)
    console.log(`slop-gate: baseline записан (${lines.length} записей) -> stop-ai-slop.baseline.txt`)
    return 0
  }
  if (prune) {
    const baseline = loadBaseline(root)
    const keys = new Set(findings.map(baselineKey))
    const kept = [...baseline].filter((k) => keys.has(k)).sort()
    const body = ["# slop-gate baseline: relpath:line", ...kept].join("\n") + "\n"
    writeFileSync(join(root, "stop-ai-slop.baseline.txt"), body)
    console.log(`slop-gate: baseline прорежен (${baseline.size - kept.length} записей удалено)`)
    return 0
  }
  const baseline = loadBaseline(root)
  const fresh = findings.filter((f) => !baseline.has(baselineKey(f)))
  printFindings(fresh)
  return failsGate(fresh, strict) ? 1 : 0
}

function isNotARepoError(error) {
  return error.code === "ENOENT" || /not a git repository/i.test(String(error.stderr ?? ""))
}

function gitErrorText(error) {
  const stderr = String(error.stderr ?? "").trim()
  return stderr === "" ? String(error.message ?? error) : stderr
}

function gitStagedDiff(root) {
  try {
    execFileSync("git", ["-c", "core.quotepath=false", "rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "pipe" })
    return execFileSync("git", ["-c", "core.quotepath=false", "diff", "--cached", "-U0", "--no-color"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    if (isNotARepoError(error)) return null
    throw new Error(gitErrorText(error))
  }
}

function parseUnifiedDiff(diff) {
  const byFile = new Map()
  let file = null
  let inHunk = false
  let newLine = 0
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      file = null
      inHunk = false
      continue
    }
    if (!inHunk && raw.startsWith("+++ ")) {
      const p = raw.slice(4).trim().replace(/^"|"$/g, "")
      file = p === "/dev/null" ? null : p.replace(/^b\//, "")
      continue
    }
    if (raw.startsWith("@@ ")) {
      const m = /\+(\d+)/.exec(raw)
      newLine = m === null ? 0 : Number(m[1])
      inHunk = true
      continue
    }
    if (!inHunk || file === null) continue
    if (raw.startsWith("+")) {
      if (!byFile.has(file)) byFile.set(file, [])
      byFile.get(file).push({ lineNo: newLine, text: raw.slice(1).replace(/\r$/, "") })
      newLine++
    } else if (raw.startsWith("-") || raw.startsWith("\\")) {
      continue
    } else {
      newLine++
    }
  }
  return byFile
}

function consecutiveRuns(lines) {
  const runs = []
  let current = []
  for (const entry of lines) {
    if (current.length > 0 && entry.lineNo !== current[current.length - 1].lineNo + 1) {
      runs.push(current)
      current = []
    }
    current.push(entry)
  }
  if (current.length > 0) runs.push(current)
  return runs
}

function runDiffGate(diffText, root, strict) {
  const findings = []
  for (const [file, lines] of parseUnifiedDiff(diffText)) {
    if (!isCodePath(file, [...CLI_SKIPPED_SEGMENTS])) continue
    for (const run of consecutiveRuns(lines)) {
      for (const v of detectCommentSlop(run.map((r) => r.text))) {
        findings.push({ rel: file, ...v, lineNo: run[0].lineNo + v.lineNo - 1 })
      }
    }
  }
  const baseline = loadBaseline(root)
  const fresh = findings.filter((f) => !baseline.has(baselineKey(f)))
  printFindings(fresh)
  return failsGate(fresh, strict) ? 1 : 0
}

function cmdStaged(strict = false) {
  const root = gitToplevel(process.cwd())
  let diff
  try {
    diff = gitStagedDiff(root)
  } catch (error) {
    console.error(`slop-gate: git error: ${error.message}`)
    return 2
  }
  if (diff === null) {
    console.log("slop-gate: не git-репозиторий — staged-проверка пропущена")
    return 0
  }
  return runDiffGate(diff, root, strict)
}

function gitDiffRef(ref, root) {
  try {
    execFileSync("git", ["-c", "core.quotepath=false", "rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "pipe" })
    return execFileSync("git", ["-c", "core.quotepath=false", "diff", ref, "-U0", "--no-color"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    if (isNotARepoError(error)) return null
    throw new Error(gitErrorText(error))
  }
}

function cmdDiff(ref, strict = false) {
  const root = gitToplevel(process.cwd())
  let diff
  try {
    diff = gitDiffRef(ref, root)
  } catch (error) {
    console.error(`slop-gate: git error: ${error.message}`)
    return 2
  }
  if (diff === null) {
    console.log("slop-gate: не git-репозиторий — diff-проверка пропущена")
    return 0
  }
  return runDiffGate(diff, root, strict)
}

function cmdExplain(ruleId) {
  const rule = RULE_BY_ID.get(ruleId)
  if (rule === undefined) {
    console.error(`slop-gate: неизвестное правило "${ruleId}". Известные: ${RULES.map((r) => r.id).join(", ")}`)
    return 2
  }
  console.log(`${rule.id} [${rule.severity}]`)
  console.log(`Message: ${rule.message}`)
  console.log(`Why: ${rule.why}`)
  console.log(`Instead of: ${rule.instead}`)
  console.log(`Write: ${rule.write}`)
  console.log(`Ignore it when: ${rule.ignoreWhen}`)
  return 0
}

function cmdInstall(strict = false) {
  const root = process.cwd()
  const abs = fileURLToPath(import.meta.url).split(sep).join("/")
  const stagedCmd = `node "${abs}" --staged${strict ? " --strict" : ""}`
  const allCmd = `node "${abs}" scan`
  const pkgPath = join(root, "package.json")
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
    pkg.scripts = typeof pkg.scripts === "object" && pkg.scripts !== null ? pkg.scripts : {}
    const before = JSON.stringify(pkg.scripts)
    pkg.scripts["stop-ai-slop"] = stagedCmd
    pkg.scripts["stop-ai-slop:all"] = allCmd
    if (JSON.stringify(pkg.scripts) === before) console.log("slop-gate: package.json — scripts уже на месте")
    else {
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
      console.log("slop-gate: package.json — добавлены scripts.stop-ai-slop и scripts.stop-ai-slop:all")
    }
  } else {
    console.log("slop-gate: package.json не найден — npm scripts пропущены")
  }
  const gitDir = join(root, ".git")
  if (!existsSync(gitDir)) {
    console.log("slop-gate: .git не найден — pre-commit hook пропущен")
    return 0
  }
  const hooksDir = join(gitDir, "hooks")
  mkdirSync(hooksDir, { recursive: true })
  const hookPath = join(hooksDir, "pre-commit")
  const MARK = "# >>> slop-gate >>>"
  const block = `${MARK}\n${stagedCmd}\n# <<< slop-gate <<<\n`
  const blockRe = /# >>> slop-gate >>>[\s\S]*?# <<< slop-gate <<<\r?\n?/
  const writeHook = (content) => {
    writeFileSync(hookPath, content)
    chmodSync(hookPath, 0o755)
  }
  if (existsSync(hookPath)) {
    const current = readFileSync(hookPath, "utf8")
    if (blockRe.test(current)) {
      writeHook(current.replace(blockRe, block))
      console.log("slop-gate: pre-commit hook — slop-gate блок обновлён")
    } else {
      writeHook(current.replace(/\n?$/, "\n") + block)
      console.log("slop-gate: pre-commit hook — добавлен блок после существующего содержимого")
    }
  } else {
    writeHook(`#!/bin/sh\n${block}`)
    console.log("slop-gate: pre-commit hook создан")
  }
  return 0
}

function cmdSelfTest() {
  const dir = mkdtempSync(join(tmpdir(), "slop-gate-"))
  let failures = 0
    const check = (name, ok, detail) => {
      console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + JSON.stringify(detail)}`)
      if (!ok) failures++
    }
    const selfPath = fileURLToPath(import.meta.url)
    const runCli = (args, cwd, env) => {
      try {
        return {
          status: 0,
          out: execFileSync(process.execPath, [selfPath, ...args], { cwd, encoding: "utf8", stdio: "pipe", env }),
        }
      } catch (error) {
        return { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
      }
    }
  try {
    const narrative = [
      "// removeSource+reindex (spike scripts, re-clones) rewrites every symbol row",
      "// with fresh uuids: all zone members vanish at once and incremental has no",
      "// centroids left to assign the new ids to. Pruning to empty is not",
      "// maintenance - the identity mapping broke, so full recompute must take over.",
    ].join("\n")
    writeFileSync(join(dir, "sabotage.ts"), narrative + "\nconst x = 1\n")
    writeFileSync(join(dir, "legit.ts"), "// сбрасываем здесь, т.к. ниже освобождаем слот\nconst x = 1\n")
    writeFileSync(join(dir, "clean.ts"), "const x = 1\nif (x > 0) {\n  console.log(x)\n}\n")
    writeFileSync(join(dir, "step.ts"), "// Step 3: normalize the payload\nconst x = 1\n")
    const jsxNarrative = [
      "{/* removeSource+reindex (spike scripts, re-clones) rewrites every row",
      "with fresh uuids: all zone members vanish at once and incremental has no",
      "centroids left to assign the new ids to. Pruning to empty is not",
      "maintenance - the identity mapping broke, so full recompute must take over. */}",
    ].join("\n")
    writeFileSync(join(dir, "jsx-sabotage.tsx"), jsxNarrative + "\nconst x = 1\n")
    writeFileSync(join(dir, "jsx-legit.tsx"), "{/* сбрасываем здесь, т.к. ниже освобождаем слот */}\nconst x = 1\n")
    writeFileSync(join(dir, "long.ts"), "// " + "y".repeat(118) + "\nconst x = 1\n")
    writeFileSync(join(dir, "div.ts"), "// ----------\nconst x = 1\n")
    writeFileSync(join(dir, "md.ts"), "// **bold** note\nconst x = 1\n")
    writeFileSync(join(dir, "opener.ts"), "// This function normalizes the payload\nconst x = 1\n")
    writeFileSync(join(dir, "todo.ts"), "// TODO fix this later\nconst x = 1\n")
    writeFileSync(join(dir, "inline.ts"), "const x = 1 // было так, стало иначе\n")
    writeFileSync(join(dir, "block.ts"), "/* removeSource rewrites every row\nwith fresh uuids all vanish at once\nand incremental has no centroids left */\nconst x = 1\n")
    writeFileSync(join(dir, "docstring.py"), 'def f():\n    """This function normalizes the payload\n    and validates input\n    """\n    return 1\n')
    writeFileSync(join(dir, "zwsp.ts"), "// с\u200Bтало иначе\nconst x = 1\n")
    writeFileSync(
      join(dir, "utf16.ts"),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("// было так, стало иначе\nconst x = 1\n", "utf16le")]),
    )
    writeFileSync(join(dir, "supp.ts"), "// stop-ai-slop-ignore-next-line changelog-marker\n// стало иначе\nconst x = 1\n")
    writeFileSync(join(dir, "suppfile.ts"), "// stop-ai-slop-ignore-file\n// стало иначе\n// и ещё было\nconst x = 1\n")
    writeFileSync(join(dir, "supp2.ts"), "// stop-ai-slop-ignore-next-line -- было легаси\n// стало иначе\nconst x = 1\n")
    const findings = scanFiles(collectFiles([dir], dir), dir)
    const byRel = (rel) => findings.filter((f) => f.rel === rel)
    const sabotageRules = byRel("sabotage.ts").map((f) => f.rule)
    check("sabotage: multi-line-comment [error]", sabotageRules.includes("multi-line-comment"), byRel("sabotage.ts"))
    check("sabotage: changelog-marker [error]", sabotageRules.includes("changelog-marker"), byRel("sabotage.ts"))
    check("legit: однострочный why-комментарий проходит", byRel("legit.ts").length === 0, byRel("legit.ts"))
    check("clean: код без комментариев проходит", byRel("clean.ts").length === 0, byRel("clean.ts"))
    const step = byRel("step.ts")
    check(
      "step: vend/step-numbered [warning]",
      step.some((f) => f.rule === "vend/step-numbered" && f.severity === "warning"),
      step,
    )
    check("step: без error-находок", !step.some((f) => f.severity === "error"), step)
    const jsxSabotage = byRel("jsx-sabotage.tsx")
    const jsxSabotageRules = jsxSabotage.map((f) => f.rule)
    check("jsx-sabotage: multi-line-comment [error]", jsxSabotageRules.includes("multi-line-comment"), jsxSabotage)
    check("jsx-sabotage: changelog-marker [error]", jsxSabotageRules.includes("changelog-marker"), jsxSabotage)
    check("jsx-legit: однострочный JSX-комментарий проходит", byRel("jsx-legit.tsx").length === 0, byRel("jsx-legit.tsx"))
    check("long: long-comment [error]", byRel("long.ts").some((f) => f.rule === "long-comment"), byRel("long.ts"))
    check("div: vend/section-divider [warning]", byRel("div.ts").some((f) => f.rule === "vend/section-divider"), byRel("div.ts"))
    check("md: vend/markdown-in-comment [warning]", byRel("md.ts").some((f) => f.rule === "vend/markdown-in-comment"), byRel("md.ts"))
    check("opener: vend/this-function-opener [warning]", byRel("opener.ts").some((f) => f.rule === "vend/this-function-opener"), byRel("opener.ts"))
    check("todo: vend/generic-todo [warning]", byRel("todo.ts").some((f) => f.rule === "vend/generic-todo"), byRel("todo.ts"))
    check("inline: changelog-marker в trailing-комменте [error]", byRel("inline.ts").some((f) => f.rule === "changelog-marker"), byRel("inline.ts"))
    check("block: /* */ без * на средних строках [error]", byRel("block.ts").some((f) => f.rule === "multi-line-comment"), byRel("block.ts"))
    check(
      "docstring: vend/this-function-opener [warning]",
      byRel("docstring.py").some((f) => f.rule === "vend/this-function-opener" && f.severity === "warning"),
      byRel("docstring.py"),
    )
    check("zwsp: changelog-marker сквозь zero-width [error]", byRel("zwsp.ts").some((f) => f.rule === "changelog-marker"), byRel("zwsp.ts"))
    check("utf16: changelog-marker в UTF-16 файле [error]", byRel("utf16.ts").some((f) => f.rule === "changelog-marker"), byRel("utf16.ts"))
    check("supp: ignore-next-line гасит changelog-marker", !byRel("supp.ts").some((f) => f.rule === "changelog-marker"), byRel("supp.ts"))
    check("supp: ignore-file гасит всё", byRel("suppfile.ts").length === 0, byRel("suppfile.ts"))
    check("supp: директива с причиной не флагает сама себя", byRel("supp2.ts").length === 0, byRel("supp2.ts"))
    const auditPath = join(dir, "audit.jsonl")
    appendAudit({ verdict: "blocked", tool: "write", filePath: "a.ts", rules: ["multi-line-comment"] }, auditPath)
    appendAudit({ verdict: "passed", tool: "edit", filePath: "b.ts", added: 3 }, auditPath)
    const auditEnv = { ...process.env, STOP_AI_SLOP_LOG: auditPath }
    const auditRun = runCli(["--audit"], dir, auditEnv)
    check(
      "audit: --audit печатает счётчики и записи",
      auditRun.status === 0 && auditRun.out.includes("blocked: 1") && auditRun.out.includes("passed: 1") && auditRun.out.includes("a.ts"),
      auditRun.out,
    )
    const auditEmpty = runCli(["--audit"], dir, { ...process.env, STOP_AI_SLOP_LOG: join(dir, "nope.jsonl") })
    check("audit: пустой лог [exit 0]", auditEmpty.status === 0 && auditEmpty.out.includes("аудит-лог пуст"), auditEmpty.out)
    const repoDir = mkdtempSync(join(tmpdir(), "slop-gate-diff-"))
    try {
      const git = (args) =>
        execFileSync(
          "git",
          ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args],
          { cwd: repoDir, stdio: "pipe" },
        )
      git(["init", "-q", "-b", "main"])
      writeFileSync(join(repoDir, "clean.ts"), "const x = 1\n")
      git(["add", "clean.ts"])
      git(["commit", "-q", "-m", "init"])
      git(["checkout", "-q", "-b", "slop"])
      writeFileSync(join(repoDir, "clean.ts"), "const x = 1\n" + narrative + "\n")
      git(["add", "clean.ts"])
      git(["commit", "-q", "-m", "slop"])
      let diffBlocked = false
      try {
        execFileSync(process.execPath, [selfPath, "--diff", "main"], { cwd: repoDir, stdio: "pipe" })
      } catch (error) {
        diffBlocked = error.status === 1
      }
      check("diff: slop-ветка против main блокируется [exit 1]", diffBlocked)
      git(["checkout", "-q", "main"])
      let diffClean = true
      let diffCleanDetail = null
      try {
        execFileSync(process.execPath, [selfPath, "--diff", "main"], { cwd: repoDir, stdio: "pipe" })
      } catch (error) {
        diffClean = false
        diffCleanDetail = `exit ${error.status}`
      }
      check("diff: main без diff против себя проходит [exit 0]", diffClean, diffCleanDetail)
    } finally {
      rmSync(repoDir, { recursive: true, force: true })
    }
    const warnDir = mkdtempSync(join(tmpdir(), "slop-gate-strict-"))
    try {
      writeFileSync(join(warnDir, "warn.ts"), "// Step 3: normalize the payload\nconst x = 1\n")
      let strictDefault = true
      let strictDefaultDetail = null
      try {
        execFileSync(process.execPath, [selfPath], { cwd: warnDir, stdio: "pipe" })
      } catch (error) {
        strictDefault = false
        strictDefaultDetail = `exit ${error.status}`
      }
      check("strict: warning без --strict не блокирует [exit 0]", strictDefault, strictDefaultDetail)
      let strictBlocked = false
      try {
        execFileSync(process.execPath, [selfPath, "--strict"], { cwd: warnDir, stdio: "pipe" })
      } catch (error) {
        strictBlocked = error.status === 1
      }
      check("strict: --strict превращает warning в блокировку [exit 1]", strictBlocked)
    } finally {
      rmSync(warnDir, { recursive: true, force: true })
    }
    const crlfDir = mkdtempSync(join(tmpdir(), "slop-gate-crlf-"))
    try {
      const gitC = (args) =>
        execFileSync(
          "git",
          ["-c", "core.autocrlf=false", "-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args],
          { cwd: crlfDir, stdio: "pipe" },
        )
      gitC(["init", "-q", "-b", "main"])
      writeFileSync(join(crlfDir, "crlf.ts"), "const a = 1\r\nconst b = 2\r\n")
      gitC(["add", "crlf.ts"])
      gitC(["commit", "-q", "-m", "init"])
      writeFileSync(join(crlfDir, "crlf.ts"), "const a = 1\r\n// " + "x".repeat(117) + "\r\nconst b = 2\r\n")
      gitC(["add", "crlf.ts"])
      const crlfRun = runCli(["--staged"], crlfDir)
      check("crlf: комментарий ровно 120 символов в CRLF-файле проходит [exit 0]", crlfRun.status === 0, crlfRun.out)
    } finally {
      rmSync(crlfDir, { recursive: true, force: true })
    }
    const uniDir = mkdtempSync(join(tmpdir(), "slop-gate-quotepath-"))
    try {
      const gitU = (args) =>
        execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args], {
          cwd: uniDir,
          stdio: "pipe",
        })
      gitU(["init", "-q", "-b", "main"])
      writeFileSync(join(uniDir, "clean.ts"), "const x = 1\n")
      gitU(["add", "clean.ts"])
      gitU(["commit", "-q", "-m", "init"])
      writeFileSync(join(uniDir, "файл.ts"), "// первая строка блока\n// вторая строка блока\nconst x = 1\n")
      gitU(["add", "файл.ts"])
      const beforeBaseline = runCli(["--staged"], uniDir)
      check("quotepath: --staged печатает читаемый не-ASCII путь", beforeBaseline.out.includes("файл.ts:1"), beforeBaseline.out)
      runCli(["--baseline-write"], uniDir)
      const afterBaseline = runCli(["--staged"], uniDir)
      check("quotepath: --staged видит baseline по не-ASCII пути [exit 0]", afterBaseline.status === 0, afterBaseline.out)
    } finally {
      rmSync(uniDir, { recursive: true, force: true })
    }
    const hookDir = mkdtempSync(join(tmpdir(), "slop-gate-hookbit-"))
    try {
      execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "init", "-q", "-b", "main"], {
        cwd: hookDir,
        stdio: "pipe",
      })
      runCli(["--install"], hookDir)
      runCli(["--install"], hookDir)
      const hookMode = statSync(join(hookDir, ".git", "hooks", "pre-commit")).mode
      check("install: pre-commit hook исполняемый на POSIX", process.platform === "win32" || (hookMode & 0o111) !== 0, hookMode.toString(8))
    } finally {
      rmSync(hookDir, { recursive: true, force: true })
    }
    const errDir = mkdtempSync(join(tmpdir(), "slop-gate-errors-"))
    try {
      execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "init", "-q", "-b", "main"], {
        cwd: errDir,
        stdio: "pipe",
      })
      writeFileSync(join(errDir, "a.ts"), "const a = 1\n")
      execFileSync("git", ["add", "a.ts"], { cwd: errDir, stdio: "pipe" })
      execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "commit", "-q", "-m", "init"], {
        cwd: errDir,
        stdio: "pipe",
      })
      const badRef = runCli(["--diff", "nonexistent-ref-xyz"], errDir)
      check(
        "errors: --diff с несуществующим ref [exit 2]",
        badRef.status === 2 && badRef.out.includes("git error") && badRef.out.includes("nonexistent-ref-xyz"),
        `exit ${badRef.status}: ${badRef.out}`,
      )
      const noRef = runCli(["--diff"], errDir)
      check("errors: --diff без ref [exit 2]", noRef.status === 2 && noRef.out.includes("ref"), `exit ${noRef.status}: ${noRef.out}`)
      const help = runCli(["--help"], errDir)
      check(
        "help: --help [exit 0] печатает режимы",
        help.status === 0 && help.out.includes("--staged") && help.out.includes("--diff"),
        `exit ${help.status}`,
      )
      const bogus = runCli(["--bogus-flag-xyz"], errDir)
      check("errors: неизвестный флаг [exit 2]", bogus.status === 2 && bogus.out.includes("--bogus-flag-xyz"), `exit ${bogus.status}: ${bogus.out}`)
      const explainNoArg = runCli(["--explain"], errDir)
      check(
        "errors: --explain без аргумента [exit 2]",
        explainNoArg.status === 2 && !explainNoArg.out.includes("undefined"),
        `exit ${explainNoArg.status}: ${explainNoArg.out}`,
      )
    } finally {
      rmSync(errDir, { recursive: true, force: true })
    }
    const baseDir = mkdtempSync(join(tmpdir(), "slop-gate-baseline-"))
    try {
      writeFileSync(join(baseDir, "slop.ts"), narrative + "\nconst x = 1\n")
      const written = runCli(["--baseline-write"], baseDir)
      check("baseline: --baseline-write [exit 0]", written.status === 0, written.out)
      const cleanRun = runCli(["scan", "."], baseDir)
      check("baseline: после записи скан чист [exit 0]", cleanRun.status === 0, cleanRun.out)
      writeFileSync(join(baseDir, "slop.ts"), narrative + "\nconst x = 1\n" + narrative + "\n")
      const newRun = runCli(["scan", "."], baseDir)
      check("baseline: новый слоп поверх легаси блокирует [exit 1]", newRun.status === 1, newRun.out)
    } finally {
      rmSync(baseDir, { recursive: true, force: true })
    }
    mkdirSync(join(dir, "adir.ts"))
    const unreadable = addedFromToolArgs("write", { filePath: join(dir, "adir.ts"), content: narrative + "\nconst x = 1\n" })
    check("readDisk: нечитаемый файл проверяется целиком, а не пропускается", unreadable !== null && unreadable.added.length > 0, unreadable)
    const pruneDir = mkdtempSync(join(tmpdir(), "slop-gate-prune-"))
    try {
      writeFileSync(join(pruneDir, "slop.ts"), narrative + "\nconst x = 1\n")
      runCli(["--baseline-write"], pruneDir)
      writeFileSync(join(pruneDir, "slop.ts"), "const x = 1\n")
      const pruned = runCli(["--baseline-prune"], pruneDir)
      check("prune: --baseline-prune [exit 0]", pruned.status === 0, pruned.out)
      writeFileSync(join(pruneDir, "slop.ts"), narrative + "\nconst x = 1\n")
      const resurfaced = runCli(["scan", "."], pruneDir)
      check("prune: удалённый легаси не маскирует новый слоп [exit 1]", resurfaced.status === 1, resurfaced.out)
    } finally {
      rmSync(pruneDir, { recursive: true, force: true })
    }
    const subDir = mkdtempSync(join(tmpdir(), "slop-gate-root-"))
    try {
      execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "init", "-q", "-b", "main"], {
        cwd: subDir,
        stdio: "pipe",
      })
      mkdirSync(join(subDir, "deep"))
      writeFileSync(join(subDir, "deep", "slop.ts"), narrative + "\nconst x = 1\n")
      runCli(["--baseline-write"], subDir)
      const fromSub = runCli(["scan", "."], join(subDir, "deep"))
      check("root: baseline из корня git работает из подкаталога [exit 0]", fromSub.status === 0, fromSub.out)
    } finally {
      rmSync(subDir, { recursive: true, force: true })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return failures === 0 ? 0 : 1
}

const KNOWN_FLAGS = new Set([
  "--self-test",
  "--explain",
  "--strict",
  "--install",
  "--staged",
  "--diff",
  "--baseline-write",
  "--baseline-prune",
  "--audit",
  "--help",
])

export function auditLogPath() {
  return process.env.STOP_AI_SLOP_LOG ?? join(homedir(), ".config", "opencode", "logs", "comment-gate.jsonl")
}

export function appendAudit(entry, path = auditLogPath()) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n")
  } catch {
    return
  }
}

function cmdAudit(limit) {
  const path = auditLogPath()
  if (!existsSync(path)) {
    console.log("slop-gate: аудит-лог пуст")
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
  console.log(
    `slop-gate: аудит ${path}: ${entries.length} записей (${Object.entries(counts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")})`,
  )
  for (const e of entries.slice(-limit)) {
    const rules = Array.isArray(e.rules) && e.rules.length > 0 ? ` [${e.rules.join(",")}]` : ""
    console.log(`${e.ts} ${e.verdict ?? e.event} ${e.tool ?? ""} ${e.filePath ?? ""}${rules}`)
  }
  return 0
}

function cmdUsage() {
  console.log(
    [
      "slop-gate — гейт против slop-комментариев",
      "",
      "Режимы:",
      "  scan [paths...]     сканировать файлы (по умолчанию текущий каталог)",
      "  --staged            добавленные строки из git diff --cached",
      "  --diff <ref>        добавленные строки относительно ref",
      "  --baseline-write    записать текущие находки в baseline",
      "  --baseline-prune    удалить из baseline записи без живых находок",
      "  --install           npm scripts + pre-commit hook в текущем репо",
      "  --explain <rule-id> обоснование правила",
      "  --audit [N]         последние N записей аудит-лога решений гейта",
      "  --self-test         саботаж-тест детектора",
      "",
      "Флаги: --strict (warning тоже блокируют), --help",
      "Коды выхода: 0 — чисто; 1 — гейт сработал; 2 — ошибка использования или git",
    ].join("\n"),
  )
  return 0
}

function main(argv) {
  if (argv.includes("--self-test")) return cmdSelfTest()
  const explainIdx = argv.indexOf("--explain")
  if (explainIdx !== -1) {
    const ruleId = argv[explainIdx + 1]
    if (ruleId === undefined || ruleId.startsWith("--")) {
      console.error("slop-gate: --explain требует id правила")
      return 2
    }
    return cmdExplain(ruleId)
  }
  const strict = argv.includes("--strict")
  if (argv.includes("--install")) return cmdInstall(strict)
  if (argv.includes("--staged")) return cmdStaged(strict)
  const diffIdx = argv.indexOf("--diff")
  if (diffIdx !== -1) {
    const ref = argv[diffIdx + 1]
    if (ref === undefined || ref.startsWith("--")) {
      console.error("slop-gate: --diff требует ref (например, main)")
      return 2
    }
    return cmdDiff(ref, strict)
  }
  if (argv.includes("--help")) return cmdUsage()
  const auditIdx = argv.indexOf("--audit")
  if (auditIdx !== -1) {
    const n = Number(argv[auditIdx + 1])
    return cmdAudit(Number.isInteger(n) && n > 0 ? n : 20)
  }
  if (argv.includes("--baseline-prune")) {
    const paths = argv.filter((a) => a !== "scan" && !a.startsWith("--"))
    return cmdScan(paths.length > 0 ? paths : ["."], { prune: true })
  }
  const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN_FLAGS.has(a))
  if (unknown.length > 0) {
    console.error(`slop-gate: неизвестный флаг ${unknown[0]}`)
    return 2
  }
  const paths = argv.filter((a) => a !== "scan" && !a.startsWith("--"))
  return cmdScan(paths.length > 0 ? paths : ["."], { writeBaseline: argv.includes("--baseline-write"), strict })
}

const isMain = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  } catch {
    return false
  }
})()
if (isMain) process.exit(main(process.argv.slice(2)))
