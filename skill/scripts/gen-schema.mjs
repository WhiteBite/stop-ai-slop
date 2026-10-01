import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { RULES } from "./scan.mjs"

// $id pins a version-tagged raw GitHub URL — consumers fetch the committed file, so generation writes into the repo
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const SCHEMA_REL = "schema/stop-ai-slop.schema.json"

export function patternFromRules(rules) {
  return "^(" + rules.map((r) => r.id).join("|") + ")$"
}

function committedPattern(raw) {
  const patterns = Object.keys(JSON.parse(raw)?.properties?.rules?.patternProperties ?? {})
  return patterns.length === 1 ? patterns[0] : null
}

function loadSchema() {
  const raw = readFileSync(join(ROOT, SCHEMA_REL), "utf8")
  const committed = committedPattern(raw)
  if (committed === null) throw new Error(`patternProperties must have exactly one key in ${SCHEMA_REL}`)
  return { raw, committed }
}

function idDelta(committed, generated) {
  const ids = (pattern) => (pattern.startsWith("^(") && pattern.endsWith(")$") ? pattern.slice(2, -2).split("|") : null)
  const committedIds = ids(committed)
  const generatedIds = ids(generated)
  if (committedIds === null || generatedIds === null) return null
  return {
    missing: generatedIds.filter((id) => !committedIds.includes(id)),
    extra: committedIds.filter((id) => !generatedIds.includes(id)),
  }
}

function checkSchema() {
  let loaded
  try {
    loaded = loadSchema()
  } catch (error) {
    console.log(`schema: ${String(error.message ?? error)}`)
    return 1
  }
  const generated = patternFromRules(RULES)
  if (loaded.committed === generated) {
    console.log("schema: in sync")
    return 0
  }
  const lines = [
    "schema: OUT OF SYNC — patternProperties pattern is not derived from RULES",
    `  committed: ${loaded.committed}`,
    `  generated: ${generated}`,
  ]
  const delta = idDelta(loaded.committed, generated)
  if (delta !== null) {
    lines.push(`  missing from schema (present in RULES): ${delta.missing.join(", ") || "—"}`)
    lines.push(`  extra in schema (absent from RULES): ${delta.extra.join(", ") || "—"}`)
  }
  lines.push("  regenerate: node skill/scripts/gen-schema.mjs --write")
  for (const line of lines) console.log(line)
  return 1
}

function writeSchema() {
  let loaded
  try {
    loaded = loadSchema()
  } catch (error) {
    console.error(`schema: ${String(error.message ?? error)}`)
    return 2
  }
  const generated = patternFromRules(RULES)
  if (loaded.committed === generated) {
    console.log("schema: in sync")
    return 0
  }
  const needle = JSON.stringify(loaded.committed).slice(1, -1)
  const first = loaded.raw.indexOf(needle)
  if (first === -1 || loaded.raw.indexOf(needle, first + 1) !== -1) {
    console.error(`schema: committed pattern must occur exactly once as raw text in ${SCHEMA_REL}`)
    return 2
  }
  const replacement = JSON.stringify(generated).slice(1, -1)
  writeFileSync(join(ROOT, SCHEMA_REL), loaded.raw.slice(0, first) + replacement + loaded.raw.slice(first + needle.length))
  console.log(`schema: written ${SCHEMA_REL}`)
  return 0
}

function main(argv) {
  const mode = argv.length === 0 ? "--check" : argv[0]
  if (mode !== "--check" && mode !== "--write") {
    console.error(`unknown flag: ${mode}; usage: node skill/scripts/gen-schema.mjs [--write | --check]`)
    return 2
  }
  return mode === "--write" ? writeSchema() : checkSchema()
}

const isMain = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  } catch {
    return false
  }
})()
if (isMain) process.exit(main(process.argv.slice(2)))
