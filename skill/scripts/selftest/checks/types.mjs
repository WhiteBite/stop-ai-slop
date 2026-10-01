import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

const DECL_PATTERNS = [
  ["functions", /^export\s+declare\s+function\s+(\w+)/],
  ["consts", /^export\s+declare\s+const\s+(\w+)/],
  ["interfaces", /^export\s+interface\s+(\w+)/],
  ["types", /^export\s+type\s+(\w+)/],
]

export function declaredExports(text) {
  const out = { functions: [], consts: [], interfaces: [], types: [] }
  for (const line of text.split(/\r?\n/)) {
    for (const [key, re] of DECL_PATTERNS) {
      const m = line.match(re)
      if (m) {
        out[key].push(m[1])
        break
      }
    }
  }
  return out
}

export function parityFailures(declared, runtimeKeys) {
  const failures = []
  const declaredValues = [...declared.functions, ...declared.consts]
  for (const name of runtimeKeys) {
    if (!declaredValues.includes(name)) failures.push(`runtime export "${name}" has no declaration in scan.d.mts`)
  }
  for (const name of declaredValues) {
    if (!runtimeKeys.includes(name)) failures.push(`declared "${name}" does not exist at runtime`)
  }
  return failures
}

export default async function ({ check, selfPath }) {
  const dts = readFileSync(join(dirname(selfPath), "scan.d.mts"), "utf8")
  const declared = declaredExports(dts)
  const runtimeKeys = Object.keys(await import(pathToFileURL(selfPath).href))
  const failures = parityFailures(declared, runtimeKeys)
  check(
    "types-dts-parity: каждое runtime-значение объявлено в scan.d.mts, каждое объявление существует в рантайме",
    failures.length === 0,
    failures.join("; "),
  )
  check(
    "types-dts-count: фасад scan.mjs экспортирует ровно 23 имени",
    runtimeKeys.length === 23,
    `count ${runtimeKeys.length}: ${runtimeKeys.sort().join(", ")}`,
  )
  const cfgStart = dts.indexOf("interface SlopConfig")
  const cfgBlock = cfgStart === -1 ? "" : dts.slice(cfgStart, dts.indexOf("}", cfgStart))
  const rulesLine = cfgBlock.split(/\r?\n/).find((l) => /^\s*rules:/.test(l))
  check(
    "types-dts-loadconfig: rules в SlopConfig объявлен как Map, не Record<string, string>",
    rulesLine !== undefined && rulesLine.includes("Map") && !rulesLine.includes("Record<string, string>"),
    rulesLine === undefined ? "SlopConfig.rules not found" : rulesLine.trim(),
  )
  const typeOnly = [...declared.interfaces, ...declared.types]
  check(
    "types-dts-typeonly: interface/type объявления синтаксически присутствуют",
    declared.interfaces.length > 0 && declared.types.length > 0 && typeOnly.every((n) => /^\w+$/.test(n)),
    `interfaces: ${declared.interfaces.join(",")}; types: ${declared.types.join(",")}`,
  )
}
