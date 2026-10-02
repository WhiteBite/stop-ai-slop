import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"

const VENDORED_DIRS = ["src", "registry", "types"]

export default async function ({ check, selfPath }) {
  const vendorRoot = join(dirname(selfPath), "vendor", "harness-kit")
  const problems = []
  let manifest = null
  try {
    manifest = JSON.parse(readFileSync(join(vendorRoot, "manifest.json"), "utf8"))
  } catch {
    problems.push("manifest.json отсутствует или не JSON")
  }
  const walk = (dir, out) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else out.push(full)
    }
    return out
  }
  const onDisk = new Set()
  if (manifest !== null) {
    for (const dir of VENDORED_DIRS) {
      let files = []
      try {
        files = walk(join(vendorRoot, dir), [])
      } catch {
        problems.push(`каталог vendor/harness-kit/${dir} отсутствует`)
        continue
      }
      for (const file of files) {
        const rel = relative(vendorRoot, file).split("\\").join("/")
        onDisk.add(rel)
        const expected = manifest.files[rel]
        if (expected === undefined) {
          problems.push(`файл вне manifest.json: ${rel}`)
          continue
        }
        const actual = createHash("sha256").update(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex")
        if (actual !== expected) problems.push(`sha256 не совпадает с manifest.json: ${rel}`)
      }
    }
    for (const rel of Object.keys(manifest.files)) {
      if (!onDisk.has(rel)) problems.push(`запись manifest.json без файла: ${rel}`)
    }
  }
  check(
    "vendor-kit: vendored harness-kit байт-в-байт совпадает с manifest.json (sha256, LF)",
    problems.length === 0,
    problems.join("; "),
  )
}
