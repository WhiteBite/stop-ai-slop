import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

export default async function ({ check, selfPath, selfRoot }) {
  const genPath = resolve(dirname(selfPath), "gen-marker-manifest.mjs")
  const run = (args) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, [genPath, ...args], { encoding: "utf8", stdio: "pipe" }) }
    } catch (error) {
      return { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
    }
  }
  const sync = run(["--check"])
  check(
    "marker-manifest: marker-manifest.json в синхроне с markers.mjs и SlopMarkers.kt [exit 0]",
    sync.status === 0 && sync.out.includes("in sync"),
    `exit ${sync.status}: ${sync.out.slice(0, 200)}`,
  )
  const { buildManifest, extractJsMarkers } = await import(pathToFileURL(genPath).href)
  const markersPath = join(selfRoot, "skill", "scripts", "src", "markers.mjs")
  const manifestPath = join(selfRoot, "detekt-rules", "src", "test", "resources", "marker-manifest.json")
  let fileJs = null
  let extracted = null
  let readError = null
  try {
    fileJs = JSON.parse(readFileSync(manifestPath, "utf8")).js
    extracted = extractJsMarkers(readFileSync(markersPath, "utf8"))
  } catch (error) {
    readError = error
  }
  const same =
    readError === null &&
    fileJs !== null &&
    extracted !== null &&
    Object.keys(fileJs).length === Object.keys(extracted).length &&
    Object.entries(fileJs).every(([name, source]) => extracted[name] === source)
  check(
    "marker-manifest: js-секция манифеста совпадает с извлечением из markers.mjs",
    same,
    readError !== null
      ? String(readError.message ?? readError)
      : `js entries: file ${Object.keys(fileJs ?? {}).length}, markers.mjs ${Object.keys(extracted ?? {}).length}`,
  )
  let built = null
  let buildError = null
  try {
    built = buildManifest()
  } catch (error) {
    buildError = error
  }
  check(
    "marker-manifest: js/kt наборы имён совпадают с точностью до exemption-листа",
    built !== null,
    buildError !== null
      ? String(buildError.message ?? buildError)
      : `js ${Object.keys(built.js).length} / kt ${Object.keys(built.kt).length} маркеров`,
  )
}
