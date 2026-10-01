import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { RULES } from "./scan.mjs"
import { packageVersion } from "./src/version.mjs"

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

function committedId(raw) {
  const id = JSON.parse(raw)?.$id
  return typeof id === "string" ? id : null
}

function loadSchema() {
  const raw = readFileSync(join(ROOT, SCHEMA_REL), "utf8")
  const committed = committedPattern(raw)
  if (committed === null) throw new Error(`patternProperties must have exactly one key in ${SCHEMA_REL}`)
  const id = committedId(raw)
  if (id === null) throw new Error(`$id must be a string in ${SCHEMA_REL}`)
  return { raw, committed, id }
}

function idTag(id) {
  const tag = /\/v(\d+\.\d+\.\d+)\//.exec(id)
  return tag !== null ? tag[1] : null
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

function schemaState() {
  const loaded = loadSchema()
  const version = packageVersion()
  const generated = patternFromRules(RULES)
  const tag = idTag(loaded.id)
  return { loaded, version, generated, tag, patternOk: loaded.committed === generated, idOk: tag === version }
}

function replaceOnce(raw, needle, replacement) {
  const first = raw.indexOf(needle)
  if (first === -1 || raw.indexOf(needle, first + 1) !== -1) {
    throw new Error(`committed value must occur exactly once as raw text in ${SCHEMA_REL}: ${needle.slice(0, 80)}`)
  }
  return raw.slice(0, first) + replacement + raw.slice(first + needle.length)
}

function checkSchema() {
  let state
  try {
    state = schemaState()
  } catch (error) {
    console.log(`schema: ${String(error.message ?? error)}`)
    return 1
  }
  if (state.patternOk && state.idOk) {
    console.log("schema: in sync")
    return 0
  }
  const lines = ["schema: OUT OF SYNC"]
  if (!state.patternOk) {
    lines.push(`  patternProperties committed: ${state.loaded.committed}`)
    lines.push(`  patternProperties generated: ${state.generated}`)
    const delta = idDelta(state.loaded.committed, state.generated)
    if (delta !== null) {
      lines.push(`  missing from schema (present in RULES): ${delta.missing.join(", ") || "—"}`)
      lines.push(`  extra in schema (absent from RULES): ${delta.extra.join(", ") || "—"}`)
    }
  }
  if (!state.idOk) {
    lines.push(`  $id committed tag: ${state.tag ?? "none"}; package.json: ${state.version}`)
    lines.push(`  $id: ${state.loaded.id}`)
  }
  lines.push("  regenerate: node skill/scripts/gen-schema.mjs --write")
  for (const line of lines) console.log(line)
  return 1
}

function writeSchema() {
  let state
  try {
    state = schemaState()
  } catch (error) {
    console.error(`schema: ${String(error.message ?? error)}`)
    return 2
  }
  if (state.patternOk && state.idOk) {
    console.log("schema: in sync")
    return 0
  }
  try {
    let raw = state.loaded.raw
    if (!state.patternOk) {
      raw = replaceOnce(raw, JSON.stringify(state.loaded.committed).slice(1, -1), JSON.stringify(state.generated).slice(1, -1))
    }
    if (!state.idOk) {
      if (state.tag === null) throw new Error(`$id has no /vX.Y.Z/ tag to rewrite in ${SCHEMA_REL}`)
      const expected = state.loaded.id.replace(/\/v\d+\.\d+\.\d+\//, `/v${state.version}/`)
      raw = replaceOnce(raw, JSON.stringify(state.loaded.id).slice(1, -1), JSON.stringify(expected).slice(1, -1))
    }
    writeFileSync(join(ROOT, SCHEMA_REL), raw)
  } catch (error) {
    console.error(`schema: ${String(error.message ?? error)}`)
    return 2
  }
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
