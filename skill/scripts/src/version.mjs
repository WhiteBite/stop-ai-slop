import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

let cachedVersion = null

export function packageVersion() {
  if (cachedVersion === null) {
    cachedVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version
  }
  return cachedVersion
}

function readText(relPath) {
  const path = join(ROOT, relPath)
  return existsSync(path) ? readFileSync(path, "utf8") : null
}

function pluginSurface(version) {
  const name = "version-sync-plugin: plugin.json version == package.json"
  const relPath = ".claude-plugin/stop-ai-slop/plugin.json"
  const raw = readText(relPath)
  if (raw === null) return { name, relPath, expected: version, actual: "missing", ok: false }
  let actual = null
  try {
    actual = JSON.parse(raw).version ?? "no version"
  } catch (error) {
    return { name, relPath, expected: version, actual: `invalid: ${String(error.message ?? error)}`, ok: false }
  }
  return { name, relPath, expected: version, actual, ok: actual === version }
}

function schemaSurface(version) {
  const name = "version-sync-schema: schema $id содержит /v<version>/ из package.json"
  const relPath = "schema/stop-ai-slop.schema.json"
  const expected = `v${version}`
  const raw = readText(relPath)
  if (raw === null) return { name, relPath, expected, actual: "missing", ok: false }
  let id = null
  try {
    id = JSON.parse(raw).$id ?? null
  } catch (error) {
    return { name, relPath, expected, actual: `invalid: ${String(error.message ?? error)}`, ok: false }
  }
  if (typeof id !== "string") return { name, relPath, expected, actual: "no $id", ok: false }
  const tag = /\/v(\d+\.\d+\.\d+)\//.exec(id)
  const actual = tag !== null ? `v${tag[1]}` : "no /vX.Y.Z/ tag"
  return { name, relPath, expected, actual, ok: id.includes(`/v${version}/`) }
}

function changelogSurface(version) {
  const name = "version-sync-changelog: CHANGELOG.md содержит секцию ## <version> из package.json"
  const relPath = "CHANGELOG.md"
  const expected = `## ${version}`
  const raw = readText(relPath)
  if (raw === null) return { name, relPath, expected, actual: "missing", ok: false }
  const headings = raw.split(/\r?\n/).filter((line) => line.startsWith("## "))
  const ok = headings.some((line) => line.trim() === expected)
  const released = headings.find((line) => line.trim() !== "## Unreleased")
  const actual = released !== undefined ? released.trim() : "no version heading"
  return { name, relPath, expected, actual, ok }
}

function citationSurface(version) {
  const name = "version-sync-citation: CITATION.cff version == package.json"
  const relPath = "CITATION.cff"
  const raw = readText(relPath)
  if (raw === null) return { name, relPath, expected: version, actual: "missing", ok: false }
  const m = /^version:\s*["']?(\d+\.\d+\.\d+)["']?\s*$/m.exec(raw)
  const actual = m !== null ? m[1] : "no version: line"
  return { name, relPath, expected: version, actual, ok: actual === version }
}

function jsonldSurface(version) {
  const name = "version-sync-jsonld: docs/jsonld.jsonld softwareVersion == package.json"
  const relPath = "docs/jsonld.jsonld"
  const raw = readText(relPath)
  if (raw === null) return { name, relPath, expected: version, actual: "missing", ok: false }
  let actual = null
  try {
    actual = JSON.parse(raw).softwareVersion ?? "no softwareVersion"
  } catch (error) {
    return { name, relPath, expected: version, actual: `invalid: ${String(error.message ?? error)}`, ok: false }
  }
  return { name, relPath, expected: version, actual, ok: actual === version }
}

function modelineSurface(version, relPath) {
  const name = `version-sync-modeline: ${relPath} schema modeline tag == v${version}`
  const expected = `v${version}`
  const raw = readText(relPath)
  if (raw === null) return { name, relPath, expected, actual: "missing", ok: false }
  const m = /\/v(\d+\.\d+\.\d+)\/schema\/stop-ai-slop\.schema\.json/.exec(raw)
  const actual = m !== null ? `v${m[1]}` : "no schema modeline tag"
  return { name, relPath, expected, actual, ok: actual === expected }
}

export function versionSurfaces() {
  const version = packageVersion()
  return [
    pluginSurface(version),
    schemaSurface(version),
    changelogSurface(version),
    citationSurface(version),
    jsonldSurface(version),
    modelineSurface(version, "README.md"),
    modelineSurface(version, "README.ru.md"),
  ]
}
