import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { packageVersion, versionSurfaces } from "../../src/version.mjs"

export default async function ({ check, selfRoot, dir }) {
  let surfaces = null
  let loadError = null
  try {
    surfaces = versionSurfaces()
  } catch (error) {
    loadError = error
  }
  if (loadError !== null) {
    check("version-sync-source: packageVersion() читает версию из package.json", false, String(loadError.message ?? loadError))
    return
  }
  const pkgVer = JSON.parse(readFileSync(join(selfRoot, "package.json"), "utf8")).version
  check(
    "version-sync-source: packageVersion() читает версию из package.json",
    packageVersion() === pkgVer,
    `${packageVersion()} vs ${pkgVer}`,
  )
  for (const surface of surfaces) {
    check(surface.name, surface.ok, `${surface.relPath}: expected ${surface.expected}, actual ${surface.actual}`)
  }
  const formula = surfaces.find((surface) => surface.relPath === "Formula/stop-ai-slop.rb")
  check(
    "version-sync-formula-surface: Formula/stop-ai-slop.rb входит в versionSurfaces(), url-тег == package.json",
    formula !== undefined && formula.actual === pkgVer,
    formula === undefined
      ? "Formula/stop-ai-slop.rb отсутствует в versionSurfaces()"
      : `${formula.relPath}: expected ${formula.expected}, actual ${formula.actual}`,
  )
  const missingRoot = join(dir, "version-fail-closed")
  mkdirSync(missingRoot, { recursive: true })
  writeFileSync(join(missingRoot, "package.json"), JSON.stringify({ version: "0.0.0" }))
  const missing = versionSurfaces(missingRoot)
  check(
    "version-sync-fail-closed: отсутствующий файл поверхности = FAIL (actual:missing, ok:false), не skip",
    missing.length === surfaces.length && missing.every((surface) => surface.actual === "missing" && surface.ok === false),
    missing
      .filter((surface) => surface.actual !== "missing" || surface.ok !== false)
      .map((surface) => `${surface.relPath}: actual ${surface.actual}, ok ${surface.ok}`)
      .join("; ") || `все ${missing.length} поверхностей missing`,
  )
}
