import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export function loadBaseline(root) {
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

export function baselineKey(f) {
  return `${f.rel}:${f.lineNo}`
}

export function fingerprint(f) {
  return createHash("sha256")
    .update(f.rule + "\n" + f.lines.map((l) => l.trim()).join("\n"))
    .digest("hex")
    .slice(0, 16)
}

export function isBaselined(baseline, f) {
  if (baseline.fp.size > 0) return baseline.fp.has(fingerprint(f))
  return baseline.legacy.has(baselineKey(f))
}

export function maskBaselined(baseline, findings) {
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

export function writeBaselineFile(root, findings) {
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
