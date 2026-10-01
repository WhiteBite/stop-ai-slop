import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { RULES } from "./scan.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
export const START = "<!-- stop-ai-slop:rules:start -->"
export const END = "<!-- stop-ai-slop:rules:end -->"

export const TARGETS = [
  { rel: "README.md", kind: "readme-en" },
  { rel: "README.ru.md", kind: "readme-ru" },
  { rel: "skill/SKILL.md", kind: "skill-ru" },
]

const cell = (text) => String(text).replaceAll("|", "\\|").replaceAll("\n", " ")

export function tableFor(kind) {
  if (kind === "readme-en") {
    return ["| Rule | Severity | What it catches |", "| --- | --- | --- |", ...RULES.map((r) => `| \`${r.id}\` | ${r.severity} | ${cell(r.en.message)} |`)].join("\n")
  }
  if (kind === "readme-ru") {
    return ["| Правило | Severity | Суть |", "| --- | --- | --- |", ...RULES.map((r) => `| \`${r.id}\` | ${r.severity} | ${cell(r.message)} |`)].join("\n")
  }
  return [
    "| Правило | Severity | Why | Write | Ignore-when |",
    "| --- | --- | --- | --- | --- |",
    ...RULES.map((r) => `| \`${r.id}\` | ${r.severity} | ${cell(r.why)} | ${cell(r.write)} | ${cell(r.ignoreWhen)} |`),
  ].join("\n")
}

export function renderDoc(raw, kind, rel) {
  const start = raw.indexOf(START)
  const end = raw.indexOf(END)
  if (start === -1 || end === -1) throw new Error(`${rel}: the generated rules table must be surrounded by ${START} and ${END}`)
  if (raw.indexOf(START, start + 1) !== -1 || raw.indexOf(END, end + 1) !== -1) throw new Error(`${rel}: the rules markers must occur exactly once`)
  if (end < start) throw new Error(`${rel}: ${END} appears before ${START}`)
  return raw.slice(0, start + START.length) + "\n" + tableFor(kind) + "\n" + raw.slice(end)
}

function firstDiff(a, b) {
  const left = a.split("\n")
  const right = b.split("\n")
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] !== right[i]) return { line: i + 1, committed: left[i] ?? "", generated: right[i] ?? "" }
  }
  return null
}

function docStates() {
  return TARGETS.map(({ rel, kind }) => {
    const raw = readFileSync(join(ROOT, rel), "utf8")
    return { rel, kind, raw, generated: renderDoc(raw, kind, rel) }
  })
}

function checkDocs() {
  let states
  try {
    states = docStates()
  } catch (error) {
    console.log(`docs: ${String(error.message ?? error)}`)
    return 1
  }
  const stale = states.filter((s) => s.raw !== s.generated)
  if (stale.length === 0) {
    console.log("docs: in sync")
    return 0
  }
  const lines = ["docs: OUT OF SYNC"]
  for (const s of stale) {
    const diff = firstDiff(s.raw, s.generated)
    lines.push(`  ${s.rel}${diff === null ? "" : `:${diff.line}`}`)
    if (diff !== null) {
      lines.push(`    committed: ${diff.committed.slice(0, 160)}`)
      lines.push(`    generated: ${diff.generated.slice(0, 160)}`)
    }
  }
  lines.push("  regenerate: node skill/scripts/gen-docs.mjs --write")
  for (const line of lines) console.log(line)
  return 1
}

function writeDocs() {
  let states
  try {
    states = docStates()
  } catch (error) {
    console.error(`docs: ${String(error.message ?? error)}`)
    return 2
  }
  const stale = states.filter((s) => s.raw !== s.generated)
  if (stale.length === 0) {
    console.log("docs: in sync")
    return 0
  }
  for (const s of stale) writeFileSync(join(ROOT, s.rel), s.generated)
  console.log(`docs: written ${stale.map((s) => s.rel).join(", ")}`)
  return 0
}

function main(argv) {
  const mode = argv.length === 0 ? "--check" : argv[0]
  if (mode !== "--check" && mode !== "--write") {
    console.error(`unknown flag: ${mode}; usage: node skill/scripts/gen-docs.mjs [--write | --check]`)
    return 2
  }
  return mode === "--write" ? writeDocs() : checkDocs()
}

const isMain = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  } catch {
    return false
  }
})()
if (isMain) process.exit(main(process.argv.slice(2)))
