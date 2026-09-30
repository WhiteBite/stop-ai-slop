#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath, pathToFileURL } from "node:url"
import { HELP_EN, HELP_RU, MESSAGES, RULE_TEXT_EN } from "./messages.mjs"

let LANG = "ru"

export function resolveLang(argv, env = process.env) {
  const flagIdx = argv.indexOf("--lang")
  if (flagIdx !== -1) {
    const value = argv[flagIdx + 1]
    if (value !== "ru" && value !== "en") return { lang: null, error: true }
    return { lang: value, error: false }
  }
  const explicit = env.STOP_AI_SLOP_LANG
  if (explicit === "ru" || explicit === "en") return { lang: explicit, error: false }
  const locale = env.LC_ALL ?? env.LANG
  if (typeof locale === "string" && locale !== "") return { lang: locale.toLowerCase().startsWith("ru") ? "ru" : "en", error: false }
  return { lang: "ru", error: false }
}

export function setLang(lang) {
  LANG = lang
}

export function currentLang() {
  return LANG
}

const T = (key, ...args) => {
  const entry = MESSAGES[LANG]?.[key] ?? MESSAGES.ru[key]
  return typeof entry === "function" ? entry(...args) : entry
}
const rt = (ruleId, field) => (LANG === "en" ? RULE_TEXT_EN[ruleId]?.[field] : undefined) ?? RULE_BY_ID.get(ruleId)?.[field]

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
    id: "vend/cross-file-ref",
    severity: "warning",
    message: "указатель на другой файл/строку в комментарии (handler.py:147)",
    why: "Указатель на строку чужого файла гниёт при первой же правке там: номер перестаёт совпадать, и ни один инструмент этого не заметит. URL и host:port не флагаются.",
    instead: "импортировать символ и сослаться на него — резолвится компилятором; либо назвать причину, а не место",
    write: "// формат фиксирован вендором, см. спеку из тикета",
    ignoreWhen: "URL с якорем #L12, host:port",
  },
  {
    id: "vend/obvious-comment",
    severity: "warning",
    message: "комментарий пересказывает строку кода под ним",
    why: "Пересказ строки под ним не добавляет информации: код сам себя описывает, а пересказ рассинхронизируется при первом же рефакторинге. Комментарий с «почему» (т.к., чтобы, иначе, must, должен…) не флагается.",
    instead: "удалить; неочевидное ограничение — отдельной строкой с «почему»",
    write: "// сбрасываем здесь, т.к. ниже освобождаем слот",
    ignoreWhen: "комментарий содержит обоснование; только кодовые профили, не проза",
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

export const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]))

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
  php: P(["//", "#", "/*", "*"], [["/*", "*/"]], [JSDOC], ["*/"]),
  hash: P(["#"]),
  yaml: P(["#"], [], [], [], [], { blockScalars: true }),
  powershell: P(["#"], [["<#", "#>"]]),
  julia: P(["#"], [["#=", "=#"]]),
  nim: P(["#"], [["#[", "]#"]]),
  sql: P(["--", "#", "/*", "*"], [["/*", "*/"]], [], ["*/"]),
  lua: P(["--"], [["--[[", "]]"]]),
  haskell: P(["--"], [["{-", "-}"]]),
  lisp: P([";"]),
  percent: P(["%"]),
  fortran: P(["!"]),
  vb: P(["'"], [], [], [], [/^rem\b/i]),
  batch: P(["::"], [], [], [], [/^rem\b/i]),
  vim: P(['"']),
  markup: P(["<!--"], [["<!--", "-->"]]),
  mdxblock: P(["<!--"], [["<!--", "-->"], ["{/*", "*/}"]]),
  ocaml: P(["(*"], [["(*", "*)"]], [], ["*)"]),
  pascal: P(["//", "(*"], [["(*", "*)"]], [TRIPLE_SLASH_DOC], ["*)"]),
  ini: P([";", "#"]),
  properties: P(["#", "!"]),
  rst: P([".."]),
  vue: P(["//", "/*", "*", "<!--"], [["/*", "*/"], ["{/*", "*/}"], ["<!--", "-->"]], [JSDOC], ["*/"]),
  dash: P(["--"]),
  hashblock: P(["#", "/*", "*"], [["/*", "*/"]], [], ["*/"]),
  coffee: P(["#"], [["###", "###"]]),
  adoc: P(["//"], [["////", "////"]]),
  handlebars: P(["{{!", "<!--"], [["{{!--", "--}}"], ["<!--", "-->"]]),
  gotmpl: P(["{{/*"], [["{{/*", "*/}}"]]),
}
const PROSE_PROFILES = new Set([PROFILES.markup, PROFILES.mdxblock, PROFILES.rst, PROFILES.adoc])
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
  ".rb": "hash", ".php": "php", ".sh": "hash", ".bash": "hash", ".zsh": "hash", ".ksh": "hash", ".fish": "hash",
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
  ".html": "markup", ".htm": "markup", ".xml": "markup", ".svg": "markup", ".xhtml": "markup", ".md": "markup",
  ".mdx": "mdxblock",
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

