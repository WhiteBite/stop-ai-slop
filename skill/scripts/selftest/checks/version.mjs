import { readFileSync } from "node:fs"
import { join } from "node:path"
import { packageVersion, versionSurfaces } from "../../src/version.mjs"

export default async function ({ check, selfRoot }) {
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
    if (surface.actual === "missing") {
      check(surface.name, true, `skip: ${surface.relPath} missing`)
      continue
    }
    check(surface.name, surface.ok, `${surface.relPath}: expected ${surface.expected}, actual ${surface.actual}`)
  }
}
