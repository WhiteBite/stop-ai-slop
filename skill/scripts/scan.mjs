#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, extname, join, relative, resolve, sep } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath, pathToFileURL } from "node:url"

export const RULES = [
  {
    id: "multi-line-comment",
    severity: "error",
    message: "комментарий занимает 2+ строки подряд",
    why: "Многострочный комментарий — почти всегда пересказ кода или диффа. Через год его никто не перечитает, а рассинхрон с кодом не заметит никто.",
    instead: "удалить или сжать до одной строки: только неочевидное внешнее ограничение, инвариант или воркэраунд",
    write: "// сбрасываем здесь, т.к. ниже освобождаем слот",
    ignoreWhen: "doc-блок (JSDoc/docstring/`///` doc-комментарии) с контрактной документацией; легаси — через baseline",
  },
  {
    id: "changelog-marker",
    severity: "error",
    message: "комментарий пересказывает дифф (пара changelog-маркеров или сильный маркер, ru/en/de/fr/es)",
    why: "История изменений живёт в гите. «Было/стало» в коде устаревает в момент коммита и дальше только врёт. Одиночное «вместо/было» — обычная проза; сигнал чейнджлога — пара маркеров в одном блоке комментария или сильный маркер (this fixes, must take over, was…, now…).",
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
    ignoreWhen: "doc-блок; строка с длинной ссылкой на спеку/issue",
  },
  {
    id: "vend/step-numbered",
    severity: "warning",
    message: "нумерованный шаг в комментарии (Step N / Шаг N / N., маркер любого языка)",
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
    message: "комментарий начинается с «This function/…», «Эта функция/…», «Diese Funktion…», «Cette fonction…» или «Esta función…»",
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
  {
    id: "vend/self-suppression",
    severity: "warning",
    message: "директива подавления без списка правил пришла вместе с подавляемым кодом",
    why: "Директива в одной правке с кодом, который она глушит, — амнистия без ревизии: никто не проверил обоснование.",
    instead: "указать явный список правил или внести директиву отдельной правкой",
    write: "// stop-ai-slop-ignore-next-line vend/step-numbered -- нумерация из внешнего протокола",
    ignoreWhen: "full-scan: директива уже в репо, подавление легитимно",
  },
  {
    id: "vend/cjk-noise",
    severity: "warning",
    message: "CJK-иероглифы склеены с латиницей или цифрами в коде (артефакт генерации)",
    why: "Переключение модели на китайский посреди идентификатора или строки не читается и не компилируется осмысленно; склейка иероглифов с латиницей — маркер невычищенной генерации, а не осознанной i18n-строки.",
    instead: "переписать идентификатор или строку на одном языке; переводы — в i18n-ресурсы",
    write: "const TAB_LABELS = { features: 'Функции' }",
    ignoreWhen: "легальные китайские комментарии и строки i18n без смежности с латиницей; подавление директивой",
  },
  {
    id: "vend/zero-width-chars",
    severity: "error",
    message: "невидимый символ нулевой ширины (U+200B, U+200C, U+200D, U+2060, U+FEFF или escape-форма)",
    why: "Невидимые символы — канал инъекций и обфускации (Unicode Instruction Injection, Trojan Source): текст выглядит не так, как исполняется.",
    instead: "удалить символ; пробел — обычным пробелом",
    write: "const label = 'test'",
    ignoreWhen: "нет (всегда артефакт или инъекция)",
  },
  {
    id: "vend/bidi-controls",
    severity: "error",
    message: "BiDi-контролы (U+202A-U+202E, U+2066-U+2069 или escape-форма) переопределяют направление текста",
    why: "BiDi-override меняет визуальный порядок кода без изменения логики: ревьюер видит не тот код, что исполняется.",
    instead: "удалить контрол; направление текста определяет Unicode Bidi Algorithm",
    write: "const url = 'example.com'",
    ignoreWhen: "нет (явные контролы в коде не нужны)",
  },
]

const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]))

const P = (prefixes, blocks = [], doc = [], suffixes = [], regexPrefixes = [], flags = {}) => ({ prefixes, blocks, doc, suffixes, regexPrefixes, ...flags })
const JSDOC = { openRe: /^\/\*\*/, close: "*/" }
// close "" always matches the rest of the line, so each /// line is a self-contained doc line (dartdoc/rustdoc/XML doc)
const TRIPLE_SLASH_DOC = { openRe: /^\/\/\//, close: "" }
const PYDOC_DQ = { openRe: /^[rbf]?"""/, close: '"""' }
const PYDOC_SQ = { openRe: /^[rbf]?'''/, close: "'''" }
const PROFILES = {
  legacy: P(["//", "#", "/*", "*"], [["/*", "*/"], ["{/*", "*/}"]], [JSDOC, TRIPLE_SLASH_DOC, PYDOC_DQ], ["*/"]),
  cfamily: P(["//", "/*", "*"], [["/*", "*/"], ["{/*", "*/}"]], [JSDOC, TRIPLE_SLASH_DOC], ["*/"]),
  css: P(["//", "/*", "*"], [["/*", "*/"]], [], ["*/"]),
  py: P(["#"], [], [PYDOC_DQ, PYDOC_SQ]),
  hash: P(["#"]),
  yaml: P(["#"], [], [], [], [], { blockScalars: true }),
  powershell: P(["#"], [["<#", "#>"]]),
  julia: P(["#"], [["#=", "=#"]]),
  nim: P(["#"], [["#[", "]#"]]),
  sql: P(["--", "/*", "*"], [["/*", "*/"]], [], ["*/"]),
  lua: P(["--"], [["--[[", "]]"]]),
  haskell: P(["--"], [["{-", "-}"]]),
  lisp: P([";"]),
  percent: P(["%"]),
  fortran: P(["!"]),
  vb: P(["'"]),
  batch: P(["::"], [], [], [], [/^rem\b/i]),
  vim: P(['"']),
  markup: P(["<!--"], [["<!--", "-->"]]),
  ocaml: P(["(*"], [["(*", "*)"]], [], ["*)"]),
  pascal: P(["//", "(*"], [["(*", "*)"]], [], ["*)"]),
  ini: P([";", "#"]),
  properties: P(["#", "!"]),
  rst: P([".."]),
  vue: P(["//", "/*", "*", "<!--"], [["/*", "*/"], ["{/*", "*/}"], ["<!--", "-->"]], [JSDOC], ["*/"]),
  dash: P(["--"]),
  hashblock: P(["#", "/*", "*"], [["/*", "*/"]], [], ["*/"]),
  coffee: P(["#"], [["###", "###"]]),
  adoc: P(["//"], [["////", "////"]]),
  handlebars: P(["{{!"], [["{{!--", "--}}"]]),
  gotmpl: P(["{{/*"], [["{{/*", "*/}}"]]),
}
const PROSE_PROFILES = new Set([PROFILES.markup, PROFILES.rst, PROFILES.adoc])
const EXT_PROFILE = {
  ".ts": "cfamily", ".tsx": "cfamily", ".js": "cfamily", ".jsx": "cfamily", ".mjs": "cfamily", ".cjs": "cfamily",
  ".kt": "cfamily", ".kts": "cfamily", ".java": "cfamily", ".go": "cfamily", ".rs": "cfamily", ".cs": "cfamily",
  ".c": "cfamily", ".h": "cfamily", ".cc": "cfamily", ".cpp": "cfamily", ".hh": "cfamily", ".hpp": "cfamily",
  ".swift": "cfamily", ".dart": "cfamily", ".zig": "cfamily", ".scala": "cfamily", ".sc": "cfamily",
  ".groovy": "cfamily", ".gradle": "cfamily", ".proto": "cfamily", ".jsonc": "cfamily",
  ".mts": "cfamily", ".cts": "cfamily", ".sol": "cfamily", ".d": "cfamily", ".v": "cfamily", ".sv": "cfamily",
  ".svh": "cfamily", ".qml": "cfamily", ".res": "cfamily", ".resi": "cfamily", ".styl": "cfamily",
  ".css": "css", ".scss": "css", ".less": "css", ".sass": "css",
  ".py": "py", ".vy": "py",
  ".rb": "hash", ".php": "hash", ".sh": "hash", ".bash": "hash", ".zsh": "hash", ".ksh": "hash", ".fish": "hash",
  ".ex": "hash", ".exs": "hash", ".cr": "hash", ".pl": "hash", ".pm": "hash", ".r": "hash",
  ".yaml": "yaml", ".yml": "yaml", ".toml": "hash", ".conf": "hash", ".cfg": "hash",
  ".graphql": "hash", ".gql": "hash", ".mk": "hash", ".cmake": "hash", ".bzl": "hash",
  ".raku": "hash", ".p6": "hash", ".org": "hash", ".awk": "hash",
  ".tf": "hashblock", ".tfvars": "hashblock", ".nix": "hashblock", ".hcl": "hashblock",
  ".ps1": "powershell", ".psm1": "powershell", ".psd1": "powershell",
  ".jl": "julia", ".nim": "nim",
  ".sql": "sql", ".plsql": "sql", ".pks": "sql", ".pkb": "sql", ".lua": "lua",
  ".hs": "haskell", ".lhs": "haskell", ".elm": "haskell", ".purs": "haskell", ".idr": "haskell", ".agda": "haskell", ".dhall": "haskell",
  ".clj": "lisp", ".cljs": "lisp", ".cljc": "lisp", ".edn": "lisp", ".lisp": "lisp", ".el": "lisp", ".scm": "lisp", ".rkt": "lisp",
  ".tex": "percent", ".bib": "percent", ".sty": "percent", ".cls": "percent", ".erl": "percent", ".hrl": "percent",
  ".f": "fortran", ".f90": "fortran", ".f95": "fortran", ".f03": "fortran", ".for": "fortran", ".fpp": "fortran",
  ".vb": "vb", ".bat": "batch", ".cmd": "batch", ".vim": "vim",
  ".html": "markup", ".htm": "markup", ".xml": "markup", ".svg": "markup", ".xhtml": "markup", ".md": "markup", ".mdx": "markup",
  ".xsl": "markup", ".xslt": "markup",
  ".ml": "ocaml", ".mli": "ocaml", ".pas": "pascal", ".pp": "pascal", ".fs": "pascal", ".fsx": "pascal", ".fsi": "pascal",
  ".ini": "ini", ".inf": "ini", ".properties": "properties",
  ".pyi": "py", ".feature": "hash", ".mod": "hash", ".sum": "hash", ".tmpl": "gotmpl",
  ".plist": "markup", ".pbxproj": "markup", ".xib": "markup", ".storyboard": "markup", ".rst": "rst",
  ".vue": "vue", ".svelte": "vue", ".astro": "vue",
  ".vhd": "dash", ".vhdl": "dash", ".adb": "dash", ".ads": "dash",
  ".coffee": "coffee", ".litcoffee": "coffee",
  ".adoc": "adoc", ".asciidoc": "adoc",
  ".hbs": "handlebars",
  ".tpl": "gotmpl", ".gotmpl": "gotmpl", ".gohtml": "gotmpl",
}
const FILENAME_PROFILE = {
  dockerfile: "hash",
  containerfile: "hash",
  makefile: "hash",
  gnumakefile: "hash",
  justfile: "hash",
  vagrantfile: "hash",
  gemfile: "hash",
  rakefile: "hash",
  "cmakelists.txt": "hash",
  jenkinsfile: "cfamily",
  build: "hash",
  "build.bazel": "hash",
  workspace: "hash",
  "workspace.bazel": "hash",
  "meson.build": "hash",
  sconstruct: "hash",
  sconscript: "hash",
  pipfile: "hash",
  procfile: "hash",
  ".env": "hash",
  ".gitignore": "hash",
  ".dockerignore": "hash",
  ".npmignore": "hash",
  ".gitattributes": "hash",
  ".gitmodules": "hash",
  ".editorconfig": "ini",
}

export function profileFor(filePath) {
  const base = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? ""
  const exact = FILENAME_PROFILE[base]
  if (exact !== undefined) return PROFILES[exact] ?? null
  const byExt = EXT_PROFILE[extname(filePath).toLowerCase()]
  if (byExt !== undefined) return PROFILES[byExt] ?? null
  for (const [name, profile] of Object.entries(FILENAME_PROFILE)) {
    if (base.startsWith(name + ".")) return PROFILES[profile] ?? null
  }
  return null
}
const SKIPPED_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "venv",
  ".venv",
  "build",
  ".next",
  ".dart_tool",
  "site-packages",
  "target",
  "out",
  ".gradle",
  "Pods",
  "__pycache__",
  ".idea",
  ".codegraph",
])
const CLI_SKIPPED_SEGMENTS = new Set([...SKIPPED_SEGMENTS, "coverage", ".git"])
const MAX_COMMENT_LENGTH = 120
// changelog pair semantics: lone weak marker is prose, signal is 2+ weak per comment run or one strong marker
const CHANGELOG_STRONG = /\bwas\b[^,.;\n]{0,60},\s*(?:and\s+)?now\b|\bthis fixes\b|\bthis fix\b|\bmust take over\b|broke, so/i
const CHANGELOG_WEAK =
  /(?<![а-яё])(?:было|стало|раньше|вместо|теперь)(?![а-яё])|\bnow we\b|\bpreviously\b|\binstead of\b|\bno longer\b|(?<![a-zäöüß])(?:stattdessen|nicht mehr|früher war|war vorher)(?![a-zäöüß])|\bau lieu de\b|(?<![a-zéèêàùç])(?:auparavant|désormais)(?![a-zéèêàùç])|\ben lugar de\b|\bantes era\b|\bya no\b|\banteriormente\b/gi
const weakMarkerHits = (text) => (text.match(CHANGELOG_WEAK) ?? []).length
const GEN_NAME_SAFE =
  /\.(?:g|g\.i|freezed|gr|chopper|pb|pbenum|pbjson|pbgrpc|pbserver)\.dart$|_pb2(?:_grpc)?\.py$|_pb2\.pyi$|_pb\.go$|_grpc\.pb\.go$|\.pb\.(?:cc|h|hpp|cpp)$|_grpc\.pb\.(?:cc|h)$|\.pb\.mojom\.(?:cc|h)$|zz_generated\.|_string\.go$|\.sql\.go$|\.querier\.go$|\.Designer\.cs$|\.g\.i\.cs$|AssemblyAttributes\.cs$|^GlobalUsings(?:\.g)?\.cs$|\.min\.[cm]?js$|\.min\.css$|\.bundle\.js$/i
const GEN_HEADER_STRICT =
  /@generated\b|code generated by [^\n]*do not edit|generated code - do not modify by hand|<auto-generated|automatically generated by rust-bindgen|@generated by prost-build|@javax\.annotation\.(?:processing\.)?Generated\(|generated by openapi-generator|code generated by sqlc/i
const GEN_HEADER_LAX = [/generat|codegen/i, /do not (?:edit|modify)|do-not-edit/i]
const SECURITY_RULES = new Set(["vend/zero-width-chars", "vend/bidi-controls", "vend/cjk-noise"])

export function isGeneratedFile(relPath, text, extra) {
  if (extra?.scanGenerated === true) return false
  const base = relPath.split(/[\\/]/).pop() ?? ""
  if (GEN_NAME_SAFE.test(base)) return true
  if (extra?.gitattr != null && extra.gitattr(relPath)) return true
  if (isExcludedPath(relPath, extra?.cfgPaths ?? [])) return true
  const head = text.split("\n", 10).join("\n")
  if (GEN_HEADER_STRICT.test(head)) return true
  return GEN_HEADER_LAX.every((re) => re.test(head))
}

const GLOB_SPECIAL = /[.+^${}()|[\]\\]/g

function gitattrGlobRe(pattern) {
  let p = pattern.replace(/^\//, "")
  if (p.endsWith("/")) p += "**"
  const anchored = p.includes("/")
  let body = ""
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === "*") {
      if (p[i + 1] === "*") {
        body += ".*"
        i++
      } else body += "[^/]*"
    } else if (c === "?") body += "[^/]"
    else body += c.replace(GLOB_SPECIAL, "\\$&")
  }
  return anchored ? new RegExp("^" + body + "$") : new RegExp("(?:^|/)" + body + "$")
}

function loadGitattributesGenerated(root) {
  const path = join(root, ".gitattributes")
  if (!existsSync(path)) return null
  const res = []
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (line === "" || line.startsWith("#")) continue
    const parts = line.split(/\s+/)
    if (!parts.slice(1).some((a) => a === "linguist-generated" || a === "linguist-generated=true")) continue
    res.push(gitattrGlobRe(parts[0]))
  }
  if (res.length === 0) return null
  return (rel) => res.some((re) => re.test(rel))
}