export function loadGitattributesGenerated(root) {
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
const TODO_WORD = /\btodo\b/i
const TICKET_REF = /[A-Z]+-\d+/
const ISSUE_LINK = /https?:\/\/\S+|#\d+/
const LONG_LINK = /https?:\/\/\S{30,}/
const CROSS_FILE_REF = /(?<![\w@:./\\-])((?:[\w.-]+[\/\\])*)([\w-]+)\.([A-Za-z]{1,5}):(\d+)/
const CODE_REF_EXT = new Set(
  "ts tsx js jsx mjs cjs mts cts py pyi rb go rs java kt kts cs c h cc cpp hpp hh swift dart scala php sh bash ps1 sql yaml yml toml json md mdx html css scss less vue svelte astro lua ex exs erl hrl clj cljs fs fsx pl pm r jl nim zig gradle proto tf nix v sv qml coffee tex vim bat mk cmake bzl sol res".split(
    " ",
  ),
)
const isCrossFileRef = (text) => {
  const m = CROSS_FILE_REF.exec(text)
  if (m === null) return false
  return m[1] !== "" || CODE_REF_EXT.has(m[3].toLowerCase())
}
const OBVIOUS_STOPWORDS = new Set(
  (
    "a an the this that these those is are was were be been being of to in on for with and or not no it its if then else from by as at we you they do does did has have had will would can could may might there their them he she his her him но и или не в на для с от до по как что же бы ли уже ещё при над под без через между его её их мы вы он она они оно этот эта это эти тот там тут"
  ).split(" "),
)
const OBVIOUS_WHY =
  /because|since|otherwise|unless|until|so that|in case|workaround|invariant|constraint|intentionally|deliberately|required|\bmust\b|\bshould\b|\bcannot\b|\bavoid\b|\bonly\b|\butc\b|\bgmt\b|\bms\b|millisecond|second|т\.?\s*к\.|так как|потому что|чтобы|иначе|если|пока|должн|нужно|надо|обязательн|нельзя|воркэраунд|инвариант|ограничен|осторожн|намеренн|специальн|требует|только|миллисекунд|секунд/i
const OBVIOUS_WORD_SPLIT = /[^a-zа-яё0-9]+/
const camelSplit = (line) => line.replace(/([a-z0-9])(?=[A-Z])/g, "$1 ")
const commentContentWords = (text) =>
  text
    .toLowerCase()
    .split(OBVIOUS_WORD_SPLIT)
    .filter((w) => w !== "" && /[a-zа-яё]/.test(w) && !OBVIOUS_STOPWORDS.has(w))
const codeTokenSet = (line) =>
  new Set(
    camelSplit(line)
      .toLowerCase()
      .split(OBVIOUS_WORD_SPLIT)
      .filter((w) => w !== ""),
  )
const isObviousComment = (text, codeLine) => {
  if (OBVIOUS_WHY.test(text) || CJK_ANY.test(text)) return false
  const words = commentContentWords(text)
  if (words.length === 0 || words.length > 6) return false
  const tokens = codeTokenSet(codeLine)
  const hits = words.filter((w) => tokens.has(w)).length
  return hits >= (text.includes(",") ? 2 : 1)
}

const CP = (...cps) => String.fromCodePoint(...cps)
const BS = CP(0x5c)
const STRIP_INVISIBLE = new RegExp("[" + CP(0x200b) + "-" + CP(0x200f) + CP(0xfeff) + "]", "g")
const CJK = "[\\u2E80-\\u2EFF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u3040-\\u30FF\\uAC00-\\uD7AF]"
const CJK_ANY = new RegExp(CJK)
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

const MUTATING_TOOLS = new Set(["edit", "write", "multiedit"])
const GATE_POLICY =
  "комментарий — максимум одна строка и только неочевидное внешнее ограничение/инвариант/воркэраунд; пересказ диффа (было/стало/почему тест существует) живёт в коммите и имени теста. Убери комментарий или сожми до одной строки WHY."

export function evaluateEdit(tool, args, opts) {
  if (typeof tool !== "string" || !MUTATING_TOOLS.has(tool)) {
    return { tool, evaluated: false, blocked: false, filePath: null, addedCount: 0, violations: [], message: null }
  }
  const extracted = addedFromToolArgs(tool, args ?? {}, opts)
  if (extracted === null) {
    return {
      tool,
      evaluated: false,
      blocked: false,
      filePath: typeof args?.filePath === "string" ? args.filePath : null,
      addedCount: 0,
      violations: [],
      message: null,
    }
  }
  const violations = detectCommentSlop(extracted.added, profileFor(extracted.filePath) ?? undefined, true).filter(
    (v) => v.severity === "error",
  )
  const result = {
    tool,
    evaluated: true,
    blocked: violations.length > 0,
    filePath: extracted.filePath,
    addedCount: extracted.added.length,
    violations,
    message: null,
  }
  if (violations.length > 0) {
    result.message = violations
      .map(
        (v) =>
          `comment-gate: ${v.rule} [${v.severity}] at ${extracted.filePath}:${v.lineNo}\n${v.lines.join("\n")}\ninstead: ${
            RULE_BY_ID.get(v.rule)?.instead ?? ""
          }\nPolicy: ${GATE_POLICY}`,
      )
      .join("\n\n")
  }
  return result
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

export function collectFiles(paths, root, excludePaths = []) {
  const out = []
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
  const outsideDirs = []
  for (const p of paths) {
    const abs = resolve(root, p)
    if (!existsSync(abs)) throw new Error(T("pathMissing", p))
    if (!statSync(abs).isDirectory()) {
      if (profileFor(toRel(root, abs)) !== null && !isExcludedPath(toRel(root, abs), excludePaths)) out.push(abs)
      continue
    }
    const rel = toRel(root, abs)
    if (rel.startsWith("../") || rel === ".." || isAbsolute(rel)) outsideDirs.push(abs)
  }
  const listed = gitListedFiles(root)
  if (listed !== null) {
    const prefixes = paths
      .map((p) => resolve(root, p))
      .filter((abs) => existsSync(abs) && statSync(abs).isDirectory() && !outsideDirs.includes(abs))
      .map((abs) => toRel(root, abs))
    for (const rel of listed) {
      if (!isCodePath(rel, [...CLI_SKIPPED_SEGMENTS])) continue
      if (isExcludedPath(rel, excludePaths)) continue
      if (!prefixes.some((p) => p === "" || rel === p || rel.startsWith(p + "/"))) continue
      const abs = join(root, rel)
      if (statSync(abs, { throwIfNoEntry: false })?.isFile() !== true) continue
      out.push(abs)
    }
    for (const d of outsideDirs) walk(d)
    return [...new Set(out)].sort()
  }
  for (const p of paths) {
    const abs = resolve(root, p)
    if (existsSync(abs) && statSync(abs).isDirectory() && !outsideDirs.includes(abs)) walk(abs)
  }
  for (const d of outsideDirs) walk(d)
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

export function scanFiles(files, root, options = null, genCtx = null) {
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
  "vend/cross-file-ref",
  "vend/obvious-comment",
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
    console.log(T("fixDryRun", fixedOps, fixedFiles, remaining.length))
    return 0
  }
  const baseline = loadBaseline(root)
  const fresh = maskBaselined(baseline, remaining)
  printFindings(fresh, "text", strict)
  console.log(T("fixApplied", fixedOps, fixedFiles))
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

export const CONFIG_KEYS = ["maxCommentLength", "excludePaths", "generatedPaths", "scanGenerated", "rules"]

export function loadConfig(root) {
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
    lines.push(`${f.rel}:${f.lineNo} ${f.rule} [${f.severity}] ${rt(f.rule, "message")}`)
    lines.push(`  instead: ${rt(f.rule, "instead")}`)
  }
  const errors = findings.filter((f) => f.severity === "error").length
  if (findings.length === 0) lines.push(T("clean"))
  else if (strict && errors === 0) lines.push(T("findingsStrict", findings.length))
  else lines.push(T("findingsCount", findings.length, errors))
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
    console.log(T("baselineWritten", n))
    return 0
  }
  if (prune) {
    const baseline = loadBaseline(root)
    if (baseline.fp.size > 0) {
      const n = writeBaselineFile(root, findings.filter((f) => baseline.fp.has(fingerprint(f))))
      console.log(T("baselinePruned", baseline.fp.size - n))
      return 0
    }
    const keys = new Set(findings.map(baselineKey))
    const kept = [...baseline.legacy].filter((k) => keys.has(k)).sort()
    const body = ["# slop-gate baseline: relpath:line", ...kept].join("\n") + "\n"
    writeFileSync(join(root, "stop-ai-slop.baseline.txt"), body)
    console.log(T("baselinePruned", baseline.legacy.size - kept.length))
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
    console.error(T("gitError", error.message))
    return 2
  }
  if (diff === null) {
    console.log(T("notGitStaged"))
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
    console.error(T("gitError", error.message))
    return 2
  }
  if (diff === null) {
    console.log(T("notGitDiff"))
    return 0
  }
  return runDiffGate(diff, root, strict, format, config, genContext(root, config))
}

function explainText(ruleId) {
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

function cmdExplain(ruleId) {
  const text = explainText(ruleId)
  if (text === null) {
    console.error(T("unknownRule", ruleId, RULES.map((r) => r.id).join(", ")))
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
      if (
        typeof obj !== "object" ||
        obj === null ||
        Array.isArray(obj) ||
        (nested && obj.hooks !== undefined && (typeof obj.hooks !== "object" || obj.hooks === null || Array.isArray(obj.hooks)))
      ) {
        console.log(`slop-gate: ${rel} — не объект, пропущен`)
        return
      }
    }
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

function generateRulesContent() {
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

export const KNOWN_FLAGS = new Set([
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
  "--lang",
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
    console.log(T("auditEmpty"))
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
  console.log(T("auditSummary", path, entries.length, Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")))
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
  return mcpToolResult(T("mcpUnknownTool", name), true)
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
      process.stderr.write(`slop-gate: ${v.rule} [${v.severity}] at ${filePath}:${v.lineNo}\n${v.lines.join("\n")}\ninstead: ${rt(v.rule, "instead")}\n`)
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
      process.stderr.write(T("preToolNotJson") + "\n")
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
    process.stderr.write(`slop-gate: ${v.rule} [${v.severity}] at ${extracted.filePath}:${v.lineNo}\n${v.lines.join("\n")}\ninstead: ${rt(v.rule, "instead")}\n`)
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
      console.log(T("benchFetch", repo, sha.slice(0, 12)))
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

export function benchDelta(history, current) {
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
    console.log(T("benchWritten", BENCH_COHORT.length))
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
    console.log(T("benchNoGrowth"))
    return 0
  }
  console.log(T("benchGrowthHeader"))
  for (const d of delta) console.log(T("benchDeltaLine", d.repo, d.rule, d.was, d.now))
  return 1
}

function cmdUsage() {
  console.log((LANG === "en" ? HELP_EN : HELP_RU).join("\n"))
  return 0
}

const positionalPaths = (argv) => {
  const paths = argv.filter((a) => a !== "scan" && !a.startsWith("--"))
  return paths.length > 0 ? paths : ["."]
}

const MODES = [
  ["--install", (argv, { strict }) => cmdInstall(strict)],
  ["--install-hooks", () => cmdInstallHooks()],
  ["--install-rules", () => cmdInstallRules()],
  ["--fix", (argv, { strict }) => cmdFix(positionalPaths(argv), { dryRun: argv.includes("--dry-run"), strict })],
  ["--staged", (argv, { strict, format }) => cmdStaged(strict, format)],
  [
    "--diff",
    (argv, { strict, format }) => {
      const ref = argv[argv.indexOf("--diff") + 1]
      if (ref === undefined || ref.startsWith("--")) {
        console.error("slop-gate: --diff требует ref (например, main)")
        return 2
      }
      return cmdDiff(ref, strict, format)
    },
  ],
  ["--help", () => cmdUsage()],
  [
    "--audit",
    (argv) => {
      const n = Number(argv[argv.indexOf("--audit") + 1])
      return cmdAudit(Number.isInteger(n) && n > 0 ? n : 20)
    },
  ],
  ["--baseline-prune", (argv) => cmdScan(positionalPaths(argv), { prune: true })],
  ["--bench-write", () => cmdBench(true)],
  ["--bench", () => cmdBench(false)],
  ["--stdin-path", () => cmdStdinPath()],
  ["--mcp", () => cmdMcp()],
  ["--pre-tool", () => cmdPreTool()],
]

function main(argv) {
  if (argv.includes("--self-test")) return import("./selftest.mjs").then((m) => m.cmdSelfTest())
  const lang = resolveLang(argv)
  if (lang.error) {
    console.error(T("langNeedsValue"))
    return 2
  }
  setLang(lang.lang)
  const langIdx = argv.indexOf("--lang")
  if (langIdx !== -1) argv = [...argv.slice(0, langIdx), ...argv.slice(langIdx + 2)]
  const explainIdx = argv.indexOf("--explain")
  if (explainIdx !== -1) {
    const ruleId = argv[explainIdx + 1]
    if (ruleId === undefined || ruleId.startsWith("--")) {
      console.error(T("explainNeedsId"))
      return 2
    }
    return cmdExplain(ruleId)
  }
  const strict = argv.includes("--strict")
  const parsed = parseFormat(argv)
  if (parsed === null) return 2
  const { format } = parsed
  argv = parsed.rest
  for (const [flag, run] of MODES) {
    if (argv.includes(flag)) return run(argv, { strict, format })
  }
  const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN_FLAGS.has(a) && a !== "--lang")
  if (unknown.length > 0) {
    console.error(T("unknownFlag", unknown[0]))
    return 2
  }
  return cmdScan(positionalPaths(argv), { writeBaseline: argv.includes("--baseline-write"), strict, format })
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
