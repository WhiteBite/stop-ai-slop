import { DIVIDER_CHARS } from "./markers.mjs"

export const P = (prefixes, blocks = [], doc = [], suffixes = [], regexPrefixes = [], flags = {}) => ({ prefixes, blocks, doc, suffixes, regexPrefixes, ...flags })
export const JSDOC = { openRe: /^\/\*\*/, close: "*/" }
// close "" always matches the rest of the line, so each /// line is a self-contained doc line (dartdoc/rustdoc/XML doc)
export const TRIPLE_SLASH_DOC = { openRe: /^\/\/\//, close: "" }
export const PYDOC_DQ = { openRe: /^[rbf]?"""/, close: '"""' }
export const PYDOC_SQ = { openRe: /^[rbf]?'''/, close: "'''" }
export const PROFILES = {
  legacy: P(["//", "#", "/*", "*"], [["/*", "*/"], ["{/*", "*/}"]], [JSDOC, TRIPLE_SLASH_DOC, PYDOC_DQ], ["*/"]),
  cfamily: P(["//", "/*", "*"], [["/*", "*/"], ["{/*", "*/}"]], [JSDOC, TRIPLE_SLASH_DOC], ["*/"], [], { templates: true }),
  golang: P(["//", "/*", "*"], [["/*", "*/"], ["{/*", "*/}"]], [JSDOC, TRIPLE_SLASH_DOC], ["*/"], [], { goDoc: true, templates: true }),
  css: P(["//", "/*", "*"], [["/*", "*/"]], [], ["*/"]),
  py: P(["#"], [], [PYDOC_DQ, PYDOC_SQ]),
  php: P(["//", "#", "/*", "*"], [["/*", "*/"]], [JSDOC], ["*/"]),
  hash: P(["#"]),
  // Gherkin # blocks are spec prose: multi-line and header are normal, other rules stay on
  gherkin: P(["#"], [], [], [], [], { noMultiLine: true, noSummaryHeader: true }),
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
  vue: P(["//", "/*", "*", "<!--"], [["/*", "*/"], ["{/*", "*/}"], ["<!--", "-->"]], [JSDOC], ["*/"], [], { templates: true }),
  dash: P(["--"]),
  hashblock: P(["#", "/*", "*"], [["/*", "*/"]], [], ["*/"]),
  coffee: P(["#"], [["###", "###"]]),
  adoc: P(["//"], [["////", "////"]]),
  handlebars: P(["{{!", "<!--"], [["{{!--", "--}}"], ["<!--", "-->"]]),
  gotmpl: P(["{{/*"], [["{{/*", "*/}}"]]),
}
export const PROSE_PROFILES = new Set([PROFILES.markup, PROFILES.mdxblock, PROFILES.rst, PROFILES.adoc])
export const EXT_PROFILE = {
  ".ts": "cfamily", ".tsx": "cfamily", ".js": "cfamily", ".jsx": "cfamily", ".mjs": "cfamily", ".cjs": "cfamily",
  ".kt": "cfamily", ".kts": "cfamily", ".java": "cfamily", ".rs": "cfamily", ".cs": "cfamily",
  ".c": "cfamily", ".h": "cfamily", ".cc": "cfamily", ".cpp": "cfamily", ".hh": "cfamily", ".hpp": "cfamily",
  ".go": "golang",
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
  ".pyi": "py", ".feature": "gherkin", ".mod": "hash", ".sum": "hash", ".tmpl": "gotmpl",
  ".plist": "markup", ".pbxproj": "markup", ".xib": "markup", ".storyboard": "markup", ".rst": "rst",
  ".vue": "vue", ".svelte": "vue", ".astro": "vue",
  ".vhd": "dash", ".vhdl": "dash", ".adb": "dash", ".ads": "dash",
  ".coffee": "coffee", ".litcoffee": "coffee",
  ".adoc": "adoc", ".asciidoc": "adoc",
  ".hbs": "handlebars",
  ".tpl": "gotmpl", ".gotmpl": "gotmpl", ".gohtml": "gotmpl",
}
export const FILENAME_PROFILE = {
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

const extOf = (base) => {
  const rest = base.replace(/^\.+/, "")
  const dot = rest.lastIndexOf(".")
  return dot === -1 ? "" : rest.slice(dot)
}
export function profileFor(filePath) {
  const base = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? ""
  const exact = FILENAME_PROFILE[base]
  if (exact !== undefined) return PROFILES[exact] ?? null
  const byExt = EXT_PROFILE[extOf(base)]
  if (byExt !== undefined) return PROFILES[byExt] ?? null
  for (const [name, profile] of Object.entries(FILENAME_PROFILE)) {
    if (base.startsWith(name + ".")) return PROFILES[profile] ?? null
  }
  return null
}
export const SKIPPED_SEGMENTS = new Set([
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
export const CLI_SKIPPED_SEGMENTS = new Set([...SKIPPED_SEGMENTS, "coverage", ".git"])
export const MAX_COMMENT_LENGTH = 120
export function isCommentLine(line, profile = PROFILES.legacy) {
  const t = line.trim()
  if (profile.prefixes.some((p) => t.startsWith(p))) return true
  // a bare `*/` suffix is a regex literal or stray code unless a block opener is on the line
  if (profile.suffixes.some((s) => t.endsWith(s)) && profile.blocks.some(([open]) => t.includes(open))) return true
  return profile.regexPrefixes.some((re) => re.test(t))
}

// block middles carry no marker (`<#` in ps1, bare lines in /* */), so per-line filtering alone would drop them
export function commentLines(lines, profile = PROFILES.legacy) {
  const out = []
  let close = null
  for (const line of lines) {
    const t = line.trim()
    if (close !== null) {
      out.push(line)
      if (t.includes(close)) close = null
      continue
    }
    const opened = profile.blocks.find(([open, end]) => t.startsWith(open) && !t.slice(open.length).includes(end))
    if (opened !== undefined) {
      out.push(line)
      close = opened[1]
      continue
    }
    const doc = profile.doc.find((d) => d.openRe.test(t))
    if (doc !== undefined) {
      out.push(line)
      const m = doc.openRe.exec(t)
      if (!t.slice(m[0].length).includes(doc.close)) close = doc.close
      continue
    }
    if (isCommentLine(line, profile)) out.push(line)
  }
  return out
}

export function stripCommentMarker(line) {
  return line
    .trim()
    .replace(/^(?:\/\/+|\/\*+|\*+|#+|--+|;+|%+|!+|\(\*+|<!--+|::+|\.\.+|'+|"+|\{\{!--?|\{\{!|\{\{\/\*+)\s?/, "")
    .replace(/\*\/\s*$/, "")
    .replace(/^[rbf]?(?:"""|''')/, "")
    .replace(/(?:"""|''')$/, "")
}

export function dividerReason(trimmed) {
  if (DIVIDER_CHARS.test(trimmed)) return "bare-line"
  const inner = stripCommentMarker(trimmed).trim()
  return inner.length >= 6 && DIVIDER_CHARS.test(inner) ? "comment-marked" : null
}
export const INLINE_SAFE_PREFIXES = new Set(["//", "#", "--", "%", ";", "!"])

// маркер валиден при пустом стеке строк; ${ } — интерполяция кода; line-local: многострочный template не виден
function templateMarkerAt(line, markers) {
  const stack = []
  let i = 0
  while (i < line.length) {
    const top = stack[stack.length - 1]
    if (top === "'" || top === '"' || top === "`") {
      if (line[i] === "\\") i += 2
      else if (line[i] === top) {
        stack.pop()
        i++
      } else if (top === "`" && line[i] === "$" && line[i + 1] === "{") {
        stack.push("{")
        i += 2
      } else i++
      continue
    }
    if (top === "{") {
      if (line[i] === "'" || line[i] === '"' || line[i] === "`") stack.push(line[i])
      else if (line[i] === "{") stack.push("{")
      else if (line[i] === "}") stack.pop()
      i++
      continue
    }
    const hit = markers.find((m) => line.startsWith(m, i))
    if (hit !== undefined) return i > 0 ? { idx: i, marker: hit } : null
    if (line[i] === "'" || line[i] === '"' || line[i] === "`") stack.push(line[i])
    i++
  }
  return null
}

export function inlineMarkerAt(line, profile) {
  const markers = profile.prefixes
    .filter((p) => INLINE_SAFE_PREFIXES.has(p))
    .filter((p) => !(p === "//" && (profile === PROFILES.py || profile === PROFILES.pascal)))
    .map((p) => (p === "#" ? " #" : p))
  if (profile.templates === true) return templateMarkerAt(line, markers)
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

export function inlineComment(line, profile) {
  const m = inlineMarkerAt(line, profile)
  if (m === null) return null
  return m.marker === "//" ? line.slice(m.idx) : "//" + line.slice(m.idx + m.marker.length).trimStart()
}