function genContext(root, config) {
  return { gitattr: loadGitattributesGenerated(root), cfgPaths: config?.generatedPaths ?? [], scanGenerated: config?.scanGenerated === true }
}
const STEP_NUMBERED = /^(?:step\s+\d+|шаг\s+\d+|schritt\s+\d+|(?<![a-zéèêàùç])étape\s+\d+|paso\s+\d+|\d+\.)/i
const DIVIDER_CHARS = /^[-=#*\s─-╿]{6,}$/
const MARKDOWN_BOLD = /^\*\*/
const MARKDOWN_LIST = /^-\s+\S/
const MARKDOWN_TABLE = /^\|.+\|.+\|/
const THIS_OPENER =
  /^(?:this\s+(?:function|class|method|component)\b|(?:эт[ао]т?\s+|данн(?:ая|ый)\s+)(?:функци[а-яё]*|класс[а-яё]*|метод[а-яё]*|компонент[а-яё]*)|diese[rs]?\s+(?:funktion|klasse|methode|komponente)|cett[ee]\s+(?:fonction|classe|méthode|composant)|est[ae]\s+(?:función|clase|método|componente))/i
const TODO_WORD = /\bTODO\b/
const TICKET_REF = /[A-Z]+-\d+/
const ISSUE_LINK = /https?:\/\/\S+|#\d+/

const CP = (...cps) => String.fromCodePoint(...cps)
const BS = CP(0x5c)
const STRIP_INVISIBLE = new RegExp("[" + CP(0x200b) + "-" + CP(0x200f) + CP(0xfeff) + "]", "g")
const CJK = "[\\u2E80-\\u2EFF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u3040-\\u30FF\\uAC00-\\uD7AF]"
const LATIN = "[A-Za-z0-9_]"
const CJK_ADJACENT = new RegExp(CJK + LATIN + "|" + LATIN + CJK)
const ZERO_WIDTH = new RegExp("[" + CP(0x200b, 0x200c, 0x2060) + "]|" + BS + BS + "u200[bBcC]|" + BS + BS + "u2060")
const ZWJ_ESCAPE = new RegExp(BS + BS + "u200[dD]")
const FEFF_ESCAPE = new RegExp(BS + BS + "u[fF][eE][fF][fF]")
const FEFF_CHAR = CP(0xfeff)
const ZWJ_CHAR = CP(0x200d)
const EMOJI = new RegExp(
  "[" +
    [
      [0x2600, 0x27bf],
      [0x1f300, 0x1f5ff],
      [0x1f600, 0x1f64f],
      [0x1f680, 0x1f6c5],
      [0x1f900, 0x1f9ff],
      [0x1f3fb, 0x1f3ff],
    ]
      .map(([a, b]) => CP(a) + "-" + CP(b))
      .join("") +
    "]",
  "u",
)
const BIDI = new RegExp(
  "[" + CP(0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069) + "]|" + BS + BS + "u202[a-eA-E]|" + BS + BS + "u206[6-9]",
)
const hasBadZwj = (line) => {
  if (ZWJ_ESCAPE.test(line)) return true
  const chars = [...line]
  for (let k = 0; k < chars.length; k++) {
    if (chars[k] !== ZWJ_CHAR) continue
    if (!EMOJI.test(chars[k - 1] ?? "") || !EMOJI.test(chars[k + 1] ?? "")) return true
  }
  return false
}
const hasBadFeff = (line, i) => {
  if (FEFF_ESCAPE.test(line)) return true
  const idx = line.indexOf(FEFF_CHAR)
  if (idx === -1) return false
  if (i === 0 && idx === 0) return line.indexOf(FEFF_CHAR, 1) !== -1
  return true
}
const zeroWidthHit = (line, i) => ZERO_WIDTH.test(line) || hasBadZwj(line) || hasBadFeff(line, i)

export function isCommentLine(line, profile = PROFILES.legacy) {
  const t = line.trim()
  if (profile.prefixes.some((p) => t.startsWith(p))) return true
  if (profile.suffixes.some((s) => t.endsWith(s))) return true
  return profile.regexPrefixes.some((re) => re.test(t))
}

function stripCommentMarker(line) {
  return line
    .trim()
    .replace(/^(?:\/\/+|\/\*+|\*+|#+|--+|;+|%+|!+|\(\*+|<!--+|::+|\.\.+|'+|"+|\{\{!--?|\{\{!|\{\{\/\*+)\s?/, "")
    .replace(/\*\/\s*$/, "")
    .replace(/^[rbf]?(?:"""|''')/, "")
    .replace(/(?:"""|''')$/, "")
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
const SUPPRESS_FILE = /stop-ai-slop-ignore-file\b(.*)$/
const SUPPRESS_ANY = /stop-ai-slop-ignore-(?:next-line|line|file)\b/

const rulesOfTail = (tail) => {
  const ids = tail.split("--")[0].trim().split(/\s+/).filter((w) => w !== "")
  return ids.length === 0 ? null : new Set(ids)
}

function fileSuppressIds(lines) {
  for (const raw of lines) {
    const m = SUPPRESS_FILE.exec(raw)
    if (m !== null) return rulesOfTail(m[1])
  }
  return null
}

const LICENSE_HEAD = /^(?:\/\/+|\/\*+|\*+|\(\*+|<!--+|#+|;+|--+)\s*(?:copyright|licensed?|SPDX)/i
const isLicenseRun = (runLines) =>
  runLines.slice(0, 3).some((l) => LICENSE_HEAD.test(l.trim())) || runLines.some((l) => l.includes("SPDX-License-Identifier"))

function collectSuppressions(lines, diffMode = false) {
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

function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2))
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2))
  return buf.toString("utf8")
}

const INLINE_SAFE_PREFIXES = new Set(["//", "#", "--", "%", ";", "!"])

function inlineMarkerAt(line, profile) {
  const markers = profile.prefixes
    .filter((p) => INLINE_SAFE_PREFIXES.has(p))
    .filter((p) => !(p === "//" && (profile === PROFILES.py || profile === PROFILES.pascal)))
    .map((p) => (p === "#" ? " #" : p))
  for (const marker of markers) {
    const idx = line.indexOf(marker)
    if (idx <= 0) continue
    const prefix = line.slice(0, idx)
    if (marker === "//" && prefix.trimEnd().endsWith("://")) continue
    if ((prefix.match(/["'`]/g) ?? []).length % 2 !== 0) continue
    return { idx, marker }
  }
  return null
}

function inlineComment(line, profile) {
  const m = inlineMarkerAt(line, profile)
  if (m === null) return null
  return m.marker === "//" ? line.slice(m.idx) : "//" + line.slice(m.idx + m.marker.length).trimStart()
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
    if (!doc && raw.length > maxCommentLength) push(finding("long-comment", i + 1, [raw]))
    const stripped = stripCommentMarker(t)
    if (!doc && STEP_NUMBERED.test(stripped)) push(finding("vend/step-numbered", i + 1, [raw]))
    if (isDividerLine(t)) push(finding("vend/section-divider", i + 1, [raw]))
    if (!doc && (MARKDOWN_BOLD.test(stripped) || MARKDOWN_LIST.test(stripped) || MARKDOWN_TABLE.test(stripped))) {
      push(finding("vend/markdown-in-comment", i + 1, [raw]))
    }
    if (THIS_OPENER.test(stripped)) push(finding("vend/this-function-opener", i + 1, [raw]))
    if (TODO_WORD.test(t) && !TICKET_REF.test(t) && !ISSUE_LINK.test(t)) push(finding("vend/generic-todo", i + 1, [raw]))
    return weakMarkerHits(raw)
  }
  let runStart = -1
  const classifyRun = makeClassify()
  for (let i = 0; i <= lines.length; i++) {
    const cls = i < lines.length ? classifyRun(lines[i] ?? "") : null
    const inRun = cls !== null && cls.comment && !SUPPRESS_ANY.test(lines[i] ?? "")
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
    if (!classifyHeader(line).comment || SUPPRESS_ANY.test(line)) break
    headerEnd++
  }
  if (headerEnd >= 2 && !isLicenseRun(lines.slice(0, headerEnd))) {
    push(finding("vend/file-summary-header", 1, lines.slice(0, headerEnd)))
  }
  const classifyEach = makeClassify()
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

function readDisk(filePath) {
  try {
    return decodeText(readFileSync(filePath))
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? null : undefined
  }
}

export function addedFromToolArgs(tool, args, opts) {
  const filePath = typeof args.filePath === "string" ? args.filePath : null
  if (filePath === null || !isCodePath(filePath)) return null
  const genExtra = { gitattr: null, cfgPaths: [], scanGenerated: opts?.includeGenerated === true }
  if (isGeneratedFile(filePath, "", genExtra)) return null
  if (tool === "write") {
    if (typeof args.content !== "string" || isGeneratedFile(filePath, args.content, genExtra)) return null
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

function extractPatchDeltas(patchText) {
  const byFile = new Map()
  let currentFile = null
  for (const line of patchText.split(/\r?\n/)) {
    if (line.startsWith("*** Add File: ")) currentFile = line.slice(14).trim()
    else if (line.startsWith("*** Update File: ")) currentFile = line.slice(17).trim()
    else if (line.startsWith("*** Move to: ")) currentFile = line.slice(13).trim()
    else if (line.startsWith("*** Delete File: ")) currentFile = null
    else if (line.startsWith("*** ")) continue
    else if (currentFile !== null && line.startsWith("+")) {
      const list = byFile.get(currentFile) ?? []
      list.push(line.slice(1))
      byFile.set(currentFile, list)
    }
  }
  const out = []
  for (const [filePath, added] of byFile) {
    if (filePath === "" || added.length === 0 || !isCodePath(filePath)) continue
    out.push({ filePath, added })
  }
  return out
}

function toRel(root, absPath) {
  return relative(root, absPath).split(sep).join("/")
}

function isExcludedPath(rel, excludePaths) {
  return excludePaths.some((p) => rel === p || rel.startsWith(p + "/"))
}

function gitListedFiles(root) {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
    return out.split("\0").filter((s) => s !== "")
  } catch {
    return null
  }
}

function collectFiles(paths, root, excludePaths = []) {
  const out = []
  for (const p of paths) {
    const abs = resolve(root, p)
    if (!existsSync(abs)) throw new Error(`slop-gate: путь не существует: ${p}`)
    if (!statSync(abs).isDirectory()) {
      if (profileFor(toRel(root, abs)) !== null && !isExcludedPath(toRel(root, abs), excludePaths)) out.push(abs)
    }
  }
  const listed = gitListedFiles(root)
  if (listed !== null) {
    const prefixes = paths
      .map((p) => resolve(root, p))
      .filter((abs) => existsSync(abs) && statSync(abs).isDirectory())
      .map((abs) => toRel(root, abs))
    for (const rel of listed) {
      if (!isCodePath(rel, [...CLI_SKIPPED_SEGMENTS])) continue
      if (isExcludedPath(rel, excludePaths)) continue
      if (!prefixes.some((p) => p === "" || rel === p || rel.startsWith(p + "/"))) continue
      const abs = join(root, rel)
      if (statSync(abs, { throwIfNoEntry: false })?.isFile() !== true) continue
      out.push(abs)
    }
    return [...new Set(out)].sort()
  }
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!CLI_SKIPPED_SEGMENTS.has(entry.name) && !isExcludedPath(toRel(root, full), excludePaths)) walk(full)
      } else if (isCodePath(toRel(root, full), [...CLI_SKIPPED_SEGMENTS]) && !isExcludedPath(toRel(root, full), excludePaths)) {
        out.push(full)
      }
    }
  }
  for (const p of paths) {
    const abs = resolve(root, p)
    if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs)
  }
  return [...new Set(out)]
}

function readScannable(file) {
  let text
  try {
    text = decodeText(readFileSync(file))
  } catch {
    return null
  }
  if (text.slice(0, 8192).includes("\u0000")) return null
  return text
}

function scanFiles(files, root, options = null, genCtx = null) {
  const findings = []
  for (const file of files) {
    const text = readScannable(file)
    if (text === null) continue
    const rel = toRel(root, file)
    const visible = detectCommentSlop(text.replaceAll("\r\n", "\n").split("\n"), profileFor(file) ?? PROFILES.legacy, false, null, options)
    for (const v of isGeneratedFile(rel, text, genCtx) ? visible.filter((f) => SECURITY_RULES.has(f.rule)) : visible) {
      findings.push({ rel, ...v })
    }
  }
  return findings
}

const FIXABLE_RULES = new Set([
  "multi-line-comment",
  "changelog-marker",
  "vend/section-divider",
  "vend/file-summary-header",
  "vend/step-numbered",
  "vend/zero-width-chars",
  "vend/bidi-controls",
])
const STEP_PREFIX_FIX = /^(?:step\s+\d+|шаг\s+\d+|schritt\s+\d+|étape\s+\d+|paso\s+\d+|\d+\.)\s*[:.、)–—-]?\s*/i
const COMMENT_LEAD_FIX = /^(\s*(?:\/\/+|#+|--+|;+|%+|::+|\.\.+|!|\(\*+|<!--+|\{\{!--?|\{\{!))\s*/
const BLOCK_OPENER = /^(?:\/\*|<!--|<#|\(\*|###|\{\{!--?|\{\{\/\*|-{2}\[\[|\{-|#\[|=#)/
const BIDI_CHARS = new RegExp("[" + CP(0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069) + "]", "g")

// escape-формы невидимых символов — предмет кода (тесты BOM), вырезаются только настоящие символы
function stripBadInvisibles(line, lineIdx) {
  const chars = [...line]
  const out = []
  for (let k = 0; k < chars.length; k++) {
    const cp = chars[k].codePointAt(0)
    if (cp === 0x200d && EMOJI.test(chars[k - 1] ?? "") && EMOJI.test(chars[k + 1] ?? "")) {
      out.push(chars[k])
      continue
    }
    if (cp === 0xfeff && lineIdx === 0 && k === 0 && line.indexOf(FEFF_CHAR, 1) === -1) {
      out.push(chars[k])
      continue
    }
    const bad =
      (cp >= 0x200b && cp <= 0x200f) ||
      cp === 0x2060 ||
      cp === 0xfeff ||
      (cp >= 0x202a && cp <= 0x202e) ||
      (cp >= 0x2066 && cp <= 0x2069)
    if (!bad) out.push(chars[k])
  }
  return out.join("").replace(BIDI_CHARS, "")
}

function planFixes(lines, findings, profile) {
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
    } else if (f.rule === "changelog-marker" || f.rule === "vend/section-divider") {
      const trimmed = raw.trim()
      if (BLOCK_OPENER.test(trimmed)) continue
      const inline = isCommentLine(trimmed, profile) ? null : inlineMarkerAt(raw, profile)
      if (inline !== null) replaced.set(f.lineNo, raw.slice(0, inline.idx).trimEnd())
      else removed.add(f.lineNo)
    } else if (f.rule === "vend/step-numbered") {
      if (!isCommentLine(raw.trim(), profile)) continue
      const stripped = stripCommentMarker(raw.trim())
      const m = STEP_PREFIX_FIX.exec(stripped)
      if (m === null) continue
      const rest = stripped.slice(m[0].length).trim()
      const lead = COMMENT_LEAD_FIX.exec(raw)
      if (rest === "") removed.add(f.lineNo)
      else if (lead !== null) replaced.set(f.lineNo, lead[0] + rest)
    } else if (f.rule === "vend/zero-width-chars" || f.rule === "vend/bidi-controls") {
      const cleaned = stripBadInvisibles(raw, i)
      if (cleaned !== raw) replaced.set(f.lineNo, cleaned)
    }
  }
  // a next-line directive whose target is being deleted would dangle
  for (const k of [...removed]) {
    if (!removed.has(k - 1) && SUPPRESS_NEXT.test(lines[k - 2] ?? "")) removed.add(k - 1)
  }
  return { removed, replaced }
}

function applyPlan(lines, { removed, replaced }) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1
    if (removed.has(ln)) continue
    out.push(replaced.get(ln) ?? lines[i])
  }
  return out
}

function renderFixDiff(rel, lines, { removed, replaced }, context = 2) {
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

function cmdFix(paths, { dryRun = false, strict = false } = {}) {
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
    const visible = applyRuleConfig(detectCommentSlop(lines, profile, false, null, options), config)
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
    const rest = applyRuleConfig(detectCommentSlop(newLines, profile, false, null, options), config)
    for (const f of generated ? rest.filter((f) => SECURITY_RULES.has(f.rule)) : rest) {
      remaining.push({ rel, ...f })
    }
  }
  if (dryRun) {
    for (const d of previews) console.log(d)
    console.log(
      `slop-gate: --fix dry-run: запланировано ${fixedOps} правок в ${fixedFiles} файлах; не чинится автоматически: ${remaining.length}`,
    )
    return 0
  }
  const baseline = loadBaseline(root)
  const fresh = maskBaselined(baseline, remaining)
  printFindings(fresh, "text", strict)
  console.log(`slop-gate: --fix применён: ${fixedOps} правок в ${fixedFiles} файлах`)
  return failsGate(fresh, strict) ? 1 : 0
}

function loadBaseline(root) {
  const path = join(root, "stop-ai-slop.baseline.txt")
  const baseline = { legacy: new Set(), fp: new Set() }
  if (!existsSync(path)) return baseline
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (t === "" || t.startsWith("#")) continue
    if (t.startsWith("fp:")) {
      baseline.fp.add(t.slice(3))
      continue
    }
    if (/^.+:\d+$/.test(t)) baseline.legacy.add(t)
  }
  return baseline
}

function baselineKey(f) {
  return `${f.rel}:${f.lineNo}`
}

function fingerprint(f) {
  return createHash("sha256")
    .update(f.rule + "\n" + f.lines.map((l) => l.trim()).join("\n"))
    .digest("hex")
    .slice(0, 16)
}

function isBaselined(baseline, f) {
  if (baseline.fp.size > 0) return baseline.fp.has(fingerprint(f))
  return baseline.legacy.has(baselineKey(f))
}

function maskBaselined(baseline, findings) {
  if (baseline.fp.size === 0) return findings.filter((f) => !isBaselined(baseline, f))
  const pool = new Map()
  for (const p of baseline.fp) pool.set(p, (pool.get(p) ?? 0) + 1)
  return findings.filter((f) => {
    const p = fingerprint(f)
    const left = pool.get(p) ?? 0
    if (left === 0) return true
    pool.set(p, left - 1)
    return false
  })
}

function writeBaselineFile(root, findings) {
  const seen = new Set()
  const pairs = []
  for (const f of findings) {
    const key = baselineKey(f)
    const fp = fingerprint(f)
    if (seen.has(key + " " + fp)) continue
    seen.add(key + " " + fp)
    pairs.push([key, fp])
  }
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1))
  const lines = ["# slop-gate baseline v2: relpath:line + fp:<hash>"]
  for (const [key, fp] of pairs) lines.push(key, `fp:${fp}`)
  writeFileSync(join(root, "stop-ai-slop.baseline.txt"), lines.join("\n") + "\n")
  return pairs.length
}

function loadConfig(root) {
  const path = join(root, ".stop-ai-slop.yaml")
  if (!existsSync(path)) return null
  const config = { maxCommentLength: null, excludePaths: [], rules: new Map(), scanGenerated: null, generatedPaths: [] }
  const unquote = (v) => {
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1)
    return v
  }
  let section = null
  const lines = readFileSync(path, "utf8").split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const t = raw.trim()
    if (t === "" || t.startsWith("#")) continue
    if ((section === "excludePaths" || section === "generatedPaths") && t.startsWith("-")) {
      const item = unquote(t.slice(1).trim())
      if (item !== "") config[section].push(item.replace(/^\.\//, "").replace(/\/+$/, ""))
      continue
    }
    if (section === "rules" && /^\s/.test(raw)) {
      const m = /^([^:]+):\s*(.*)$/.exec(t)
      if (m !== null) {
        const id = m[1].trim()
        const sev = unquote(m[2].trim())
        if (sev !== "off" && sev !== "warning" && sev !== "error") {
          throw new Error(`slop-gate: ${path}:${i + 1}: недопустимое severity "${sev}" (ожидается off, warning или error)`)
        }
        if (RULE_BY_ID.has(id)) config.rules.set(id, sev)
      }
      continue
    }
    const top = /^(\S[^:]*):\s*(.*)$/.exec(raw)
    if (top === null) {
      section = null
      continue
    }
    const key = top[1].trim()
    const value = unquote(top[2].trim())
    if (key === "maxCommentLength") {
      const n = Number(value)
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`slop-gate: ${path}:${i + 1}: maxCommentLength должен быть положительным целым`)
      }
      config.maxCommentLength = n
      section = null
    } else if (key === "excludePaths") {
      section = "excludePaths"
      if (value !== "") config.excludePaths.push(value.replace(/^\.\//, "").replace(/\/+$/, ""))
    } else if (key === "generatedPaths") {
      section = "generatedPaths"
      if (value !== "") config.generatedPaths.push(value.replace(/^\.\//, "").replace(/\/+$/, ""))
    } else if (key === "scanGenerated") {
      if (value !== "true" && value !== "false") {
        throw new Error(`slop-gate: ${path}:${i + 1}: scanGenerated должен быть true или false`)
      }
      config.scanGenerated = value === "true"
      section = null
    } else if (key === "rules") {
      section = "rules"
    } else if (RULE_BY_ID.has(key)) {
      throw new Error(`slop-gate: ${path}:${i + 1}: "${key}" — id правила; override severity пишется внутри секции rules: с отступом в два пробела`)
    } else {
      section = null
    }
  }
  return config
}

function configOptions(config) {
  return config !== null && config.maxCommentLength !== null ? { maxLength: config.maxCommentLength } : null
}

function applyRuleConfig(findings, config) {
  if (config === null || config.rules.size === 0) return findings
  const out = []
  for (const f of findings) {
    const sev = config.rules.get(f.rule)
    if (sev === undefined) out.push(f)
    else if (sev !== "off") out.push({ ...f, severity: sev })
  }
  return out
}

function sortedFindings(findings) {
  return [...findings].sort((a, b) => (a.rel === b.rel ? a.lineNo - b.lineNo : a.rel < b.rel ? -1 : 1))
}

let toolVersionCache = null
function toolVersion() {
  if (toolVersionCache === null) {
    try {
      toolVersionCache = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8")).version
    } catch {
      toolVersionCache = "0.0.0"
    }
  }
  return toolVersionCache
}

function toRdjson(findings) {
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

function toSarif(findings) {
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

function findingsToText(findings, strict = false) {
  const lines = []
  for (const f of sortedFindings(findings)) {
    const rule = RULE_BY_ID.get(f.rule)
    lines.push(`${f.rel}:${f.lineNo} ${f.rule} [${f.severity}] ${rule.message}`)
    lines.push(`  instead: ${rule.instead}`)
  }
  const errors = findings.filter((f) => f.severity === "error").length
  if (findings.length === 0) lines.push("slop-gate: чисто")
  else if (strict && errors === 0) lines.push(`slop-gate: ${findings.length} находок, ошибок: 0 (warning блокируют из-за --strict)`)
  else lines.push(`slop-gate: ${findings.length} находок, ошибок: ${errors}`)
  return lines.join("\n")
}

function printFindings(findings, format = "text", strict = false) {
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

function cmdScan(paths, { writeBaseline = false, strict = false, prune = false, format = "text" } = {}) {
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
  const findings = applyRuleConfig(scanFiles(files, root, configOptions(config), genContext(root, config)), config)
  if (writeBaseline) {
    const n = writeBaselineFile(root, findings)
    console.log(`slop-gate: baseline записан (${n} записей) -> stop-ai-slop.baseline.txt`)
    return 0
  }
  if (prune) {
    const baseline = loadBaseline(root)
    if (baseline.fp.size > 0) {
      const n = writeBaselineFile(root, findings.filter((f) => baseline.fp.has(fingerprint(f))))
      console.log(`slop-gate: baseline прорежен (${baseline.fp.size - n} записей удалено)`)
      return 0
    }
    const keys = new Set(findings.map(baselineKey))
    const kept = [...baseline.legacy].filter((k) => keys.has(k)).sort()
    const body = ["# slop-gate baseline: relpath:line", ...kept].join("\n") + "\n"
    writeFileSync(join(root, "stop-ai-slop.baseline.txt"), body)
    console.log(`slop-gate: baseline прорежен (${baseline.legacy.size - kept.length} записей удалено)`)
    return 0
  }
  const baseline = loadBaseline(root)
  const fresh = maskBaselined(baseline, findings)
  printFindings(fresh, format, strict)
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

function runDiffGate(diffText, root, strict, format = "text", config = null, genCtx = null) {
  const findings = []
  const excludePaths = config?.excludePaths ?? []
  const options = configOptions(config)
  for (const [file, lines] of parseUnifiedDiff(diffText)) {
    if (!isCodePath(file, [...CLI_SKIPPED_SEGMENTS])) continue
    if (isExcludedPath(file, excludePaths)) continue
    const disk = readDisk(join(root, file))
    if (typeof disk === "string" && disk.slice(0, 8192).includes("\u0000")) continue
    const fileIds = fileSuppressIds(lines.map((l) => l.text))
    const visible = []
    for (const run of consecutiveRuns(lines)) {
      for (const v of detectCommentSlop(run.map((r) => r.text), profileFor(file) ?? PROFILES.legacy, true, fileIds, options)) {
        visible.push({ rel: file, ...v, lineNo: run[0].lineNo + v.lineNo - 1 })
      }
    }
    const genText = typeof disk === "string" ? disk : lines.map((l) => l.text).join("\n")
    for (const v of isGeneratedFile(file, genText, genCtx) ? visible.filter((f) => SECURITY_RULES.has(f.rule)) : visible) {
      findings.push(v)
    }
  }
  const baseline = loadBaseline(root)
  const fresh = maskBaselined(baseline, applyRuleConfig(findings, config))
  printFindings(fresh, format, strict)
  return failsGate(fresh, strict) ? 1 : 0
}

function cmdStaged(strict = false, format = "text") {
  const root = gitToplevel(process.cwd())
  let config
  try {
    config = loadConfig(root)
  } catch (error) {
    console.error(error.message)
    return 2
  }
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
  return runDiffGate(diff, root, strict, format, config, genContext(root, config))
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

function cmdDiff(ref, strict = false, format = "text") {
  const root = gitToplevel(process.cwd())
  let config
  try {
    config = loadConfig(root)
  } catch (error) {
    console.error(error.message)
    return 2
  }
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
  return runDiffGate(diff, root, strict, format, config, genContext(root, config))
}

function explainText(ruleId) {
  const rule = RULE_BY_ID.get(ruleId)
  if (rule === undefined) return null
  return [
    `${rule.id} [${rule.severity}]`,
    `Message: ${rule.message}`,
    `Why: ${rule.why}`,
    `Instead of: ${rule.instead}`,
    `Write: ${rule.write}`,
    `Ignore it when: ${rule.ignoreWhen}`,
  ].join("\n")
}

function cmdExplain(ruleId) {
  const text = explainText(ruleId)
  if (text === null) {
    console.error(`slop-gate: неизвестное правило "${ruleId}". Известные: ${RULES.map((r) => r.id).join(", ")}`)
    return 2
  }
  console.log(text)
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
    const had = Object.prototype.hasOwnProperty.call(pkg.scripts, "stop-ai-slop")
    pkg.scripts["stop-ai-slop"] = stagedCmd
    pkg.scripts["stop-ai-slop:all"] = allCmd
    if (JSON.stringify(pkg.scripts) === before) console.log("slop-gate: package.json — scripts уже на месте")
    else {
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
      console.log(`slop-gate: package.json — ${had ? "обновлены" : "добавлены"} scripts.stop-ai-slop и scripts.stop-ai-slop:all`)
    }
  } else {
    console.log("slop-gate: package.json не найден — npm scripts пропущены")
  }
  const gitDir = join(root, ".git")
  if (!existsSync(gitDir)) {
    console.log("slop-gate: .git не найден — pre-commit hook пропущен")
    return 0
  }
  let hooksDir = join(gitDir, "hooks")
  try {
    const configured = execFileSync("git", ["config", "core.hooksPath"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
    if (configured !== "") hooksDir = resolve(root, configured)
  } catch {
    hooksDir = join(gitDir, "hooks")
  }
  mkdirSync(hooksDir, { recursive: true })
  const hookPath = join(hooksDir, "pre-commit")
  const MARK = "# >>> slop-gate >>>"
  const block = `${MARK}\nif [ ! -f "${abs}" ]; then\n  echo "slop-gate: сканер не найден: ${abs} — запустите --install заново" >&2\n  exit 2\nfi\n${stagedCmd}\n# <<< slop-gate <<<\n`
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

function cmdInstallHooks() {
  const root = process.cwd()
  const abs = fileURLToPath(import.meta.url).split(sep).join("/")
  const command = `node "${abs}" --pre-tool`
  const matcher = "Write|Edit|MultiEdit|write_file|replace|apply_patch"
  const mergeHook = (rel, entry, nested) => {
    const file = join(root, rel)
    let obj = {}
    if (existsSync(file)) {
      try {
        obj = JSON.parse(readFileSync(file, "utf8"))
      } catch {
        console.log(`slop-gate: ${rel} — не JSON, пропущен`)
        return
      }
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) obj = {}
    const box = nested ? (obj.hooks = typeof obj.hooks === "object" && obj.hooks !== null && !Array.isArray(obj.hooks) ? obj.hooks : {}) : obj
    const list = Array.isArray(box.PreToolUse) ? box.PreToolUse : (box.PreToolUse = [])
    const idx = list.findIndex((e) => Array.isArray(e?.hooks) && e.hooks.some((h) => typeof h?.command === "string" && h.command.includes("--pre-tool")))
    if (idx === -1) {
      list.push(entry)
      console.log(`slop-gate: ${rel} — хук добавлен`)
    } else {
      list[idx] = entry
      console.log(`slop-gate: ${rel} — хук обновлён`)
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(obj, null, 2) + "\n")
  }
  mergeHook(".codex/hooks.json", { matcher, hooks: [{ type: "command", command }] }, true)
  mergeHook(".devin/hooks.v1.json", { hooks: [{ type: "command", command }] }, false)
  const vscodeRel = ".github/hooks/stop-ai-slop.json"
  const vscodeFile = join(root, vscodeRel)
  const vscodeData = JSON.stringify({ hooks: { PreToolUse: [{ type: "command", command, timeout: 30 }] } }, null, 2) + "\n"
  const prev = existsSync(vscodeFile) ? readFileSync(vscodeFile, "utf8") : null
  mkdirSync(dirname(vscodeFile), { recursive: true })
  if (prev !== vscodeData) writeFileSync(vscodeFile, vscodeData)
  console.log(`slop-gate: ${vscodeRel} — ${prev === null ? "создан" : prev === vscodeData ? "уже на месте" : "обновлён"}`)
  console.log("slop-gate: добавьте в .gemini/settings.json:")
  console.log(`"hooks": ${JSON.stringify({ BeforeTool: [{ matcher: "write_file|replace", hooks: [{ type: "command", command: "npx stop-ai-slop --pre-tool", timeout: 60000 }] }] }, null, 2)}`)
  console.log("slop-gate: добавьте в .qwen/settings.json:")
  console.log(`"hooks": ${JSON.stringify({ PreToolUse: [{ matcher: "write_file|replace", hooks: [{ type: "command", command: "npx stop-ai-slop --pre-tool" }] }] }, null, 2)}`)
  return 0
}

export function generateRulesContent() {
  const lines = [
    "# stop-ai-slop — политика комментариев",
    "",
    "Комментарий — максимум одна строка и только неочевидное внешнее ограничение, инвариант или воркэраунд. Пересказ диффа живёт в коммите, WHY теста — в его имени.",
    "",
    "## Правила",
    "",
  ]
  for (const rule of RULES) {
    lines.push(`- \`${rule.id}\` (${rule.severity}): ${rule.message}${rule.instead ? ` Вместо: ${rule.instead}` : ""}`)
  }
  lines.push("", "## Проверка", "", "npx stop-ai-slop scan . — полный скан; npx stop-ai-slop --staged — только staged-строки.")
  return lines.join("\n") + "\n"
}

function cmdInstallRules() {
  const root = process.cwd()
  const body = generateRulesContent()
  const hashMarker = "# stop-ai-slop generated rules"
  const generatedMarker = "Generated by stop-ai-slop"
  const blockOpen = "<!-- >>> stop-ai-slop >>> -->"
  const blockClose = "<!-- <<< stop-ai-slop <<< -->"
  const writeTarget = (rel, content, marker) => {
    const file = join(root, rel)
    const prev = existsSync(file) ? readFileSync(file, "utf8") : null
    if (prev !== null && marker !== null && prev.split("\n")[0] !== marker) {
      console.log(`slop-gate: ${rel} — пропущен (чужой контент)`)
      return
    }
    if (prev === content) {
      console.log(`slop-gate: ${rel} — уже на месте`)
      return
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
    console.log(`slop-gate: ${rel} — ${prev === null ? "создан" : "обновлён"}`)
  }
  writeTarget(".cursor/rules/stop-ai-slop.mdc", `---\ndescription: stop-ai-slop — политика комментариев: одна строка, только WHY\nglobs: "**/*"\nalwaysApply: true\n---\n\n${body}`, null)
  writeTarget(".windsurfrules", `${hashMarker}\n${body}`, hashMarker)
  writeTarget("CONVENTIONS.md", `${generatedMarker}\n\n${body}`, generatedMarker)
  writeTarget(".clinerules", `${hashMarker}\n${body}`, hashMarker)
  writeTarget(".devin/rules/stop-ai-slop.md", `${generatedMarker}\n\n${body}`, null)
  const copilotRel = ".github/copilot-instructions.md"
  const copilotFile = join(root, copilotRel)
  const block = `${blockOpen}\n# stop-ai-slop\n\n${body}${blockClose}\n`
  const prevCopilot = existsSync(copilotFile) ? readFileSync(copilotFile, "utf8") : null
  if (prevCopilot === null) {
    mkdirSync(dirname(copilotFile), { recursive: true })
    writeFileSync(copilotFile, block)
    console.log(`slop-gate: ${copilotRel} — создан`)
  } else {
    const open = prevCopilot.indexOf(blockOpen)
    const close = prevCopilot.indexOf(blockClose)
    const next =
      open !== -1 && close > open
        ? prevCopilot.slice(0, open) + block.trimEnd() + prevCopilot.slice(close + blockClose.length)
        : prevCopilot.replace(/\n*$/, "\n\n") + block
    if (next === prevCopilot) {
      console.log(`slop-gate: ${copilotRel} — уже на месте`)
    } else {
      writeFileSync(copilotFile, next)
      console.log(`slop-gate: ${copilotRel} — обновлён`)
    }
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
    writeFileSync(join(dir, "md-table.ts"), "// | col a | col b |\nconst x = 1\n")
    writeFileSync(join(dir, "md-pipe.ts"), "// |flag| принимает значение\nconst x = 1\n")
    writeFileSync(join(dir, "opener.ts"), "// This function normalizes the payload\nconst x = 1\n")
    writeFileSync(join(dir, "todo.ts"), "// TODO fix this later\nconst x = 1\n")
    writeFileSync(join(dir, "inline.ts"), "const x = 1 // было так, стало иначе\n")
    writeFileSync(join(dir, "block.ts"), "/* removeSource rewrites every row\nwith fresh uuids all vanish at once\nand incremental has no centroids left */\nconst x = 1\n")
    writeFileSync(join(dir, "docstring.py"), 'def f():\n    """This function normalizes the payload\n    and validates input\n    """\n    return 1\n')
    writeFileSync(join(dir, "zwsp.ts"), "// было, с" + CP(0x200b) + "тало иначе\nconst x = 1\n")
    writeFileSync(
      join(dir, "utf16.ts"),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("// было так, стало иначе\nconst x = 1\n", "utf16le")]),
    )
    writeFileSync(
      join(dir, "utf16be.ts"),
      Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from("// было так, стало иначе\nconst x = 1\n", "utf16le").swap16()]),
    )
    writeFileSync(join(dir, "supp.ts"), "// stop-ai-slop-ignore-next-line changelog-marker\n// стало иначе\nconst x = 1\n")
    writeFileSync(join(dir, "suppfile.ts"), "// stop-ai-slop-ignore-file\n// стало иначе\n// и ещё было\nconst x = 1\n")
    writeFileSync(join(dir, "supp2.ts"), "// stop-ai-slop-ignore-next-line -- было легаси\n// стало иначе\nconst x = 1\n")
    writeFileSync(
      join(dir, "jsdoc-doc.ts"),
      [
        "/**",
        " * Validates and normalizes the incoming payload.",
        " * Throws ValidationError on contract breach; caller must not retry.",
        " * @param raw untrusted input from transport",
        " */",
        "export function normalize(raw) {}",
        "",
      ].join("\n"),
    )
    writeFileSync(join(dir, "doclong.py"), 'def f(raw):\n    """' + "x".repeat(130) + '\n    """\n    return raw\n')
    writeFileSync(
      join(dir, "jsdoc-slop.ts"),
      [
        "/**",
        " * Pruning to empty is not maintenance - the identity mapping broke, so recompute takes over.",
        " */",
        "export function prune() {}",
        "",
      ].join("\n"),
    )
    writeFileSync(join(dir, "jsdoc-opener.ts"), "/** This function normalizes the payload */\nexport function normalize() {}\n")
    writeFileSync(join(dir, "kotlin.kt"), "// removeSource rewrites every symbol row\n// with fresh uuids so zones vanish at once\nfun main() {}\n")
    writeFileSync(join(dir, "cproc.c"), "#include <a.h>\n#include <b.h>\nint main(void) { return 0; }\n")
    writeFileSync(join(dir, "rustattr.rs"), "#[derive(Debug)]\n#[derive(Clone)]\nstruct S;\n")
    const langFixtures = {
      "q.sql": "-- removeSource rewrites rows\n-- with fresh uuids zones vanish\nSELECT 1;\n",
      "p.html": "<!-- removeSource rewrites rows\nwith fresh uuids zones vanish\n-->\n<p>x</p>\n",
      "r.sh": "# removeSource rewrites rows\n# with fresh uuids zones vanish\necho 1\n",
      "c.yaml": "# removeSource rewrites rows\n# with fresh uuids zones vanish\nkey: 1\n",
      "core.clj": "; removeSource rewrites rows\n; with fresh uuids zones vanish\n(def x 1)\n",
      "d.tex": "% removeSource rewrites rows\n% with fresh uuids zones vanish\n\\x\n",
      "j.bat": ":: removeSource rewrites rows\n:: with fresh uuids zones vanish\necho 1\n",
      "m.ps1": "<# removeSource rewrites rows\nwith fresh uuids zones vanish\n#>\n$x = 1\n",
      "l.lua": "--[[ removeSource rewrites rows\nwith fresh uuids zones vanish\n]]\nlocal x = 1\n",
      "o.ml": "(* removeSource rewrites rows\nwith fresh uuids zones vanish\n*)\nlet x = 1\n",
      "h.hs": "{- removeSource rewrites rows\nwith fresh uuids zones vanish\n-}\nmain = return ()\n",
      "n.f90": "! removeSource rewrites rows\n! with fresh uuids zones vanish\nprogram p\nend\n",
      Dockerfile: "# removeSource rewrites rows\n# with fresh uuids zones vanish\nRUN true\n",
      "notes.md": "<!-- removeSource rewrites rows\nwith fresh uuids zones vanish\n-->\ntext\n",
      "a.ini": "; removeSource rewrites rows\n; with fresh uuids zones vanish\nk=1\n",
      "e.erl": "% removeSource rewrites rows\n% with fresh uuids zones vanish\nmod(x) -> x.\n",
      Containerfile: "# removeSource rewrites rows\n# with fresh uuids zones vanish\nRUN true\n",
      "w.bzl": "# removeSource rewrites rows\n# with fresh uuids zones vanish\nx = 1\n",
      "g.feature": "# removeSource rewrites rows\n# with fresh uuids zones vanish\nFeature: x\n",
      "go.mod": "# removeSource rewrites rows\n# with fresh uuids zones vanish\nmodule x\n",
      "doc.rst": ".. removeSource rewrites rows\n.. with fresh uuids zones vanish\nx\n",
      "Info.plist": "<!-- removeSource rewrites rows\nwith fresh uuids zones vanish\n-->\n<x/>\n",
      "t.tmpl": "{{/*\nremoveSource rewrites rows\nwith fresh uuids zones vanish\n*/}}\nx\n",
      "v.vhd": "-- removeSource rewrites rows\n-- with fresh uuids zones vanish\nx\n",
      "e.elm": "-- removeSource rewrites rows\n-- with fresh uuids zones vanish\nx = 1\n",
      "pk.nix": "# removeSource rewrites rows\n# with fresh uuids zones vanish\nx = 1\n",
      "a.coffee": "###\nremoveSource rewrites rows\nwith fresh uuids zones vanish\n###\nx\n",
      "d.adoc": "////\nremoveSource rewrites rows\nwith fresh uuids zones vanish\n////\nx\n",
      "h.hbs": "{{!--\nremoveSource rewrites rows\nwith fresh uuids zones vanish\n--}}\nx\n",
      "t.tpl": "{{/*\nremoveSource rewrites rows\nwith fresh uuids zones vanish\n*/}}\nx\n",
      "m.mts": "// removeSource rewrites rows\n// with fresh uuids zones vanish\nconst x = 1\n",
      "s.sol": "// removeSource rewrites rows\n// with fresh uuids zones vanish\ncontract X {}\n",
      "meson.build": "# removeSource rewrites rows\n# with fresh uuids zones vanish\nproject('x')\n",
      ".env": "# removeSource rewrites rows\n# with fresh uuids zones vanish\nX=1\n",
      BUILD: "# removeSource rewrites rows\n# with fresh uuids zones vanish\nx\n",
    }
    for (const [name, body] of Object.entries(langFixtures)) writeFileSync(join(dir, name), body)
    writeFileSync(join(dir, "inline.sql"), "SELECT 1 -- было так, стало иначе\n")
    writeFileSync(join(dir, "inlinepy.py"), "x = y // было так\n")
    writeFileSync(join(dir, "inline.lua"), "local x = 1 -- было так, стало иначе\n")
    writeFileSync(join(dir, "inlinefs.fs"), "let f x = x // было так\n")
    writeFileSync(join(dir, "inline.tex"), "\\section{a} % было так, стало иначе\n")
    writeFileSync(join(dir, "inline.clj"), "(def x 1) ; было так, стало иначе\n")
    writeFileSync(join(dir, "inline.f90"), "x = 1 ! было так, стало иначе\n")
    writeFileSync(join(dir, "inline.ini"), "key=1 ; было так, стало иначе\n")
    writeFileSync(join(dir, "Dockerfile.dev"), "# removeSource rewrites rows\n# with fresh uuids zones vanish\nRUN true\n")
    writeFileSync(join(dir, "Makefile.am"), "# removeSource rewrites rows\n# with fresh uuids zones vanish\nall:\n")
    writeFileSync(join(dir, "ru-ok.ts"), "// осталось реализовать\nconst x = 1\n")
    writeFileSync(join(dir, "ru-bad.ts"), "// было иначе, стало так\nconst x = 1\n")
    writeFileSync(join(dir, "lic.ts"), "/*\n * Copyright (c) 2024 Foo Inc.\n * All rights reserved.\n */\nconst x = 1\n")
    writeFileSync(join(dir, "lic2.ts"), "/*\n * Copyright (c) 2024 Foo Inc.\n * Pruning is not maintenance - the mapping broke, so recompute takes over.\n */\nconst x = 1\n")
    writeFileSync(join(dir, "stub.pyi"), 'def f(raw):\n    """This function normalizes the payload\n    """\n    return raw\n')
    writeFileSync(join(dir, "step-py.py"), "# Step 3: normalize the payload\nx = 1\n")
    writeFileSync(join(dir, "ru-opener.ts"), "// Эта функция нормализует полезную нагрузку\nconst x = 1\n")
    writeFileSync(join(dir, "ru-step.yaml"), "# Шаг 3: нормализация\nkey: 1\n")
    writeFileSync(
      join(dir, "sabotage-de.ts"),
      "// Früher war das Verhalten anders, stattdessen lesen wir den Cache\n// Diese Funktion normalisiert die Nutzlast\nconst x = 1\n",
    )
    writeFileSync(join(dir, "sabotage-fr.ts"), "// auparavant au lieu de recalculer, on lit le cache\n// Cette fonction normalise la charge\nconst x = 1\n")
    writeFileSync(join(dir, "sabotage-es.ts"), "// anteriormente en lugar de recalcular, leemos la caché\n// Esta función normaliza la carga\nconst x = 1\n")
    writeFileSync(join(dir, "de-step.ts"), "// Schritt 3: Nutzlast normalisieren\nconst x = 1\n")
    writeFileSync(join(dir, "fr-step.py"), "# Étape 3 : normaliser la charge\nx = 1\n")
    writeFileSync(join(dir, "es-step.yaml"), "# Paso 3: normalizar\nkey: 1\n")
    writeFileSync(join(dir, "de-ok.ts"), "// vorher prüfen, ob der Slot frei ist\nconst x = 1\n")
    writeFileSync(join(dir, "fr-ok.ts"), "// avant de valider, vérifier le jeton\nconst x = 1\n")
    writeFileSync(join(dir, "es-ok.ts"), "// ejecutar antes de guardar\nconst x = 1\n")
    writeFileSync(join(dir, "de-ok2.ts"), "// das frühere Verhalten bleibt gültig\nconst x = 1\n")
    writeFileSync(join(dir, "cjk.ts"), "const TAB_LABEL = {\n  " + CP(0x56db, 0x4e2a, 0x4eba) + "features: 'Функции',\n}\n")
    writeFileSync(join(dir, "cjk-ok.ts"), "// " + CP(0x7528, 0x6237) + "ID должен совпадать с токеном\nconst userId = 'x'\n")
    writeFileSync(join(dir, "cjk-i18n.ts"), "const LABELS = { ok: '" + CP(0x786e, 0x5b9a) + "', cancel: '" + CP(0x53d6, 0x6d88) + "' }\n")
    writeFileSync(join(dir, "zw.ts"), "const value = '" + CP(0x200b) + "test" + CP(0x200c) + "'\n")
    writeFileSync(join(dir, "zw-escape.ts"), "const value = '" + CP(0x5c) + "u200Btest'\n")
    writeFileSync(join(dir, "zwj-ok.ts"), "const family = '" + CP(0x1f468) + CP(0x200d) + CP(0x1f469) + CP(0x200d) + CP(0x1f467) + "'\n")
    writeFileSync(join(dir, "bidi.ts"), "const url = '" + CP(0x202e) + "reversed.com'\n")
    writeFileSync(join(dir, "bidi-escape.ts"), "const url = '" + CP(0x5c) + "u202Ereversed.com'\n")
    writeFileSync(join(dir, "supp-uni.ts"), "// stop-ai-slop-ignore-next-line vend/zero-width-chars\nconst a = '" + CP(0x200b) + "'\n")
    writeFileSync(join(dir, "supp-uni-file.ts"), "// stop-ai-slop-ignore-file vend/bidi-controls\nconst u = '" + CP(0x202e) + "'\n")
    writeFileSync(
      join(dir, "doc-md.ts"),
      ["/**", " * Contract of the payload normalizer.", " * - item", " * **bold**", " */", "export function normalize() {}", ""].join("\n"),
    )
    writeFileSync(join(dir, "build.gradle"), "// removeSource rewrites rows\n// with fresh uuids zones vanish\nplugins {}\n")
    writeFileSync(join(dir, "wasnow.ts"), "const x = 1 // was 2, now 1\n")
    writeFileSync(join(dir, "wasnow-ok.ts"), "// timeout was raised because now() is monotonic here\nconst x = 1\n")
    writeFileSync(join(dir, "case-label.ts"), "switch (x) {\n  case 1: // было 2, стало 1\n    break\n}\n")
    writeFileSync(join(dir, "header.ts"), "// Payload normalizer for the ingest pipe.\n// Wire format lives in docs/ingest.md.\nexport function normalize() {}\n")
    writeFileSync(
      join(dir, "dartdoc.dart"),
      "/// Provider for the [Dio] instance.\n///\n/// - baseUrl from config\n/// - Bearer token interceptor with a very long description ".padEnd(140, "x") + "\nfinal dio = 1\n",
    )
    writeFileSync(join(dir, "dartdoc-slop.dart"), "/// Раньше считали синхронно, теперь читаем кэш\nfinal x = 1\n")
    writeFileSync(join(dir, "changelog-single.ts"), "// instead of manual steps, one command\nconst x = 1\n")
    writeFileSync(join(dir, "models.g.dart"), narrative + "\nfinal x = 1\n")
    writeFileSync(join(dir, "genheader.ts"), "// Code generated by tool. DO NOT EDIT.\n// line one of a narrative\n// line two of a narrative\nconst x = 1\n")
    writeFileSync(join(dir, "pgdump.sql"), "-- PostgreSQL database dump\n-- Dumped by pg_dump version 16\n-- narrative line one\n-- narrative line two\nSELECT 1;\n")
    writeFileSync(join(dir, "lit.yaml"), "description: |\n  ## Changelog\n  - Initial release\n  - Chat management\nkey: 1\n")
    writeFileSync(join(dir, "bin.ts"), Buffer.concat([Buffer.from("// было иначе, стало так\n"), Buffer.from([0]), Buffer.from("\nconst x = 1\n")]))
    writeFileSync(join(dir, "cjk.md"), "AI" + CP(0x3067) + CP(0x5f37) + CP(0x5316) + "された team\n")
    writeFileSync(join(dir, "api_pb2.py"), "# первая строка блока\n# вторая строка блока\nx = 1\n")
    writeFileSync(join(dir, "hand.ts"), "// Code generated by foo v1. DO NOT EDIT.\n// первая строка блока\n// вторая строка блока\nconst x = 1\n")
    writeFileSync(join(dir, "weirdtool.ts"), "// generated by internal tool\n// do not edit\n// первая строка блока\n// вторая строка блока\nconst x = 1\n")
    writeFileSync(join(dir, "policy.ts"), "// DO NOT EDIT\n// первая строка блока\n// вторая строка блока\nconst x = 1\n")
    writeFileSync(join(dir, "models2.g.dart"), "// первая строка блока\n// вторая строка блока\nconst x = '" + CP(0x200b) + "'\n")
    writeFileSync(join(dir, ".gitattributes"), "*.gen2.ts linguist-generated\n")
    writeFileSync(join(dir, "a.gen2.ts"), "// первая строка блока\n// вторая строка блока\nconst x = 1\n")
    const findings = scanFiles(collectFiles([dir], dir), dir, null, { gitattr: loadGitattributesGenerated(dir), cfgPaths: [], scanGenerated: false })
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
    check(
      "md-table: строка таблицы → vend/markdown-in-comment [warning]",
      byRel("md-table.ts").some((f) => f.rule === "vend/markdown-in-comment"),
      byRel("md-table.ts"),
    )
    check("md-pipe: «|flag|» в прозе не флагается, находок нет", byRel("md-pipe.ts").length === 0, byRel("md-pipe.ts"))
    check("opener: vend/this-function-opener [warning]", byRel("opener.ts").some((f) => f.rule === "vend/this-function-opener"), byRel("opener.ts"))
    check("todo: vend/generic-todo [warning]", byRel("todo.ts").some((f) => f.rule === "vend/generic-todo"), byRel("todo.ts"))
    check("inline: changelog-marker в trailing-комменте [error]", byRel("inline.ts").some((f) => f.rule === "changelog-marker"), byRel("inline.ts"))
    check("wasnow: EN-пара was…, now… [error]", byRel("wasnow.ts").some((f) => f.rule === "changelog-marker"), byRel("wasnow.ts"))
    check("wasnow-ok: «was raised because now()» без запятой не матчится", byRel("wasnow-ok.ts").length === 0, byRel("wasnow-ok.ts"))
    check("case-label: inline-комментарий после case-label [error]", byRel("case-label.ts").some((f) => f.rule === "changelog-marker"), byRel("case-label.ts"))
    check("header: vend/file-summary-header [warning]", byRel("header.ts").some((f) => f.rule === "vend/file-summary-header"), byRel("header.ts"))
    check("dartdoc: /// doc-ран не даёт multi-line/long/markdown", byRel("dartdoc.dart").length === 0, byRel("dartdoc.dart"))
    check(
      "dartdoc-slop: пара маркеров внутри /// блокируется [error]",
      byRel("dartdoc-slop.dart").some((f) => f.rule === "changelog-marker"),
      byRel("dartdoc-slop.dart"),
    )
    check("changelog-single: одиночный слабый маркер — проза, не блокируется", byRel("changelog-single.ts").length === 0, byRel("changelog-single.ts"))
    check("generated: *.g.dart пропускается целиком", byRel("models.g.dart").length === 0, byRel("models.g.dart"))
    check("generated: шапка DO NOT EDIT пропускает файл", byRel("genheader.ts").length === 0, byRel("genheader.ts"))
    check(
      "gen: pg_dump-дамп без codegen-маркера больше не эксемптится [error]",
      byRel("pgdump.sql").some((f) => f.rule === "multi-line-comment"),
      byRel("pgdump.sql"),
    )
    check("gen-name: *_pb2.py без шапки эксемптится", byRel("api_pb2.py").length === 0, byRel("api_pb2.py"))
    check("gen-header-strict: tool-named шапка эксемптится", byRel("hand.ts").length === 0, byRel("hand.ts"))
    check("gen-header-lax: generated+do-not-edit эксемптится", byRel("weirdtool.ts").length === 0, byRel("weirdtool.ts"))
    check(
      "gen-not-exempt: голый DO NOT EDIT не эксемптит [error]",
      byRel("policy.ts").some((f) => f.rule === "multi-line-comment"),
      byRel("policy.ts"),
    )
    const genSec = byRel("models2.g.dart")
    check(
      "gen-security: zero-width в сгенерированном файле живёт, slop эксемптится",
      genSec.some((f) => f.rule === "vend/zero-width-chars") && !genSec.some((f) => f.rule === "multi-line-comment"),
      genSec,
    )
    check("gen-gitattr: linguist-generated в .gitattributes эксемптит", byRel("a.gen2.ts").length === 0, byRel("a.gen2.ts"))
    check("yaml-literal: контент block scalar не комментарий", byRel("lit.yaml").length === 0, byRel("lit.yaml"))
    check("binary: NUL в первых 8КБ — файл пропускается", byRel("bin.ts").length === 0, byRel("bin.ts"))
    check("cjk-md: CJK+латиница в prose-файле не флагается", byRel("cjk.md").length === 0, byRel("cjk.md"))
    check("block: /* */ без * на средних строках [error]", byRel("block.ts").some((f) => f.rule === "multi-line-comment"), byRel("block.ts"))
    check(
      "docstring: vend/this-function-opener [warning]",
      byRel("docstring.py").some((f) => f.rule === "vend/this-function-opener" && f.severity === "warning"),
      byRel("docstring.py"),
    )
    check("zwsp: changelog-marker сквозь zero-width [error]", byRel("zwsp.ts").some((f) => f.rule === "changelog-marker"), byRel("zwsp.ts"))
    check("utf16: changelog-marker в UTF-16 файле [error]", byRel("utf16.ts").some((f) => f.rule === "changelog-marker"), byRel("utf16.ts"))
    check("utf16be: changelog-marker в UTF-16BE файле [error]", byRel("utf16be.ts").some((f) => f.rule === "changelog-marker"), byRel("utf16be.ts"))
    check("supp: ignore-next-line гасит changelog-marker", !byRel("supp.ts").some((f) => f.rule === "changelog-marker"), byRel("supp.ts"))
    check("supp: ignore-file гасит всё", byRel("suppfile.ts").length === 0, byRel("suppfile.ts"))
    check("supp: директива с причиной не флагает сама себя", byRel("supp2.ts").length === 0, byRel("supp2.ts"))
    check("jsdoc: контрактный JSDoc не блокируется", !byRel("jsdoc-doc.ts").some((f) => f.severity === "error"), byRel("jsdoc-doc.ts"))
    check("doclong: длинная строка docstring не блокируется", !byRel("doclong.py").some((f) => f.rule === "long-comment"), byRel("doclong.py"))
    check(
      "jsdoc-slop: чейнджлог внутри JSDoc блокируется",
      byRel("jsdoc-slop.ts").some((f) => f.rule === "changelog-marker" && f.severity === "error"),
      byRel("jsdoc-slop.ts"),
    )
    check(
      "jsdoc-opener: пересказ сигнатуры в JSDoc [warning]",
      byRel("jsdoc-opener.ts").some((f) => f.rule === "vend/this-function-opener"),
      byRel("jsdoc-opener.ts"),
    )
    check("kotlin: slop в .kt блокируется [error]", byRel("kotlin.kt").some((f) => f.severity === "error"), byRel("kotlin.kt"))
    check("cproc: препроцессор C не комментарий", byRel("cproc.c").length === 0, byRel("cproc.c"))
    check("rustattr: атрибуты Rust не комментарий", byRel("rustattr.rs").length === 0, byRel("rustattr.rs"))
    for (const name of Object.keys(langFixtures)) {
      check(
        `lang ${name}: slop-блок блокируется [error]`,
        byRel(name).some((f) => f.rule === "multi-line-comment" && f.severity === "error"),
        byRel(name),
      )
    }
    const fileScan = runCli(["scan", join(dir, "sabotage.ts")], dir)
    check(
      "scan-file: явный путь к файлу сканируется [exit 1]",
      fileScan.status === 1 && fileScan.out.includes("multi-line-comment") && !fileScan.out.includes("ReferenceError"),
      `exit ${fileScan.status}: ${fileScan.out.slice(0, 200)}`,
    )
    const fileClean = runCli(["scan", join(dir, "clean.ts")], dir)
    check("scan-file: чистый файл по явному пути [exit 0]", fileClean.status === 0, `exit ${fileClean.status}: ${fileClean.out}`)
    check("inline sql: changelog-marker в -- комментарии [error]", byRel("inline.sql").some((f) => f.rule === "changelog-marker"), byRel("inline.sql"))
    check("inline lua: changelog-marker в -- комментарии [error]", byRel("inline.lua").some((f) => f.rule === "changelog-marker"), byRel("inline.lua"))
    check("inline tex: changelog-marker в % комментарии [error]", byRel("inline.tex").some((f) => f.rule === "changelog-marker"), byRel("inline.tex"))
    check("inline clj: changelog-marker в ; комментарии [error]", byRel("inline.clj").some((f) => f.rule === "changelog-marker"), byRel("inline.clj"))
    check("inline f90: changelog-marker в ! комментарии [error]", byRel("inline.f90").some((f) => f.rule === "changelog-marker"), byRel("inline.f90"))
    check("inline ini: changelog-marker в ; комментарии [error]", byRel("inline.ini").some((f) => f.rule === "changelog-marker"), byRel("inline.ini"))
    check("inline py: // — это floor division, не комментарий", byRel("inlinepy.py").length === 0, byRel("inlinepy.py"))
    check("inline fs: // — это целочисленное деление, не комментарий", byRel("inlinefs.fs").length === 0, byRel("inlinefs.fs"))
    check("fname: Dockerfile.dev сканируется [error]", byRel("Dockerfile.dev").some((f) => f.severity === "error"), byRel("Dockerfile.dev"))
    check("fname: Makefile.am сканируется [error]", byRel("Makefile.am").some((f) => f.severity === "error"), byRel("Makefile.am"))
    check("ru-ok: «осталось» не матчится как «стало»", byRel("ru-ok.ts").length === 0, byRel("ru-ok.ts"))
    check("ru-bad: пара «было…стало» блокируется [error]", byRel("ru-bad.ts").some((f) => f.rule === "changelog-marker"), byRel("ru-bad.ts"))
    check("lic: лицензионная шапка не блокируется multi-line-comment", !byRel("lic.ts").some((f) => f.rule === "multi-line-comment"), byRel("lic.ts"))
    check("lic: лицензионная шапка не даёт file-summary-header", !byRel("lic.ts").some((f) => f.rule === "vend/file-summary-header"), byRel("lic.ts"))
    check(
      "lic2: чейнджлог внутри лицензионной шапки блокируется",
      byRel("lic2.ts").some((f) => f.rule === "changelog-marker" && f.severity === "error"),
      byRel("lic2.ts"),
    )
    check(
      "pyi: docstring-опенер [warning], без error",
      byRel("stub.pyi").some((f) => f.rule === "vend/this-function-opener") && !byRel("stub.pyi").some((f) => f.severity === "error"),
      byRel("stub.pyi"),
    )
    check(
      "step-py: vend/step-numbered в #-языке [warning]",
      byRel("step-py.py").some((f) => f.rule === "vend/step-numbered" && f.severity === "warning"),
      byRel("step-py.py"),
    )
    check(
      "ru-opener: «Эта функция» → vend/this-function-opener [warning]",
      byRel("ru-opener.ts").some((f) => f.rule === "vend/this-function-opener"),
      byRel("ru-opener.ts"),
    )
    check(
      "ru-step: «Шаг N» → vend/step-numbered [warning]",
      byRel("ru-step.yaml").some((f) => f.rule === "vend/step-numbered" && f.severity === "warning"),
      byRel("ru-step.yaml"),
    )
    check("sabotage-de: changelog-marker [error]", byRel("sabotage-de.ts").some((f) => f.rule === "changelog-marker"), byRel("sabotage-de.ts"))
    check(
      "sabotage-de: «Diese Funktion» → vend/this-function-opener [warning]",
      byRel("sabotage-de.ts").some((f) => f.rule === "vend/this-function-opener"),
      byRel("sabotage-de.ts"),
    )
    check("sabotage-fr: changelog-marker [error]", byRel("sabotage-fr.ts").some((f) => f.rule === "changelog-marker"), byRel("sabotage-fr.ts"))
    check(
      "sabotage-fr: «Cette fonction» → vend/this-function-opener [warning]",
      byRel("sabotage-fr.ts").some((f) => f.rule === "vend/this-function-opener"),
      byRel("sabotage-fr.ts"),
    )
    check("sabotage-es: changelog-marker [error]", byRel("sabotage-es.ts").some((f) => f.rule === "changelog-marker"), byRel("sabotage-es.ts"))
    check(
      "sabotage-es: «Esta función» → vend/this-function-opener [warning]",
      byRel("sabotage-es.ts").some((f) => f.rule === "vend/this-function-opener"),
      byRel("sabotage-es.ts"),
    )
    check(
      "de-step: «Schritt N» → vend/step-numbered [warning]",
      byRel("de-step.ts").some((f) => f.rule === "vend/step-numbered" && f.severity === "warning"),
      byRel("de-step.ts"),
    )
    check(
      "fr-step: «Étape N» в #-языке → vend/step-numbered [warning]",
      byRel("fr-step.py").some((f) => f.rule === "vend/step-numbered" && f.severity === "warning"),
      byRel("fr-step.py"),
    )
    check(
      "es-step: «Paso N» → vend/step-numbered [warning]",
      byRel("es-step.yaml").some((f) => f.rule === "vend/step-numbered" && f.severity === "warning"),
      byRel("es-step.yaml"),
    )
    check("de-ok: голое «vorher» не матчится", byRel("de-ok.ts").length === 0, byRel("de-ok.ts"))
    check("fr-ok: голое «avant» не матчится", byRel("fr-ok.ts").length === 0, byRel("fr-ok.ts"))
    check("es-ok: голое «antes» не матчится", byRel("es-ok.ts").length === 0, byRel("es-ok.ts"))
    check("de-ok2: «frühere» не матчится как «früher war»", byRel("de-ok2.ts").length === 0, byRel("de-ok2.ts"))
    check("cjk: склейка CJK с латиницей → vend/cjk-noise [warning]", byRel("cjk.ts").some((f) => f.rule === "vend/cjk-noise" && f.severity === "warning"), byRel("cjk.ts"))
    check("cjk-ok: китайский комментарий не флагается", byRel("cjk-ok.ts").length === 0, byRel("cjk-ok.ts"))
    check("cjk-i18n: i18n-строки без смежности не флагуются", byRel("cjk-i18n.ts").length === 0, byRel("cjk-i18n.ts"))
    check("zw: zero-width в строке → vend/zero-width-chars [error]", byRel("zw.ts").some((f) => f.rule === "vend/zero-width-chars" && f.severity === "error"), byRel("zw.ts"))
    check("zw-escape: escape-форма в исходнике → vend/zero-width-chars [error]", byRel("zw-escape.ts").some((f) => f.rule === "vend/zero-width-chars"), byRel("zw-escape.ts"))
    check("zwj-ok: эмодзи-ZWJ последовательность не флагается", byRel("zwj-ok.ts").length === 0, byRel("zwj-ok.ts"))
    check("bidi: BiDi-контрол в строке → vend/bidi-controls [error]", byRel("bidi.ts").some((f) => f.rule === "vend/bidi-controls" && f.severity === "error"), byRel("bidi.ts"))
    check("bidi-escape: escape-форма → vend/bidi-controls [error]", byRel("bidi-escape.ts").some((f) => f.rule === "vend/bidi-controls"), byRel("bidi-escape.ts"))
    check("supp-uni: ignore-next-line гасит vend/zero-width-chars", byRel("supp-uni.ts").length === 0, byRel("supp-uni.ts"))
    check("supp-uni-file: ignore-file гасит vend/bidi-controls", byRel("supp-uni-file.ts").length === 0, byRel("supp-uni-file.ts"))
    check("zwsp: zero-width флагается и в старом фикстуре", byRel("zwsp.ts").some((f) => f.rule === "vend/zero-width-chars"), byRel("zwsp.ts"))
    check(
      "doc-md: markdown внутри JSDoc не флагается",
      !byRel("doc-md.ts").some((f) => f.rule === "vend/markdown-in-comment"),
      byRel("doc-md.ts"),
    )
    check("profileFor: build.gradle → cfamily", profileFor("build.gradle") === profileFor("x.ts"))
    check("profileFor: bare BUILD → hash", profileFor("BUILD") === profileFor("x.sh"))
    check(
      "gradle-by-ext: build.gradle ловит //-слоп [error]",
      byRel("build.gradle").some((f) => f.rule === "multi-line-comment" && f.severity === "error"),
      byRel("build.gradle"),
    )
    const artDir = mkdtempSync(join(tmpdir(), "slop-gate-art-"))
    try {
      const artSlop = "// removeSource rewrites rows\n// with fresh uuids zones vanish\nconst x = 1\n"
      for (const sub of ["venv", "build", "src"]) {
        mkdirSync(join(artDir, sub), { recursive: true })
        writeFileSync(join(artDir, sub, "slop.ts"), artSlop)
      }
      const artRun = runCli(["scan", "."], artDir)
      check(
        "art: venv/build пропускаются, src блокирует [exit 1]",
        artRun.status === 1 && artRun.out.includes("src/slop.ts") && !artRun.out.includes("venv") && !artRun.out.includes("build/"),
        artRun.out,
      )
    } finally {
      rmSync(artDir, { recursive: true, force: true })
    }
    const fixDir = mkdtempSync(join(tmpdir(), "slop-gate-fix-"))
    try {
      writeFileSync(
        join(fixDir, "fixme.ts"),
        [
          "// ====================",
          "// Payload normalizer for the ingest pipe.",
          "// Wire format lives in docs/ingest.md.",
          'import x from "y"',
          "",
          "function f() {",
          "  // Step 3: normalize the payload",
          "  const a = 1 // было так, стало иначе",
          "  // removeSource rewrites rows",
          "  // with fresh uuids zones vanish",
          "  const b = 2",
          '  const esc = "' + BS + 'u200B"',
          "  return b",
          "}",
          "",
        ].join("\n"),
      )
      writeFileSync(
        join(fixDir, "supp-keep.ts"),
        "// stop-ai-slop-ignore-next-line multi-line-comment\n// первая строка легаси-блока\n// вторая строка легаси-блока\nconst x = 1\n",
      )
      const before = readFileSync(join(fixDir, "fixme.ts"), "utf8")
      const dry = runCli(["--fix", "--dry-run"], fixDir)
      const afterDry = readFileSync(join(fixDir, "fixme.ts"), "utf8")
      check(
        "fix-dry-run: печатает дифф и не меняет файл [exit 0]",
        dry.status === 0 && dry.out.includes("--- a/fixme.ts") && dry.out.includes("-// ====================") && afterDry === before,
        `exit ${dry.status}: ${dry.out.slice(0, 300)}`,
      )
      const applied = runCli(["--fix"], fixDir)
      const after = readFileSync(join(fixDir, "fixme.ts"), "utf8")
      check(
        "fix: механические правила применены, escape-форма и код целы",
        applied.status === 1 &&
          !after.includes("====================") &&
          !after.includes("Payload normalizer") &&
          !after.includes("Step 3") &&
          after.includes("// normalize the payload") &&
          after.includes("const a = 1\n") &&
          !after.includes("было так, стало иначе") &&
          !after.includes("removeSource") &&
          after.includes(BS + "u200B") &&
          after.includes('import x from "y"') &&
          after.includes("return b"),
        `exit ${applied.status}: ${after}`,
      )
      check(
        "fix: escape-форма zero-width осталась как error-находка [exit 1]",
        applied.out.includes("vend/zero-width-chars"),
        applied.out,
      )
      const suppAfter = readFileSync(join(fixDir, "supp-keep.ts"), "utf8")
      check(
        "fix: suppression-директива и подавленный код не тронуты",
        suppAfter.includes("stop-ai-slop-ignore-next-line") && suppAfter.includes("первая строка легаси-блока"),
        suppAfter,
      )
      const second = runCli(["--fix"], fixDir)
      const afterSecond = readFileSync(join(fixDir, "fixme.ts"), "utf8")
      check("fix: повторный запуск идемпотентен", afterSecond === after, `exit ${second.status}`)
    } finally {
      rmSync(fixDir, { recursive: true, force: true })
    }
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
    const gitScanDir = mkdtempSync(join(tmpdir(), "slop-gate-gitscan-"))
    try {
      const gitG = (args) =>
        execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args], {
          cwd: gitScanDir,
          stdio: "pipe",
        })
      gitG(["init", "-q", "-b", "main"])
      writeFileSync(join(gitScanDir, ".gitignore"), "ignored/\n")
      mkdirSync(join(gitScanDir, "ignored"))
      writeFileSync(join(gitScanDir, "ignored", "slop.ts"), narrative + "\nconst x = 1\n")
      writeFileSync(join(gitScanDir, "untracked.ts"), narrative + "\nconst x = 1\n")
      mkdirSync(join(gitScanDir, "src"))
      writeFileSync(join(gitScanDir, "src", "tracked.ts"), "const x = 1\n")
      gitG(["add", ".gitignore", "src/tracked.ts"])
      writeFileSync(join(gitScanDir, "models.g.dart"), narrative + "\nfinal x = 1\n")
      writeFileSync(join(gitScanDir, "genheader.ts"), "// Code generated by tool. DO NOT EDIT.\n" + narrative + "\nconst x = 1\n")
      gitG(["add", "models.g.dart", "genheader.ts"])
      const stagedGenRun = runCli(["--staged"], gitScanDir)
      check(
        "git-scan: --staged пропускает сгенерированные файлы [exit 0]",
        stagedGenRun.status === 0 && !stagedGenRun.out.includes("models.g.dart") && !stagedGenRun.out.includes("genheader.ts"),
        `exit ${stagedGenRun.status}: ${stagedGenRun.out}`,
      )
      const gitScanRun = runCli(["scan", "."], gitScanDir)
      check(
        "git-scan: gitignored пропускается, untracked не-ignored виден [exit 1]",
        gitScanRun.status === 1 && gitScanRun.out.includes("untracked.ts") && !gitScanRun.out.includes("ignored/"),
        `exit ${gitScanRun.status}: ${gitScanRun.out}`,
      )
    } finally {
      rmSync(gitScanDir, { recursive: true, force: true })
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
    const badPath = runCli(["scan", "no-such-dir-xyz"], dir)
    check("errors: scan несуществующего пути [exit 2]", badPath.status === 2 && badPath.out.includes("no-such-dir-xyz"), `exit ${badPath.status}: ${badPath.out}`)
      const explainNoArg = runCli(["--explain"], errDir)
      check(
        "errors: --explain без аргумента [exit 2]",
        explainNoArg.status === 2 && !explainNoArg.out.includes("undefined"),
        `exit ${explainNoArg.status}: ${explainNoArg.out}`,
      )
    } finally {
      rmSync(errDir, { recursive: true, force: true })
    }
    const suppDiffDir = mkdtempSync(join(tmpdir(), "slop-gate-suppdiff-"))
    try {
      const gitS = (args) =>
        execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args], {
          cwd: suppDiffDir,
          stdio: "pipe",
        })
      gitS(["init", "-q", "-b", "main"])
      writeFileSync(join(suppDiffDir, "clean.ts"), "const x = 1\n")
      gitS(["add", "clean.ts"])
      gitS(["commit", "-q", "-m", "init"])
      writeFileSync(join(suppDiffDir, "clean.ts"), "const x = 1\n// stop-ai-slop-ignore-file\n// было иначе, стало так\n")
      gitS(["add", "clean.ts"])
      const staged = runCli(["--staged"], suppDiffDir)
      check(
        "supp-diff: новая ignore-file в диффе не глушит слоп",
        staged.out.includes("changelog-marker"),
        `exit ${staged.status}: ${staged.out}`,
      )
      check("supp-diff: vend/self-suppression [warning]", staged.out.includes("vend/self-suppression"), staged.out)
      gitS(["commit", "-q", "-m", "slop"])
      const full = runCli(["scan", "."], suppDiffDir)
      check("supp-diff: в full-scan директива по-прежнему глушит [exit 0]", full.status === 0, full.out)
      writeFileSync(
        join(suppDiffDir, "clean.ts"),
        "const x = 1\n// stop-ai-slop-ignore-file multi-line-comment changelog-marker\n// стало иначе\n// и ещё было\n",
      )
      gitS(["add", "clean.ts"])
      const explicit = runCli(["--staged"], suppDiffDir)
      check("supp-diff: явный список правил в новой директиве подавляет [exit 0]", explicit.status === 0, explicit.out)
    } finally {
      rmSync(suppDiffDir, { recursive: true, force: true })
    }
    const hooksPathDir = mkdtempSync(join(tmpdir(), "slop-gate-hookspath-"))
    try {
      execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "init", "-q", "-b", "main"], {
        cwd: hooksPathDir,
        stdio: "pipe",
      })
      mkdirSync(join(hooksPathDir, ".husky", "_"), { recursive: true })
      execFileSync("git", ["config", "core.hooksPath", ".husky/_"], { cwd: hooksPathDir, stdio: "pipe" })
      runCli(["--install"], hooksPathDir)
      check(
        "install: hook пишется в core.hooksPath",
        existsSync(join(hooksPathDir, ".husky", "_", "pre-commit")),
        readdirSync(join(hooksPathDir, ".husky", "_")),
      )
    } finally {
      rmSync(hooksPathDir, { recursive: true, force: true })
    }
    const ihDir = mkdtempSync(join(tmpdir(), "slop-gate-install-hooks-"))
    const mpDir = mkdtempSync(join(tmpdir(), "slop-gate-hooks-merge-"))
    const bjDir = mkdtempSync(join(tmpdir(), "slop-gate-hooks-broken-"))
    const voDir = mkdtempSync(join(tmpdir(), "slop-gate-hooks-vscode-"))
    try {
      const ihFiles = [".codex/hooks.json", ".devin/hooks.v1.json", ".github/hooks/stop-ai-slop.json"]
      const ihJson = (base, rel) => {
        try {
          return JSON.parse(readFileSync(join(base, rel), "utf8"))
        } catch {
          return null
        }
      }
      const ihBytes = (base) => ihFiles.map((f) => (existsSync(join(base, f)) ? readFileSync(join(base, f), "utf8") : null))
      const ours = (e) => Array.isArray(e?.hooks) && e.hooks.some((h) => typeof h?.command === "string" && h.command.includes("--pre-tool"))
      const fresh = runCli(["--install-hooks"], ihDir)
      const codexFirst = ihJson(ihDir, ihFiles[0])?.hooks?.PreToolUse?.[0]
      const devinFirst = ihJson(ihDir, ihFiles[1])?.PreToolUse?.[0]
      const vscodeFirst = ihJson(ihDir, ihFiles[2])?.hooks?.PreToolUse?.[0]
      check(
        "install-hooks-fresh: три файла с верной структурой [exit 0]",
        fresh.status === 0 &&
          codexFirst?.matcher === "Write|Edit|MultiEdit|write_file|replace|apply_patch" &&
          codexFirst.hooks[0].command.includes("--pre-tool") &&
          devinFirst !== undefined &&
          devinFirst !== null &&
          !("matcher" in devinFirst) &&
          devinFirst.hooks[0].command.includes("--pre-tool") &&
          vscodeFirst?.type === "command" &&
          vscodeFirst.timeout === 30 &&
          !("matcher" in vscodeFirst),
        `exit ${fresh.status}: ${fresh.out.slice(0, 200)}`,
      )
      runCli(["--install-hooks"], ihDir)
      const after2 = ihBytes(ihDir)
      const codexList2 = ihJson(ihDir, ihFiles[0])?.hooks?.PreToolUse ?? []
      const devinList2 = ihJson(ihDir, ihFiles[1])?.PreToolUse ?? []
      const third = runCli(["--install-hooks"], ihDir)
      const after3 = ihBytes(ihDir)
      check(
        "install-hooks-idempotent: одна запись, байты стабильны между запусками",
        third.status === 0 &&
          codexList2.filter(ours).length === 1 &&
          devinList2.filter(ours).length === 1 &&
          after2.every((s, i) => s !== null && s === after3[i]),
        `exit ${third.status}`,
      )
      const rfFile = join(ihDir, ihFiles[0])
      if (existsSync(rfFile)) {
        const stale = JSON.parse(readFileSync(rfFile, "utf8"))
        stale.hooks.PreToolUse[0].hooks[0].command += " STALE"
        writeFileSync(rfFile, JSON.stringify(stale, null, 2) + "\n")
      }
      const rf = runCli(["--install-hooks"], ihDir)
      const rfList = ihJson(ihDir, ihFiles[0])?.hooks?.PreToolUse ?? []
      check(
        "install-hooks-refresh-path: устаревший command обновлён на месте",
        rf.status === 0 && rfList.length === 1 && rfList.filter(ours).length === 1 && !JSON.stringify(rfList).includes("STALE"),
        `exit ${rf.status}: ${JSON.stringify(rfList).slice(0, 200)}`,
      )
      mkdirSync(join(mpDir, ".codex"), { recursive: true })
      const foreign = { matcher: "Bash", hooks: [{ type: "command", command: "my-own-check.sh" }] }
      writeFileSync(join(mpDir, ".codex", "hooks.json"), JSON.stringify({ hooks: { PreToolUse: [foreign] } }, null, 2) + "\n")
      const mp = runCli(["--install-hooks"], mpDir)
      const mpList = ihJson(mpDir, ihFiles[0])?.hooks?.PreToolUse ?? []
      check(
        "install-hooks-merge-preserve: чужая запись сохранена, наша добавлена",
        mp.status === 0 &&
          mpList.length === 2 &&
          JSON.stringify(mpList[0]) === JSON.stringify(foreign) &&
          mpList[1]?.matcher === "Write|Edit|MultiEdit|write_file|replace|apply_patch",
        `exit ${mp.status}: ${mp.out.slice(0, 200)}`,
      )
      mkdirSync(join(bjDir, ".devin"), { recursive: true })
      writeFileSync(join(bjDir, ".devin", "hooks.v1.json"), "{ not json")
      const bj = runCli(["--install-hooks"], bjDir)
      check(
        "install-hooks-broken-json: битый JSON пропущен без затирания [exit 0]",
        bj.status === 0 &&
          readFileSync(join(bjDir, ".devin", "hooks.v1.json"), "utf8") === "{ not json" &&
          bj.out.includes("hooks.v1.json") &&
          bj.out.includes("не JSON"),
        `exit ${bj.status}: ${bj.out.slice(0, 200)}`,
      )
      mkdirSync(join(voDir, ".github", "hooks"), { recursive: true })
      writeFileSync(join(voDir, ".github", "hooks", "stop-ai-slop.json"), "{}")
      const vo = runCli(["--install-hooks"], voDir)
      const voFirst = ihJson(voDir, ihFiles[2])?.hooks?.PreToolUse?.[0]
      check(
        "install-hooks-vscode-overwrite: собственный файл перезаписан полностью",
        vo.status === 0 &&
          voFirst?.type === "command" &&
          voFirst?.timeout === 30 &&
          typeof voFirst?.command === "string" &&
          voFirst.command.includes("--pre-tool") &&
          !("matcher" in voFirst),
        `exit ${vo.status}: ${vo.out.slice(0, 200)}`,
      )
      const ihHelp = runCli(["--help"], dir)
      const ihBogus = runCli(["--definitely-not-a-flag"], dir)
      check(
        "install-hooks-help: --help упоминает --install-hooks, неизвестный флаг [exit 2]",
        ihHelp.status === 0 && ihHelp.out.includes("--install-hooks") && ihBogus.status === 2,
        `help exit ${ihHelp.status}; bogus exit ${ihBogus.status}`,
      )
    } finally {
      rmSync(ihDir, { recursive: true, force: true })
      rmSync(mpDir, { recursive: true, force: true })
      rmSync(bjDir, { recursive: true, force: true })
      rmSync(voDir, { recursive: true, force: true })
    }
    const irDir = mkdtempSync(join(tmpdir(), "slop-gate-install-rules-"))
    const irForeignDir = mkdtempSync(join(tmpdir(), "slop-gate-rules-foreign-"))
    const irAppendDir = mkdtempSync(join(tmpdir(), "slop-gate-rules-append-"))
    const irCreateDir = mkdtempSync(join(tmpdir(), "slop-gate-rules-create-"))
    try {
      const irFiles = [".cursor/rules/stop-ai-slop.mdc", ".windsurfrules", "CONVENTIONS.md", ".clinerules", ".devin/rules/stop-ai-slop.md", ".github/copilot-instructions.md"]
      const irText = (base, rel) => {
        try {
          return readFileSync(join(base, rel), "utf8")
        } catch {
          return null
        }
      }
      const irStr = (base, rel) => irText(base, rel) ?? ""
      const irAll = (base) => irFiles.map((f) => irText(base, f))
      const irFirstLine = (s) => s.split("\n")[0]
      const blockOpen = "<!-- >>> stop-ai-slop >>> -->"
      const blockClose = "<!-- <<< stop-ai-slop <<< -->"
      const irFresh = runCli(["--install-rules"], irDir)
      const mdc = irStr(irDir, irFiles[0])
      const copilotFresh = irStr(irDir, ".github/copilot-instructions.md")
      check(
        "install-rules-fresh: шесть файлов созданы с верными маркерами [exit 0]",
        irFresh.status === 0 &&
          irAll(irDir).every((s) => s !== null) &&
          mdc.startsWith("---\n") &&
          mdc.includes("alwaysApply: true") &&
          mdc.includes('globs: "**/*"') &&
          irFirstLine(irStr(irDir, ".windsurfrules")) === "# stop-ai-slop generated rules" &&
          irFirstLine(irStr(irDir, ".clinerules")) === "# stop-ai-slop generated rules" &&
          irFirstLine(irStr(irDir, "CONVENTIONS.md")) === "Generated by stop-ai-slop" &&
          irFirstLine(irStr(irDir, ".devin/rules/stop-ai-slop.md")) === "Generated by stop-ai-slop" &&
          copilotFresh.includes(blockOpen) &&
          copilotFresh.includes(blockClose),
        `exit ${irFresh.status}: ${irFresh.out.slice(0, 200)}`,
      )
      const clineLines = irStr(irDir, ".clinerules").split("\n")
      check(
        "install-rules-content-from-rules: тело генерируется из RULES (id + severity), не захардкожено",
        ["multi-line-comment", "changelog-marker", "vend/generic-todo"].every((id) => {
          const line = clineLines.find((l) => l.includes(`\`${id}\``))
          return line !== undefined && line.includes(`(${RULE_BY_ID.get(id)?.severity})`)
        }),
        clineLines.slice(0, 3).join(" | "),
      )
      runCli(["--install-rules"], irDir)
      const irAfter2 = irAll(irDir)
      const irThird = runCli(["--install-rules"], irDir)
      const irAfter3 = irAll(irDir)
      check(
        "install-rules-idempotent: байты стабильны между запусками, блок copilot ровно один",
        irThird.status === 0 &&
          irAfter2.every((s, i) => s !== null && s === irAfter3[i]) &&
          irStr(irDir, ".github/copilot-instructions.md").split(blockOpen).length - 1 === 1,
        `exit ${irThird.status}`,
      )
      writeFileSync(join(irForeignDir, ".windsurfrules"), "my own rules\n")
      writeFileSync(join(irForeignDir, "CONVENTIONS.md"), "# Team conventions\n")
      const irForeign = runCli(["--install-rules"], irForeignDir)
      const irForeignLines = irForeign.out.split("\n")
      check(
        "install-rules-foreign-preserve: чужие файлы без маркера не тронуты",
        irForeign.status === 0 &&
          irText(irForeignDir, ".windsurfrules") === "my own rules\n" &&
          irText(irForeignDir, "CONVENTIONS.md") === "# Team conventions\n" &&
          [".windsurfrules", "CONVENTIONS.md"].every((rel) => irForeignLines.some((l) => l.includes(rel) && l.includes("пропущен"))) &&
          [irFiles[0], ".clinerules", irFiles[4], irFiles[5]].every((f) => irText(irForeignDir, f) !== null),
        `exit ${irForeign.status}: ${irForeign.out.slice(0, 200)}`,
      )
      writeFileSync(join(irForeignDir, ".clinerules"), "# stop-ai-slop generated rules\nOLD BODY\n")
      const irMarker = runCli(["--install-rules"], irForeignDir)
      const clineUpdated = irStr(irForeignDir, ".clinerules")
      check(
        "install-rules-marker-update: файл с нашим маркером перезаписан",
        irMarker.status === 0 && irFirstLine(clineUpdated) === "# stop-ai-slop generated rules" && !clineUpdated.includes("OLD BODY"),
        `exit ${irMarker.status}`,
      )
      mkdirSync(join(irAppendDir, ".github"), { recursive: true })
      writeFileSync(join(irAppendDir, ".github", "copilot-instructions.md"), "# Our guide\nDo things.\n")
      const irAppend = runCli(["--install-rules"], irAppendDir)
      const copilotAppended = irStr(irAppendDir, ".github/copilot-instructions.md")
      runCli(["--install-rules"], irAppendDir)
      const copilotRerun = irStr(irAppendDir, ".github/copilot-instructions.md")
      check(
        "install-rules-copilot-append: чужой текст сохранён, блок добавлен и не дублируется",
        irAppend.status === 0 &&
          copilotAppended.startsWith("# Our guide") &&
          copilotAppended.includes("Do things.") &&
          copilotAppended.includes(blockOpen) &&
          copilotRerun.split(blockOpen).length - 1 === 1,
        `exit ${irAppend.status}`,
      )
      const irCreate = runCli(["--install-rules"], irCreateDir)
      const copilotCreated = irStr(irCreateDir, ".github/copilot-instructions.md")
      check(
        "install-rules-copilot-create: файл создан только с нашим блоком",
        irCreate.status === 0 && copilotCreated.startsWith(blockOpen) && copilotCreated.includes(blockClose),
        `exit ${irCreate.status}`,
      )
      const irHelp = runCli(["--help"], dir)
      const irBogus = runCli(["--definitely-not-a-flag"], dir)
      check(
        "install-rules-help: --help упоминает --install-rules, неизвестный флаг [exit 2]",
        irHelp.status === 0 && irHelp.out.includes("--install-rules") && irBogus.status === 2,
        `help exit ${irHelp.status}; bogus exit ${irBogus.status}`,
      )
      const irScan = runCli(["scan", "."], irDir)
      check(
        "install-rules-scan-safe: сгенерированные файлы проходят собственный сканер [exit 0]",
        irScan.status === 0 && irAll(irDir).every((s) => s !== null),
        `exit ${irScan.status}: ${irScan.out.slice(0, 300)}`,
      )
    } finally {
      rmSync(irDir, { recursive: true, force: true })
      rmSync(irForeignDir, { recursive: true, force: true })
      rmSync(irAppendDir, { recursive: true, force: true })
      rmSync(irCreateDir, { recursive: true, force: true })
    }
    const rotatePath = join(dir, "rotate.jsonl")
    writeFileSync(rotatePath, Array.from({ length: 10000 }, (_, i) => `{"ts":"t${i}","verdict":"passed"}`).join("\n") + "\n")
    appendAudit({ verdict: "passed", tool: "write", filePath: "r.ts" }, rotatePath)
    const rotated = readFileSync(rotatePath, "utf8").split("\n").filter((l) => l.trim() !== "")
    check("audit: лог ротируется при превышении 10000 строк", rotated.length === 5000 && rotated[4999].includes("r.ts"), rotated.length)
    const stdinPayload = JSON.stringify({ tool_input: { file_path: join(dir, "sabotage.ts") } })
    let stdinBlocked = false
    try {
      execFileSync(process.execPath, [selfPath, "--stdin-path"], { input: stdinPayload, stdio: "pipe" })
    } catch (error) {
      stdinBlocked = error.status === 1
    }
    check("hook: --stdin-path блокирует slop-файл из payload [exit 1]", stdinBlocked)
    let stdinCleanOk = true
    try {
      execFileSync(process.execPath, [selfPath, "--stdin-path"], {
        input: JSON.stringify({ tool_input: { file_path: join(dir, "clean.ts") } }),
        stdio: "pipe",
      })
    } catch {
      stdinCleanOk = false
    }
    check("hook: --stdin-path чистый файл проходит [exit 0]", stdinCleanOk)
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
    const fpShiftDir = mkdtempSync(join(tmpdir(), "slop-gate-fp-shift-"))
    try {
      writeFileSync(join(fpShiftDir, "slop.ts"), "// this fixes the cache miss\n// second line\nconst x = 1\n")
      runCli(["--baseline-write"], fpShiftDir)
      writeFileSync(join(fpShiftDir, "slop.ts"), "const top = 1\n// this fixes the cache miss\n// second line\nconst x = 1\n")
      const shifted = runCli(["scan", "."], fpShiftDir)
      check("fp: правка выше baselined-строки не воскрешает легаси [exit 0]", shifted.status === 0, `exit ${shifted.status}: ${shifted.out}`)
    } finally {
      rmSync(fpShiftDir, { recursive: true, force: true })
    }
    const fpTextDir = mkdtempSync(join(tmpdir(), "slop-gate-fp-text-"))
    try {
      writeFileSync(join(fpTextDir, "slop.ts"), "// this fixes the cache miss\n// second line\nconst x = 1\n")
      runCli(["--baseline-write"], fpTextDir)
      writeFileSync(join(fpTextDir, "slop.ts"), "// must take over the cache miss\n// second line\nconst x = 1\n")
      const changed = runCli(["scan", "."], fpTextDir)
      check("fp: изменённый текст находки флагается как новый слоп [exit 1]", changed.status === 1, `exit ${changed.status}: ${changed.out}`)
    } finally {
      rmSync(fpTextDir, { recursive: true, force: true })
    }
    const fpV1Dir = mkdtempSync(join(tmpdir(), "slop-gate-fp-v1-"))
    try {
      writeFileSync(join(fpV1Dir, "slop.ts"), "// this fixes the cache miss\n// second line\nconst x = 1\n")
      writeFileSync(join(fpV1Dir, "stop-ai-slop.baseline.txt"), "# slop-gate baseline: relpath:line\nslop.ts:1\n")
      const v1Run = runCli(["scan", "."], fpV1Dir)
      check("fp: v1-baseline продолжает маскировать по rel:line [exit 0]", v1Run.status === 0, `exit ${v1Run.status}: ${v1Run.out}`)
    } finally {
      rmSync(fpV1Dir, { recursive: true, force: true })
    }
    const fpPruneDir = mkdtempSync(join(tmpdir(), "slop-gate-fp-prune-"))
    try {
      writeFileSync(join(fpPruneDir, "slop.ts"), "// this fixes the cache miss\n// second line\nconst x = 1\n")
      runCli(["--baseline-write"], fpPruneDir)
      writeFileSync(join(fpPruneDir, "slop.ts"), "const x = 1\n")
      const pruned = runCli(["--baseline-prune"], fpPruneDir)
      const body = readFileSync(join(fpPruneDir, "stop-ai-slop.baseline.txt"), "utf8")
      check(
        "fp: prune v2-базелайна удаляет обе записи пары [exit 0]",
        pruned.status === 0 && !body.includes("slop.ts:1") && !body.split(/\r?\n/).some((l) => l.startsWith("fp:")),
        `exit ${pruned.status}: ${body}`,
      )
    } finally {
      rmSync(fpPruneDir, { recursive: true, force: true })
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
    const jsonRun = runCli(["scan", "sabotage.ts", "--format", "json"], dir)
    let jsonParsed = null
    try {
      jsonParsed = JSON.parse(jsonRun.out)
    } catch {
      jsonParsed = null
    }
    check(
      "format: --format json парсится, несёт ruleId и line [exit 1]",
      jsonRun.status === 1 &&
        jsonParsed !== null &&
        !jsonRun.out.includes("slop-gate:") &&
        jsonParsed.diagnostics.some((d) => d.ruleId === "multi-line-comment" && d.location.path === "sabotage.ts" && d.location.range.start.line === 1),
      `exit ${jsonRun.status}: ${jsonRun.out.slice(0, 200)}`,
    )
    const sarifRun = runCli(["scan", "sabotage.ts", "--format", "sarif"], dir)
    let sarifParsed = null
    try {
      sarifParsed = JSON.parse(sarifRun.out)
    } catch {
      sarifParsed = null
    }
    check(
      "format: --format sarif 2.1.0, rules = все RULES, results = находки [exit 1]",
      sarifRun.status === 1 &&
        sarifParsed !== null &&
        sarifParsed.version === "2.1.0" &&
        sarifParsed.runs[0].tool.driver.rules.length === RULES.length &&
        sarifParsed.runs[0].results.length === byRel("sabotage.ts").length,
      `exit ${sarifRun.status}: ${sarifRun.out.slice(0, 200)}`,
    )
    const cleanJson = runCli(["scan", "clean.ts", "--format", "json"], dir)
    let cleanParsed = null
    try {
      cleanParsed = JSON.parse(cleanJson.out)
    } catch {
      cleanParsed = null
    }
    check(
      "format: чистый файл --format json → diagnostics пуст [exit 0]",
      cleanJson.status === 0 && cleanParsed !== null && cleanParsed.diagnostics.length === 0,
      `exit ${cleanJson.status}: ${cleanJson.out.slice(0, 200)}`,
    )
    const badFormat = runCli(["scan", ".", "--format", "yaml"], dir)
    check("format: неизвестный формат [exit 2]", badFormat.status === 2, `exit ${badFormat.status}: ${badFormat.out}`)
    const cfgDir = mkdtempSync(join(tmpdir(), "slop-gate-cfg-"))
    try {
      writeFileSync(join(cfgDir, "a.ts"), "// первая строка блока\n// вторая строка блока\nconst x = 1\n")
      writeFileSync(join(cfgDir, ".stop-ai-slop.yaml"), "rules:\n  multi-line-comment: off\n")
      const offRun = runCli(["scan", "."], cfgDir)
      check(
        "cfg-off: правило отключено конфигом [exit 0]",
        offRun.status === 0 && !offRun.out.includes("multi-line-comment"),
        `exit ${offRun.status}: ${offRun.out}`,
      )
      writeFileSync(join(cfgDir, ".stop-ai-slop.yaml"), "rules:\n  vend/step-numbered: error\n")
      writeFileSync(join(cfgDir, "a.ts"), "// Step 3: x\nconst x = 1\n")
      const sevRun = runCli(["scan", "."], cfgDir)
      check(
        "cfg-sev: warning повышен до error конфигом [exit 1]",
        sevRun.status === 1 && sevRun.out.includes("vend/step-numbered"),
        `exit ${sevRun.status}: ${sevRun.out}`,
      )
      writeFileSync(join(cfgDir, ".stop-ai-slop.yaml"), "maxCommentLength: 40\n")
      writeFileSync(join(cfgDir, "a.ts"), "// " + "y".repeat(58) + "\nconst x = 1\n")
      const lenRun = runCli(["scan", "."], cfgDir)
      check(
        "cfg-len: maxCommentLength из конфига [exit 1]",
        lenRun.status === 1 && lenRun.out.includes("long-comment"),
        `exit ${lenRun.status}: ${lenRun.out}`,
      )
      mkdirSync(join(cfgDir, "sub"), { recursive: true })
      writeFileSync(join(cfgDir, "sub", "slop.ts"), "// первая строка блока\n// вторая строка блока\nconst x = 1\n")
      writeFileSync(join(cfgDir, "a.ts"), "const x = 1\n")
      writeFileSync(join(cfgDir, ".stop-ai-slop.yaml"), "excludePaths:\n  - sub\n")
      const exclRun = runCli(["scan", "."], cfgDir)
      check(
        "cfg-exclude: excludePaths исключает каталог [exit 0]",
        exclRun.status === 0 && !exclRun.out.includes("sub/slop.ts"),
        `exit ${exclRun.status}: ${exclRun.out}`,
      )
      writeFileSync(join(cfgDir, ".stop-ai-slop.yaml"), "rules:\n  vend/step-numbered: maybe\n")
      const badRun = runCli(["scan", "."], cfgDir)
      check(
        "cfg-bad: недопустимое severity [exit 2]",
        badRun.status === 2 && badRun.out.includes(".stop-ai-slop.yaml"),
        `exit ${badRun.status}: ${badRun.out}`,
      )
      writeFileSync(join(cfgDir, ".stop-ai-slop.yaml"), "rules:\nmulti-line-comment: off\n")
      const flatRun = runCli(["scan", "."], cfgDir)
      check(
        "cfg-flat: rule-id верхним ключом → exit 2 с подсказкой про отступ [exit 2]",
        flatRun.status === 2 && flatRun.out.includes("rules:"),
        `exit ${flatRun.status}: ${flatRun.out}`,
      )
    } finally {
      rmSync(cfgDir, { recursive: true, force: true })
    }
    const genCfgDir = mkdtempSync(join(tmpdir(), "slop-gate-gencfg-"))
    try {
      writeFileSync(join(genCfgDir, "api2_pb2.py"), "# первая строка блока\n# вторая строка блока\nx = 1\n")
      writeFileSync(join(genCfgDir, ".stop-ai-slop.yaml"), "scanGenerated: true\n")
      const genOnRun = runCli(["scan", "."], genCfgDir)
      check(
        "gen-cfg-on: scanGenerated: true снимает эксемпт [exit 1]",
        genOnRun.status === 1 && genOnRun.out.includes("api2_pb2.py") && genOnRun.out.includes("multi-line-comment"),
        `exit ${genOnRun.status}: ${genOnRun.out}`,
      )
      mkdirSync(join(genCfgDir, "codegen"), { recursive: true })
      writeFileSync(join(genCfgDir, "codegen", "slop.ts"), "// первая строка блока\n// вторая строка блока\nconst x = 1\n")
      writeFileSync(join(genCfgDir, ".stop-ai-slop.yaml"), "generatedPaths:\n  - codegen\n")
      const genPathsRun = runCli(["scan", "."], genCfgDir)
      check(
        "gen-cfg-paths: generatedPaths эксемптит каталог [exit 0]",
        genPathsRun.status === 0 && !genPathsRun.out.includes("codegen/slop.ts"),
        `exit ${genPathsRun.status}: ${genPathsRun.out}`,
      )
    } finally {
      rmSync(genCfgDir, { recursive: true, force: true })
    }
    writeFileSync(join(dir, "stop-ai-slop.baseline.txt"), "# slop-gate baseline: relpath:line\nwasnow.ts:1\n")
    const mcpLines = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "slop_explain", arguments: { ruleId: "changelog-marker" } } }),
      JSON.stringify({ jsonrpc: "2.0", id: 4, method: "bogus/method" }),
      JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "slop_scan", arguments: { path: dir } } }),
      JSON.stringify({ jsonrpc: "2.0", id: 7, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "0" } } }),
      JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "slop_baseline", arguments: {} } }),
      "not json{",
    ]
    let mcpOut = ""
    let mcpStatus = 0
    try {
      mcpOut = execFileSync(process.execPath, [selfPath, "--mcp"], { input: mcpLines.join("\n") + "\n", encoding: "utf8", stdio: "pipe", cwd: dir })
    } catch (error) {
      mcpStatus = error.status ?? 1
      mcpOut = String(error.stdout ?? "")
    }
    const mcpResponses = []
    let mcpAllJson = true
    for (const line of mcpOut.split("\n")) {
      if (line.trim() === "") continue
      try {
        mcpResponses.push(JSON.parse(line))
      } catch {
        mcpAllJson = false
      }
    }
    const mcpById = new Map(mcpResponses.filter((r) => typeof r === "object" && r !== null && "id" in r).map((r) => [r.id, r]))
    const init = mcpById.get(1)
    check(
      "mcp-handshake: неизвестная версия → latest, поддерживаемая → эхо [exit 0]",
      mcpStatus === 0 &&
        init?.result !== undefined &&
        init.result.protocolVersion === "2026-07-28" &&
        mcpById.get(7)?.result?.protocolVersion === "2025-11-25" &&
        init.result.capabilities?.tools !== undefined &&
        init.result.serverInfo?.name === "stop-ai-slop",
      `exit ${mcpStatus}: ${mcpOut.slice(0, 300)}`,
    )
    const toolsList = mcpById.get(2)?.result?.tools
    const toolNames = new Set((toolsList ?? []).map((t) => t.name))
    check(
      "mcp-tools-list: ровно 3 инструмента с inputSchema.type object",
      Array.isArray(toolsList) &&
        toolsList.length === 3 &&
        toolNames.size === 3 &&
        ["slop_scan", "slop_explain", "slop_baseline"].every((n) => toolNames.has(n)) &&
        toolsList.every((t) => t.inputSchema?.type === "object"),
      String(JSON.stringify(mcpById.get(2))).slice(0, 300),
    )
    const explainCall = mcpById.get(3)
    check(
      "mcp-call-explain: slop_explain возвращает текст правила",
      !explainCall?.result?.isError && explainCall?.result?.content?.[0]?.type === "text" && explainCall.result.content[0].text.includes("changelog"),
      String(JSON.stringify(explainCall)).slice(0, 300),
    )
    const scanCall = mcpById.get(5)
    check(
      "mcp-call-scan: slop_scan находит multi-line-comment",
      scanCall?.result?.content?.[0]?.text?.includes("multi-line-comment") === true,
      String(JSON.stringify(scanCall)).slice(0, 300),
    )
    check("mcp-unknown-method: bogus/method → error -32601", mcpById.get(4)?.error?.code === -32601, String(JSON.stringify(mcpById.get(4))))
    check("mcp-bad-json: невалидная строка → error -32700, id null", mcpById.get(null)?.error?.code === -32700, String(JSON.stringify(mcpById.get(null))))
    check("mcp-stdout-purity: каждая непустая строка stdout — валидный JSON", mcpAllJson, mcpOut.slice(0, 300))
    const baselineCall = mcpById.get(8)
    check(
      "mcp-call-baseline: slop_baseline печатает записи baseline",
      baselineCall?.result?.isError !== true && baselineCall?.result?.content?.[0]?.text?.includes("wasnow.ts:1") === true,
      String(JSON.stringify(baselineCall)).slice(0, 300),
    )
    const preTool = (payload) => {
      try {
        execFileSync(process.execPath, [selfPath, "--pre-tool"], { input: JSON.stringify(payload), encoding: "utf8", stdio: "pipe" })
        return { status: 0, stderr: "" }
      } catch (error) {
        return { status: error.status ?? 1, stderr: String(error.stderr ?? "") }
      }
    }
    const blockedWrite = preTool({
      tool_name: "Write",
      tool_input: { file_path: join(dir, "slop-write.ts"), content: "// стало иначе\n// было по-другому\nconst x = 1\n" },
    })
    check(
      "pre-tool-blocked: Write со слопом [exit 2]",
      blockedWrite.status === 2 && blockedWrite.stderr.includes("changelog-marker"),
      `exit ${blockedWrite.status}: ${blockedWrite.stderr.slice(0, 300)}`,
    )
    const cleanWrite = preTool({ tool_name: "Write", tool_input: { file_path: join(dir, "slop-clean.ts"), content: "const x = 1\n" } })
    check("pre-tool-clean: чистый Write [exit 0]", cleanWrite.status === 0 && cleanWrite.stderr === "", `exit ${cleanWrite.status}: ${cleanWrite.stderr}`)
    writeFileSync(join(dir, "edit-target.ts"), "const a = 1\n")
    const editDelta = preTool({
      tool_name: "Edit",
      tool_input: { file_path: join(dir, "edit-target.ts"), old_string: "const a = 1\n", new_string: "const a = 1\n// было иначе, стало так\n" },
    })
    check("pre-tool-edit-delta: Edit, добавляющий слоп [exit 2]", editDelta.status === 2, `exit ${editDelta.status}: ${editDelta.stderr.slice(0, 300)}`)
    const silentRead = preTool({ tool_name: "Read", tool_input: { file_path: join(dir, "clean.ts") } })
    check("pre-tool-silent: Read игнорируется [exit 0]", silentRead.status === 0 && silentRead.stderr === "", `exit ${silentRead.status}: ${silentRead.stderr}`)
    const multiEdit = preTool({
      tool_name: "MultiEdit",
      tool_input: {
        file_path: join(dir, "edit-target.ts"),
        edits: [{ old_string: "", new_string: "// было так, стало иначе\n" }],
      },
    })
    check(
      "pre-tool-multiedit: MultiEdit со слопом [exit 2]",
      multiEdit.status === 2 && multiEdit.stderr.includes("changelog-marker"),
      `exit ${multiEdit.status}: ${multiEdit.stderr.slice(0, 300)}`,
    )
    const writeFileDeny = preTool({
      tool_name: "write_file",
      tool_input: { file_path: join(dir, "x.ts"), content: "const a = 1\n// было так, стало иначе\n" },
    })
    check(
      "pretool-write_file-deny: Gemini write_file со слопом [exit 2]",
      writeFileDeny.status === 2 && writeFileDeny.stderr.includes("changelog-marker"),
      `exit ${writeFileDeny.status}: ${writeFileDeny.stderr.slice(0, 300)}`,
    )
    const writeFileAllow = preTool({ tool_name: "write_file", tool_input: { file_path: join(dir, "x.ts"), content: "const a = 1\n" } })
    check(
      "pretool-write_file-allow: чистый write_file [exit 0]",
      writeFileAllow.status === 0 && writeFileAllow.stderr === "",
      `exit ${writeFileAllow.status}: ${writeFileAllow.stderr}`,
    )
    const replaceDeny = preTool({
      tool_name: "replace",
      tool_input: { file_path: join(dir, "edit-target.ts"), old_string: "const a = 1\n", new_string: "const a = 1\n// было так, стало иначе\n" },
    })
    check("pretool-replace-deny: Qwen replace со слопом [exit 2]", replaceDeny.status === 2, `exit ${replaceDeny.status}: ${replaceDeny.stderr.slice(0, 300)}`)
    const replaceAllow = preTool({
      tool_name: "replace",
      tool_input: { file_path: join(dir, "edit-target.ts"), old_string: "const a = 1\n", new_string: "const a = 1\nconst b = 2\n" },
    })
    check(
      "pretool-replace-allow: чистый replace [exit 0]",
      replaceAllow.status === 0 && replaceAllow.stderr === "",
      `exit ${replaceAllow.status}: ${replaceAllow.stderr}`,
    )
    const patchDeny = preTool({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Add File: slop.ts\n+const a = 1\n+// было так, стало иначе\n*** End Patch\n" },
    })
    check(
      "pretool-apply_patch-deny: Codex apply_patch со слопом [exit 2]",
      patchDeny.status === 2 && patchDeny.stderr.includes("slop.ts"),
      `exit ${patchDeny.status}: ${patchDeny.stderr.slice(0, 300)}`,
    )
    const patchMulti = preTool({
      tool_name: "apply_patch",
      tool_input: {
        command:
          "*** Begin Patch\n*** Update File: clean.ts\n const x = 1\n+const y = 2\n*** Update File: dirty.py\n+# было так, стало иначе\n*** End Patch\n",
      },
    })
    check(
      "pretool-apply_patch-multifile: слоп только в dirty.py [exit 2]",
      patchMulti.status === 2 && patchMulti.stderr.includes("dirty.py") && !patchMulti.stderr.includes("clean.ts"),
      `exit ${patchMulti.status}: ${patchMulti.stderr.slice(0, 300)}`,
    )
    const patchMove = preTool({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Update File: old.ts\n*** Move to: new.ts\n+// было так, стало иначе\n*** End Patch\n" },
    })
    check(
      "pretool-apply_patch-move: слоп после Move to относится к new.ts [exit 2]",
      patchMove.status === 2 && patchMove.stderr.includes("new.ts"),
      `exit ${patchMove.status}: ${patchMove.stderr.slice(0, 300)}`,
    )
    const patchAllow = preTool({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Add File: clean.ts\n+const a = 1\n*** End Patch\n" },
    })
    check(
      "pretool-apply_patch-allow: чистый apply_patch [exit 0]",
      patchAllow.status === 0 && patchAllow.stderr === "",
      `exit ${patchAllow.status}: ${patchAllow.stderr}`,
    )
    const shapeWriteDeny = preTool({
      tool_name: "strReplaceEditor",
      tool_input: { file_path: join(dir, "x.ts"), content: "// было так, стало иначе\n" },
    })
    check(
      "pretool-shape-unknown-write-deny: неизвестный инструмент с write-формой [exit 2]",
      shapeWriteDeny.status === 2,
      `exit ${shapeWriteDeny.status}: ${shapeWriteDeny.stderr.slice(0, 300)}`,
    )
    const shapeReadPass = preTool({ tool_name: "strReplaceEditor", tool_input: { file_path: join(dir, "x.ts") } })
    const shapeExecPass = preTool({ tool_name: "runInTerminal", tool_input: { command: "apply_patch <<'EOF'\n*** Begin Patch\n+// было\n" } })
    check(
      "pretool-shape-read-pass: неизвестный read без content и exec-имя с patch-текстом [exit 0]",
      shapeReadPass.status === 0 && shapeReadPass.stderr === "" && shapeExecPass.status === 0 && shapeExecPass.stderr === "",
      `read: exit ${shapeReadPass.status}: ${shapeReadPass.stderr}; exec: exit ${shapeExecPass.status}: ${shapeExecPass.stderr}`,
    )
    const regressWrite = preTool({
      tool_name: "Write",
      tool_input: { file_path: join(dir, "slop-write.ts"), content: "// стало иначе\n// было по-другому\nconst x = 1\n" },
    })
    const regressEdit = preTool({
      tool_name: "Edit",
      tool_input: { file_path: join(dir, "edit-target.ts"), old_string: "const a = 1\n", new_string: "const a = 1\nconst b = 2\n" },
    })
    const regressRead = preTool({ tool_name: "Read", tool_input: { file_path: join(dir, "clean.ts") } })
    check(
      "pretool-regression-claude: Write deny + Edit allow + Read pass без изменений",
      regressWrite.status === 2 && regressEdit.status === 0 && regressEdit.stderr === "" && regressRead.status === 0 && regressRead.stderr === "",
      `write: exit ${regressWrite.status}; edit: exit ${regressEdit.status}: ${regressEdit.stderr}; read: exit ${regressRead.status}: ${regressRead.stderr}`,
    )
    const benchUp = benchDelta({ "a/b": { "r/one": 1 } }, { "a/b": { "r/one": 3 } })
    check(
      "bench-delta: рост счётчика — одна запись с was/now",
      benchUp.length === 1 && benchUp[0].repo === "a/b" && benchUp[0].rule === "r/one" && benchUp[0].was === 1 && benchUp[0].now === 3,
      JSON.stringify(benchUp),
    )
    check("bench-delta: падение счётчика игнорируется", benchDelta({ "a/b": { "r/one": 3 } }, { "a/b": { "r/one": 1 } }).length === 0, "")
    check("bench-delta: равные счётчики игнорируются", benchDelta({ "a/b": { "r/one": 2 } }, { "a/b": { "r/one": 2 } }).length === 0, "")
    const benchEmpty = benchDelta({}, { "a/b": { "r/one": 1 } })
    check("bench-delta: пустая история — рост от нуля", benchEmpty.length === 1 && benchEmpty[0].was === 0, JSON.stringify(benchEmpty))
    check("bench-flags: --bench и --bench-write известны", KNOWN_FLAGS.has("--bench") && KNOWN_FLAGS.has("--bench-write"), "")
    const benchHelp = runCli(["--help"], dir)
    check(
      "bench-usage: --help упоминает --bench",
      benchHelp.status === 0 && benchHelp.out.includes("--bench") && benchHelp.out.includes("--bench-write"),
      benchHelp.out.slice(0, 200),
    )
    const selfRoot = resolve(dirname(selfPath), "../..")
    try {
      const pkgRaw = readFileSync(join(selfRoot, "package.json"), "utf8")
      const pluginJson = join(selfRoot, ".claude-plugin", "stop-ai-slop", "plugin.json")
      if (!existsSync(pluginJson)) {
        check("release-sync: skip — no plugin metadata", true, "skip: no plugin metadata")
      } else {
        const pkgVer = JSON.parse(pkgRaw).version
        const pluginVer = JSON.parse(readFileSync(pluginJson, "utf8")).version
        check("release-sync: package.json == plugin.json", pkgVer === pluginVer, `${pkgVer} vs ${pluginVer}`)
      }
    } catch {
      check("release-sync: skip — unreadable metadata", true, "skip: unreadable metadata")
    }
    let schema = null
    let schemaError = null
    try {
      schema = JSON.parse(readFileSync(join(selfRoot, "schema", "stop-ai-slop.schema.json"), "utf8"))
    } catch (error) {
      schemaError = error
    }
    check(
      "schema-parse: schema/stop-ai-slop.schema.json — валидный JSON draft-07",
      schema !== null &&
        schema.$schema === "http://json-schema.org/draft-07/schema#" &&
        typeof schema.$id === "string" &&
        schema.$id.includes("schema/stop-ai-slop.schema.json"),
      schemaError !== null ? String(schemaError.message ?? schemaError) : `${schema.$schema} / ${schema.$id}`,
    )
    const expectedConfigKeys = ["excludePaths", "generatedPaths", "maxCommentLength", "rules", "scanGenerated"]
    const sameKeys = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
    let configOk = false
    let configDetail = "schema missing"
    if (schema !== null && schema.properties !== null && typeof schema.properties === "object") {
      const schemaKeys = Object.keys(schema.properties).sort()
      const initMatch = /const config = \{([^}]*)\}/.exec(readFileSync(selfPath, "utf8"))
      if (initMatch === null) {
        configDetail = "loadConfig initializer not found"
      } else {
        const configKeys = [...initMatch[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]).sort()
        configOk = sameKeys(schemaKeys, expectedConfigKeys) && sameKeys(configKeys, schemaKeys)
        configDetail = `schema: ${schemaKeys.join(",")}; loadConfig: ${configKeys.join(",")}`
      }
    }
    check("schema-parity-config: properties == ключи конфига loadConfig", configOk, configDetail)
    const rulesSchema = schema !== null && schema.properties ? schema.properties.rules : null
    const patterns = rulesSchema && rulesSchema.patternProperties ? Object.keys(rulesSchema.patternProperties) : []
    let patternOk = false
    let patternDetail = "schema missing"
    if (patterns.length === 1) {
      try {
        const pattern = patterns[0]
        const re = new RegExp(pattern)
        const isAnchored = pattern.startsWith("^") && pattern.endsWith("$")
        const allMatch = RULES.every((r) => re.test(r.id))
        const rejects = !re.test("bogus-rule") && !re.test("multi-line-commentX")
        patternOk = isAnchored && allMatch && rejects
        patternDetail = `anchored: ${isAnchored}; allMatch: ${allMatch}; rejects: ${rejects}`
      } catch (error) {
        patternDetail = `bad regex: ${String(error && error.message ? error.message : error)}`
      }
    } else if (patterns.length > 0) {
      patternDetail = `patternProperties keys: ${patterns.length}`
    }
    check("schema-parity-rules: patternProperties покрывает все RULES и только их", patternOk, patternDetail)
    let shippedOk = false
    let shippedDetail = ""
    try {
      const pkgFiles = JSON.parse(readFileSync(join(selfRoot, "package.json"), "utf8")).files
      shippedOk = Array.isArray(pkgFiles) && pkgFiles.includes("schema/")
      shippedDetail = JSON.stringify(pkgFiles)
    } catch (error) {
      shippedDetail = String(error && error.message ? error.message : error)
    }
    check("schema-npm-shipped: package.json files[] содержит schema/", shippedOk, shippedDetail)
    const nodeMajor = Number(process.versions.node.split(".")[0])
    const nodeMinor = Number(process.versions.node.split(".")[1])
    if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 6)) {
      check("plugin-v2-shape: skip — node < 22.6", true, "skip: node < 22.6")
    } else {
      const v2Fixture = join(dir, "plugin-v2-check.mjs")
      const pluginUrl = pathToFileURL(join(selfRoot, "plugin", "comment-gate.ts")).href
      writeFileSync(
        v2Fixture,
        `import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
const done = (payload) => {
  writeFileSync(1, JSON.stringify(payload) + "\\n")
  process.exit(0)
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
let mod
try {
  mod = await import(${JSON.stringify(pluginUrl)})
} catch (error) {
  done({ ok: false, error: "import: " + String(error && error.message ? error.message : error) })
}
try {
  assert(mod.default !== null && typeof mod.default === "object", "default export missing")
  assert(mod.default.id === "stop-ai-slop", "default.id: " + String(mod.default.id))
  assert(typeof mod.default.server === "function", "default.server is not a function")
  assert(typeof mod.default.setup === "function", "default.setup is not a function")
  assert(typeof mod.CommentGate === "function", "named CommentGate is not a function")
  assert(typeof mod.detectCommentSlop === "function", "named detectCommentSlop is not a function")
  let captured = null
  await mod.default.setup({
    tool: {
      hook: async (name, cb) => {
        captured = { name, cb }
        return { dispose: async () => {} }
      },
    },
  })
  assert(captured !== null, "setup did not register a tool hook")
  assert(captured.name === "execute.before", "hook name: " + String(captured.name))
  assert(typeof captured.cb === "function", "hook callback is not a function")
  const slopPath = join(tmpdir(), "slop-v2-check.ts")
  const slopContent = "const a = 1\\n// slop line one\\n// slop line two\\n"
  const cleanContent = "const a = 1\\n"
  let thrown = null
  try {
    await captured.cb({ tool: "write", input: { filePath: slopPath, content: slopContent } })
  } catch (error) {
    thrown = error
  }
  assert(thrown !== null, "v2 slop write did not throw")
  assert(String(thrown.message).startsWith("comment-gate:"), "v2 error prefix: " + String(thrown.message).slice(0, 80))
  await captured.cb({ tool: "write", input: { filePath: slopPath, content: cleanContent } })
  await captured.cb({ tool: "read", input: { filePath: slopPath } })
  const hooks = await mod.default.server({})
  assert(typeof hooks["tool.execute.before"] === "function", "v1 tool.execute.before missing")
  thrown = null
  try {
    await hooks["tool.execute.before"]({ tool: "write" }, { args: { filePath: slopPath, content: slopContent } })
  } catch (error) {
    thrown = error
  }
  assert(thrown !== null, "v1 slop write did not throw")
  assert(String(thrown.message).startsWith("comment-gate:"), "v1 error prefix: " + String(thrown.message).slice(0, 80))
  await hooks["tool.execute.before"]({ tool: "write" }, { args: { filePath: slopPath, content: cleanContent } })
  done({ ok: true })
} catch (error) {
  done({ ok: false, error: String(error && error.message ? error.message : error) })
}
`,
      )
      const v2Audit = join(dir, "audit.jsonl")
      const v2Run = spawnSync(process.execPath, ["--experimental-strip-types", v2Fixture], {
        encoding: "utf8",
        env: { ...process.env, STOP_AI_SLOP_LOG: v2Audit },
      })
      let v2Result = null
      try {
        v2Result = JSON.parse((v2Run.stdout ?? "").trim().split(/\r?\n/).pop() ?? "")
      } catch {
        v2Result = null
      }
      const v2AuditOk = existsSync(v2Audit) && readFileSync(v2Audit, "utf8").includes('"event":"loaded"')
      check(
        "plugin-v2-shape: dual export + v2 tool hook gate",
        v2Run.status === 0 && v2Result !== null && v2Result.ok === true && v2AuditOk,
        v2Result && v2Result.error ? v2Result.error : `exit ${v2Run.status}: ${(v2Run.stderr ?? "").slice(0, 300)}`,
      )
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
  "--install-hooks",
  "--install-rules",
  "--staged",
  "--diff",
  "--fix",
  "--dry-run",
  "--baseline-write",
  "--baseline-prune",
  "--bench",
  "--bench-write",
  "--audit",
  "--stdin-path",
  "--mcp",
  "--pre-tool",
  "--format",
  "--help",
])

const FORMATS = new Set(["text", "json", "sarif"])

function parseFormat(argv) {
  const idx = argv.indexOf("--format")
  if (idx === -1) return { format: "text", rest: argv }
  const value = argv[idx + 1]
  if (value === undefined || value.startsWith("--") || !FORMATS.has(value)) {
    console.error("slop-gate: --format требует значение text, json или sarif")
    return null
  }
  return { format: value, rest: [...argv.slice(0, idx), ...argv.slice(idx + 2)] }
}

export function auditLogPath() {
  return process.env.STOP_AI_SLOP_LOG ?? join(homedir(), ".config", "opencode", "logs", "comment-gate.jsonl")
}

export function appendAudit(entry, path = auditLogPath()) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : []
    if (lines.length > 10000) writeFileSync(path, lines.slice(-5000).join("\n") + "\n")
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

function cmdStdinPath() {
  const payload = readFileSync(0, "utf8")
  let filePath = null
  try {
    const parsed = JSON.parse(payload)
    filePath = parsed?.tool_input?.file_path ?? parsed?.tool_input?.filePath ?? null
  } catch {
    filePath = null
  }
  if (typeof filePath !== "string" || filePath === "") return 0
  const root = gitToplevel(process.cwd())
  const profile = profileFor(filePath)
  if (profile === null || !existsSync(filePath)) return 0
  let config = null
  try {
    config = loadConfig(root)
  } catch {
    config = null
  }
  const findings = scanFiles([filePath], root, null, genContext(root, config)).map((f) => ({ ...f, rel: toRel(root, resolve(filePath)) }))
  const baseline = loadBaseline(root)
  const fresh = maskBaselined(baseline, findings)
  printFindings(fresh)
  return failsGate(fresh, false) ? 1 : 0
}

const MCP_PROTOCOLS = ["2024-11-05", "2025-11-25", "2026-07-28"]

const MCP_TOOLS = [
  {
    name: "slop_scan",
    description: "Полное сканирование каталога на slop-комментарии",
    inputSchema: { type: "object", properties: { path: { type: "string", description: "Каталог или файл (по умолчанию текущий)" } }, required: [] },
  },
  {
    name: "slop_explain",
    description: "Обоснование правила (Why/Instead/Write/Ignore)",
    inputSchema: { type: "object", properties: { ruleId: { type: "string" } }, required: ["ruleId"] },
  },
  {
    name: "slop_baseline",
    description: "Записи baseline текущего git-корня",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
]

function mcpToolResult(text, isError = false) {
  return { resultType: "complete", content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) }
}

function mcpCallTool(name, args) {
  if (name === "slop_scan") {
    const path = typeof args?.path === "string" && args.path !== "" ? args.path : "."
    const root = gitToplevel(process.cwd())
    let config
    try {
      config = loadConfig(root)
    } catch (error) {
      return mcpToolResult(`ошибка конфига: ${error.message}`, true)
    }
    const findings = applyRuleConfig(
      scanFiles(collectFiles([path], root, config?.excludePaths ?? []), root, configOptions(config), genContext(root, config)),
      config,
    )
    const baseline = loadBaseline(root)
    return mcpToolResult(findingsToText(maskBaselined(baseline, findings)))
  }
  if (name === "slop_explain") {
    const text = explainText(String(args?.ruleId ?? ""))
    return text === null ? mcpToolResult("правило не найдено", true) : mcpToolResult(text)
  }
  if (name === "slop_baseline") {
    const baseline = loadBaseline(gitToplevel(process.cwd()))
    const entries = [...baseline.legacy, ...[...baseline.fp].map((p) => `fp:${p}`)]
    return mcpToolResult(entries.length === 0 ? "baseline пуст" : entries.join("\n"))
  }
  return mcpToolResult(`неизвестный инструмент ${name}`, true)
}

function cmdMcp() {
  const version = toolVersion()
  const write = (msg) => process.stdout.write(JSON.stringify(msg) + "\n")
  const rl = createInterface({ input: process.stdin })
  return new Promise((resolvePromise) => {
    rl.on("line", (line) => {
      const trimmed = line.trim()
      if (trimmed === "") return
      let msg
      try {
        msg = JSON.parse(trimmed)
      } catch {
        write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
        return
      }
      const { id, method, params } = typeof msg === "object" && msg !== null ? msg : {}
      if (method === "notifications/initialized" || method === "notifications/cancelled") return
      if (method === "initialize") {
        const requested = params?.protocolVersion
        write({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: MCP_PROTOCOLS.includes(requested) ? requested : MCP_PROTOCOLS[MCP_PROTOCOLS.length - 1],
            capabilities: { tools: {} },
            serverInfo: { name: "stop-ai-slop", version },
          },
        })
        return
      }
      if (method === "ping") {
        write({ jsonrpc: "2.0", id, result: {} })
        return
      }
      if (method === "tools/list") {
        write({ jsonrpc: "2.0", id, result: { resultType: "complete", tools: MCP_TOOLS } })
        return
      }
      if (method === "tools/call") {
        let result
        try {
          result = mcpCallTool(params?.name, params?.arguments)
        } catch (error) {
          result = mcpToolResult(String(error?.message ?? error), true)
        }
        write({ jsonrpc: "2.0", id, result })
        return
      }
      if (id !== undefined) write({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } })
    })
    rl.on("close", () => {
      process.stdout.write("", () => resolvePromise(0))
    })
  })
}

const PRE_TOOL_READ_ONLY = /read|view|grep|search|glob|list|ls|bash|shell|exec|run|fetch|web|think|todo|plan/

function preToolPatch(ti) {
  const text = [ti.command, ti.input, ti.patch, ti.text].find((v) => typeof v === "string")
  if (text === undefined) return 0
  const deltas = extractPatchDeltas(text)
  if (deltas.length === 0) return 0
  const root = gitToplevel(process.cwd())
  let config = null
  try {
    config = loadConfig(root)
  } catch {
    config = null
  }
  let blocked = false
  for (const { filePath, added } of deltas) {
    if (isGeneratedFile(filePath, "", { gitattr: null, cfgPaths: [], scanGenerated: config?.scanGenerated === true })) continue
    let violations = detectCommentSlop(added, profileFor(filePath) ?? undefined, true).filter((v) => v.severity === "error")
    const disk = readDisk(filePath)
    const genText = typeof disk === "string" ? disk : added.join("\n")
    if (isGeneratedFile(toRel(root, resolve(filePath)), genText, genContext(root, config))) {
      violations = violations.filter((v) => SECURITY_RULES.has(v.rule))
    }
    for (const v of violations) {
      process.stderr.write(`slop-gate: ${v.rule} [${v.severity}] at ${filePath}:${v.lineNo}\n${v.lines.join("\n")}\ninstead: ${RULE_BY_ID.get(v.rule).instead}\n`)
    }
    if (violations.length > 0) blocked = true
  }
  return blocked ? 2 : 0
}

function cmdPreTool() {
  let payload
  try {
    payload = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    process.stderr.write("slop-gate: --pre-tool: stdin не является JSON — проверка пропущена\n")
    return 0
  }
  let tool = String(payload?.tool_name ?? "").toLowerCase()
  if (tool === "write_file") tool = "write"
  else if (tool === "replace") tool = "edit"
  const ti = payload?.tool_input ?? {}
  if (tool === "apply_patch") return preToolPatch(ti)
  if (tool !== "write" && tool !== "edit" && tool !== "multiedit") {
    if (PRE_TOOL_READ_ONLY.test(tool)) return 0
    const shapePath = ti.file_path ?? ti.filePath
    const shapePatch = [ti.command, ti.input, ti.patch, ti.text].find((v) => typeof v === "string")
    if (typeof shapePath === "string" && typeof ti.content === "string") tool = "write"
    else if (
      typeof shapePath === "string" &&
      typeof (ti.old_string ?? ti.oldString ?? ti.old_str) === "string" &&
      typeof (ti.new_string ?? ti.newString ?? ti.new_str) === "string"
    )
      tool = "edit"
    else if (typeof shapePath === "string" && Array.isArray(ti.edits)) tool = "multiedit"
    else if (typeof shapePatch === "string" && shapePatch.includes("*** Begin Patch")) return preToolPatch(ti)
    else return 0
  }
  const root = gitToplevel(process.cwd())
  let config = null
  try {
    config = loadConfig(root)
  } catch {
    config = null
  }
  const extracted = addedFromToolArgs(
    tool,
    {
      filePath: ti.file_path ?? ti.filePath,
      content: ti.content,
      oldString: ti.old_string ?? ti.oldString ?? ti.old_str,
      newString: ti.new_string ?? ti.newString ?? ti.new_str,
      edits: Array.isArray(ti.edits)
        ? ti.edits.map((e) => ({ oldString: e?.old_string ?? e?.oldString, newString: e?.new_string ?? e?.newString }))
        : ti.edits,
    },
    { includeGenerated: config?.scanGenerated === true },
  )
  if (extracted === null) return 0
  let violations = detectCommentSlop(extracted.added, profileFor(extracted.filePath) ?? undefined, true).filter((v) => v.severity === "error")
  const disk = readDisk(extracted.filePath)
  const genText = typeof disk === "string" ? disk : extracted.added.join("\n")
  if (isGeneratedFile(toRel(root, resolve(extracted.filePath)), genText, genContext(root, config))) {
    violations = violations.filter((v) => SECURITY_RULES.has(v.rule))
  }
  if (violations.length === 0) return 0
  for (const v of violations) {
    process.stderr.write(`slop-gate: ${v.rule} [${v.severity}] at ${extracted.filePath}:${v.lineNo}\n${v.lines.join("\n")}\ninstead: ${RULE_BY_ID.get(v.rule).instead}\n`)
  }
  return 2
}

const BENCH_COHORT = [
  { repo: "expressjs/express", sha: "43020ff2753477a5abc75a72931a807503d31bbf" },
  { repo: "pallets/flask", sha: "6b054f8f3876ff4c31580b014d344c4cf491059d" },
  { repo: "gin-gonic/gin", sha: "3f818c3fa69e03feb46d2b49d2a8084c425cbed6" },
  { repo: "tokio-rs/tokio", sha: "b3ff911c389405a5fc2fb931517449c26b252d56" },
  { repo: "rack/rack", sha: "e9f2f246377da9d1c1cb55dae4328273ef235488" },
  { repo: "redis/redis", sha: "dc57ee03b1c5b8f646718e362f3a809a7511ad36" },
  { repo: "PowerShell/PowerShell", sha: "c066cd85aa5c0dec8bb4a7007f86431693bf0542" },
  { repo: "vuejs/vue", sha: "9e88707940088cb1f4cd7dd210c9168a50dc347c" },
]

function benchCacheRoot() {
  return process.env.STOP_AI_SLOP_BENCH_CACHE ?? join(homedir(), ".cache", "stop-ai-slop", "bench")
}

function benchEnsureRepo(repo, sha) {
  const dir = join(benchCacheRoot(), repo.replace("/", "--"))
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  try {
    if (!existsSync(join(dir, ".git"))) {
      mkdirSync(dir, { recursive: true })
      git(["init", "-q"])
      git(["remote", "add", "origin", `https://github.com/${repo}`])
    }
    let head = null
    try {
      head = git(["rev-parse", "HEAD"]).trim()
    } catch {
      head = null
    }
    if (head !== sha) {
      console.log(`slop-gate: bench: fetch ${repo}@${sha.slice(0, 12)}`)
      git(["fetch", "-q", "--depth", "1", "origin", sha])
      git(["checkout", "-q", "FETCH_HEAD"])
    }
    return dir
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? error).trim().split("\n")[0]
    console.error(`slop-gate: bench: не удалось получить ${repo}@${sha.slice(0, 12)}: ${detail}`)
    return null
  }
}

function benchScanRepo(dir) {
  const files = collectFiles(["."], dir, [])
  const findings = scanFiles(files, dir, null, { gitattr: loadGitattributesGenerated(dir), cfgPaths: [], scanGenerated: false })
  const counts = {}
  for (const f of findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1
  return counts
}

function benchDelta(history, current) {
  const out = []
  for (const [repo, rules] of Object.entries(current)) {
    const was = history[repo] ?? {}
    for (const [rule, now] of Object.entries(rules)) {
      const prev = was[rule] ?? 0
      if (now > prev) out.push({ repo, rule, was: prev, now })
    }
  }
  return out.sort((a, b) => (a.repo === b.repo ? (a.rule < b.rule ? -1 : 1) : a.repo < b.repo ? -1 : 1))
}

function benchSorted(perRepo) {
  const out = {}
  for (const repo of Object.keys(perRepo).sort()) {
    const rules = {}
    for (const rule of Object.keys(perRepo[repo]).sort()) rules[rule] = perRepo[repo][rule]
    out[repo] = rules
  }
  return out
}

function cmdBench(write) {
  const perRepo = {}
  for (const { repo, sha } of BENCH_COHORT) {
    const dir = benchEnsureRepo(repo, sha)
    if (dir === null) return 2
    perRepo[repo] = benchScanRepo(dir)
  }
  const sorted = benchSorted(perRepo)
  for (const [repo, rules] of Object.entries(sorted)) {
    const total = Object.values(rules).reduce((a, b) => a + b, 0)
    console.log(`${repo}: ${total}`)
    for (const [rule, n] of Object.entries(rules)) console.log(`  ${rule} ${n}`)
  }
  const historyPath = join(gitToplevel(process.cwd()), "bench-history.json")
  if (write) {
    writeFileSync(historyPath, JSON.stringify(sorted, null, 2) + "\n")
    console.log(`slop-gate: bench: эталон записан -> bench-history.json (${BENCH_COHORT.length} репозиториев)`)
    return 0
  }
  let history = {}
  if (existsSync(historyPath)) {
    try {
      const parsed = JSON.parse(readFileSync(historyPath, "utf8"))
      history = typeof parsed === "object" && parsed !== null ? parsed : {}
    } catch {
      history = {}
    }
  } else {
    console.log("slop-gate: bench: история пуста — запишите эталон через --bench-write")
  }
  const delta = benchDelta(history, perRepo)
  if (delta.length === 0) {
    console.log("slop-gate: bench: роста счётчиков нет")
    return 0
  }
  console.log("slop-gate: bench: рост счётчиков против истории (FP-регрессия):")
  for (const d of delta) console.log(`  ${d.repo} ${d.rule}: было ${d.was}, стало ${d.now}`)
  return 1
}

function cmdUsage() {
  console.log(
    [
      "slop-gate — гейт против slop-комментариев",
      "",
      "Режимы:",
      "  scan [paths...]     сканировать файлы (по умолчанию текущий каталог)",
      "  --fix [paths...]    применить механические фиксы (удаление/сжатие slop-комментариев)",
      "  --fix --dry-run     показать unified-diff планируемых правок, ничего не меняя",
      "  --staged            добавленные строки из git diff --cached",
      "  --diff <ref>        добавленные строки относительно ref",
      "  --baseline-write    записать текущие находки в baseline",
      "  --baseline-prune    удалить из baseline записи без живых находок",
      "  --bench             счётчики находок по правилам на пин-когорте OSS-репо + дельта против bench-history.json",
      "  --bench-write       перезаписать bench-history.json текущими счётчиками когорты",
      "  --install           npm scripts + pre-commit hook в текущем репо",
      "  --install-hooks     хук-конфиги агентов (Codex, VS Code Copilot, Devin) + сниппеты Gemini/Qwen",
      "  --install-rules    rules-файлы агентов (Cursor, Windsurf, Aider, Cline, Devin, Copilot) из таблицы RULES",
      "  --explain <rule-id> обоснование правила",
      "  --audit [N]         последние N записей аудит-лога решений гейта",
      "  --self-test         саботаж-тест детектора",
      "  --mcp               MCP-сервер (JSON-RPC 2.0 по stdio)",
      "  --pre-tool          PreToolUse-хук Claude Code: блокирует Write/Edit до записи",
      "  --stdin-path        PostToolUse-хук: сканирует путь к файлу из JSON в stdin",
      "",
      "Флаги: --strict (warning тоже блокируют), --format <text|json|sarif> (формат вывода), --help",
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
  const parsed = parseFormat(argv)
  if (parsed === null) return 2
  const { format } = parsed
  argv = parsed.rest
  if (argv.includes("--install")) return cmdInstall(strict)
  if (argv.includes("--install-hooks")) return cmdInstallHooks()
  if (argv.includes("--install-rules")) return cmdInstallRules()
  if (argv.includes("--fix")) {
    const paths = argv.filter((a) => a !== "scan" && !a.startsWith("--"))
    return cmdFix(paths.length > 0 ? paths : ["."], { dryRun: argv.includes("--dry-run"), strict })
  }
  if (argv.includes("--staged")) return cmdStaged(strict, format)
  const diffIdx = argv.indexOf("--diff")
  if (diffIdx !== -1) {
    const ref = argv[diffIdx + 1]
    if (ref === undefined || ref.startsWith("--")) {
      console.error("slop-gate: --diff требует ref (например, main)")
      return 2
    }
    return cmdDiff(ref, strict, format)
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
  if (argv.includes("--bench-write")) return cmdBench(true)
  if (argv.includes("--bench")) return cmdBench(false)
  if (argv.includes("--stdin-path")) return cmdStdinPath()
  if (argv.includes("--mcp")) return cmdMcp()
  if (argv.includes("--pre-tool")) return cmdPreTool()
  const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN_FLAGS.has(a))
  if (unknown.length > 0) {
    console.error(`slop-gate: неизвестный флаг ${unknown[0]} (справка: --help)`)
    return 2
  }
  const paths = argv.filter((a) => a !== "scan" && !a.startsWith("--"))
  return cmdScan(paths.length > 0 ? paths : ["."], { writeBaseline: argv.includes("--baseline-write"), strict, format })
}

const isMain = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  } catch {
    return false
  }
})()
if (isMain) {
  const exitCode = main(process.argv.slice(2))
  if (exitCode instanceof Promise) exitCode.then((code) => process.exit(code), () => process.exit(2))
  else process.exit(exitCode)
}
