#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, relative, resolve, sep } from "node:path"
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
    write: "git commit -m 'переводим reindex на полный пересчёт: identity mapping ломается'",
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
    write: "отдельный модуль user/validation.ts",
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
}

function isDividerLine(trimmed) {
  if (DIVIDER_CHARS.test(trimmed)) return true
  const inner = stripCommentMarker(trimmed).trim()
  return inner.length >= 6 && DIVIDER_CHARS.test(inner)
}

function finding(id, lineNo, lines) {
  return { rule: id, lineNo, lines, severity: RULE_BY_ID.get(id).severity }
}

export function detectCommentSlop(addedLines) {
  let inJsxBlock = false
  const isComment = (line) => {
    const t = line.trim()
    if (inJsxBlock) {
      if (t.endsWith("*/}")) inJsxBlock = false
      return true
    }
    if (t.startsWith("{/*")) {
      if (!t.endsWith("*/}")) inJsxBlock = true
      return true
    }
    return isCommentLine(line)
  }
  const violations = []
  let runStart = -1
  for (let i = 0; i <= addedLines.length; i++) {
    const inRun = i < addedLines.length && isComment(addedLines[i] ?? "")
    if (inRun && runStart === -1) runStart = i
    if (!inRun && runStart !== -1) {
      if (i - runStart >= 2) {
        violations.push(finding("multi-line-comment", runStart + 1, addedLines.slice(runStart, i)))
      }
      runStart = -1
    }
  }
  let headerEnd = 0
  while (headerEnd < addedLines.length && isComment(addedLines[headerEnd] ?? "")) headerEnd++
  if (headerEnd >= 2) violations.push(finding("vend/file-summary-header", 1, addedLines.slice(0, headerEnd)))
  for (let i = 0; i < addedLines.length; i++) {
    const line = addedLines[i] ?? ""
    if (!isComment(line)) continue
    const t = line.trim()
    if (CHANGELOG_MARKER.test(line)) violations.push(finding("changelog-marker", i + 1, [line]))
    if (line.length > MAX_COMMENT_LENGTH) violations.push(finding("long-comment", i + 1, [line]))
    if (STEP_NUMBERED.test(t)) violations.push(finding("vend/step-numbered", i + 1, [line]))
    if (isDividerLine(t)) violations.push(finding("vend/section-divider", i + 1, [line]))
    if (MARKDOWN_BOLD.test(t) || MARKDOWN_LIST.test(t) || MARKDOWN_TABLE.test(t)) {
      violations.push(finding("vend/markdown-in-comment", i + 1, [line]))
    }
    if (THIS_OPENER.test(stripCommentMarker(t))) violations.push(finding("vend/this-function-opener", i + 1, [line]))
    if (TODO_WORD.test(t) && !TICKET_REF.test(t) && !ISSUE_LINK.test(t)) {
      violations.push(finding("vend/generic-todo", i + 1, [line]))
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
    return readFileSync(filePath, "utf8")
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
    if (disk === undefined) return null
    return {
      filePath,
      added: disk === null ? args.content.replaceAll("\r\n", "\n").split("\n") : multisetDiff(disk, args.content),
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
      text = readFileSync(file, "utf8")
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

function cmdScan(paths, { writeBaseline = false } = {}) {
  const root = process.cwd()
  const findings = scanFiles(collectFiles(paths, root), root)
  if (writeBaseline) {
    const lines = [...new Set(findings.map(baselineKey))].sort()
    const body = ["# slop-gate baseline: relpath:line", ...lines].join("\n") + "\n"
    writeFileSync(join(root, "stop-ai-slop.baseline.txt"), body)
    console.log(`slop-gate: baseline записан (${lines.length} записей) -> stop-ai-slop.baseline.txt`)
    return 0
  }
  const baseline = loadBaseline(root)
  const fresh = findings.filter((f) => !baseline.has(baselineKey(f)))
  printFindings(fresh)
  return fresh.some((f) => f.severity === "error") ? 1 : 0
}

function gitStagedDiff(root) {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "pipe" })
    return execFileSync("git", ["diff", "--cached", "-U0", "--no-color"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch {
    return null
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
      byFile.get(file).push({ lineNo: newLine, text: raw.slice(1) })
      newLine++
    } else if (raw.startsWith("-") || raw.startsWith("\\")) {
      continue
    } else {
      newLine++
    }
  }
  return byFile
}

const parseStagedDiff = parseUnifiedDiff

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
  return fresh.some((f) => f.severity === "error") ? 1 : 0
}

function cmdStaged() {
  const root = process.cwd()
  const diff = gitStagedDiff(root)
  if (diff === null) {
    console.log("slop-gate: не git-репозиторий — staged-проверка пропущена")
    return 0
  }
  return runDiffGate(diff, root, false)
}

function gitDiffRef(ref, root) {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "pipe" })
    return execFileSync("git", ["diff", ref, "-U0", "--no-color"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch {
    return null
  }
}

function cmdDiff(ref) {
  const root = process.cwd()
  const diff = gitDiffRef(ref, root)
  if (diff === null) {
    console.log("slop-gate: не git-репозиторий — diff-проверка пропущена")
    return 0
  }
  return runDiffGate(diff, root, false)
}

function cmdExplain(ruleId) {
  const rule = RULE_BY_ID.get(ruleId)
  if (rule === undefined) {
    console.error(`slop-gate: неизвестное правило "${ruleId}". Известные: ${RULES.map((r) => r.id).join(", ")}`)
    return 2
  }
  console.log(`${rule.id} [${rule.severity}]`)
  console.log(`Why: ${rule.why}`)
  console.log(`Instead of: ${rule.instead}`)
  console.log(`Write: ${rule.write}`)
  console.log(`Ignore it when: ${rule.ignoreWhen}`)
  return 0
}

function cmdInstall() {
  const root = process.cwd()
  const abs = fileURLToPath(import.meta.url).split(sep).join("/")
  const stagedCmd = `node "${abs}" --staged`
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
  if (existsSync(hookPath)) {
    const current = readFileSync(hookPath, "utf8")
    if (current.includes(MARK)) {
      console.log("slop-gate: pre-commit hook — slop-gate уже подключён")
    } else {
      writeFileSync(hookPath, current.replace(/\n?$/, "\n") + block)
      console.log("slop-gate: pre-commit hook — добавлен блок после существующего содержимого")
    }
  } else {
    writeFileSync(hookPath, `#!/bin/sh\n${block}`)
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
    const selfPath = fileURLToPath(import.meta.url)
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
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return failures === 0 ? 0 : 1
}

function main(argv) {
  if (argv.includes("--self-test")) return cmdSelfTest()
  const explainIdx = argv.indexOf("--explain")
  if (explainIdx !== -1) return cmdExplain(argv[explainIdx + 1])
  if (argv.includes("--install")) return cmdInstall()
  if (argv.includes("--staged")) return cmdStaged()
  const diffIdx = argv.indexOf("--diff")
  if (diffIdx !== -1) return cmdDiff(argv[diffIdx + 1])
  const paths = argv.filter((a) => a !== "scan" && !a.startsWith("--"))
  return cmdScan(paths.length > 0 ? paths : ["."], { writeBaseline: argv.includes("--baseline-write") })
}

const isMain = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  } catch {
    return false
  }
})()
if (isMain) process.exit(main(process.argv.slice(2)))
