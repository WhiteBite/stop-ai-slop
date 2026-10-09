import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export default async function ({ check, runCli, selfRoot }) {
  const { RULES } = await import("../../scan.mjs")
  const pg = join(selfRoot, "playground")
  const pkg = JSON.parse(readFileSync(join(pg, "package.json"), "utf8"))
  const deps = pkg.devDependencies ?? {}
  check(
    "playground-manifest: private package, pinned vite + vite-plugin-singlefile, build/dev/preview scripts, no runtime deps",
    pkg.name === "stop-ai-slop-playground" &&
      pkg.private === true &&
      pkg.dependencies === undefined &&
      /^\d+\.\d+\.\d+$/.test(deps.vite ?? "") &&
      /^\d+\.\d+\.\d+$/.test(deps["vite-plugin-singlefile"] ?? "") &&
      pkg.scripts?.build === "vite build" &&
      pkg.scripts?.dev === "vite" &&
      pkg.scripts?.preview === "vite preview",
    JSON.stringify({ deps, scripts: pkg.scripts }),
  )
  const distPath = join(pg, "dist", "index.html")
  const html = existsSync(distPath) ? readFileSync(distPath, "utf8") : ""
  check(
    "playground-dist: committed build is a single self-contained HTML with an inline script and no external refs",
    html.includes("stop-ai-slop playground") &&
      /<script[^>]*>[\s\S]{10000,}<\/script>/.test(html) &&
      !/<script[^>]+\bsrc=/.test(html) &&
      !/(?:src|href)="https?:/.test(html),
    `exists: ${html !== ""}, size: ${html.length}`,
  )
  const missingIds = RULES.map((r) => r.id).filter((id) => !html.includes(id))
  const staleIds = [...new Set(html.match(/vend\/[a-z-]+/g) ?? [])].filter((id) => !RULES.some((r) => r.id === id))
  check(
    "playground-dist-detector: the bundle embeds every rule id from RULES, no stale ids, and both message languages",
    missingIds.length === 0 && staleIds.length === 0 && html.includes("пересказывает") && html.includes("retells the diff"),
    `missing: ${missingIds.join(", ") || "—"}; stale: ${staleIds.join(", ") || "—"}`,
  )
  if (!existsSync(join(pg, "node_modules"))) {
    check("playground-build-env: skip - fresh checkout, the committed dist is the artifact", true)
  } else {
    check("playground-build-env: node_modules present, the committed dist is asserted as-is (never rebuilt here)", true)
  }
  const scanned = runCli(["scan", "playground"], selfRoot)
  check("playground-gate: scan playground exits 0", scanned.status === 0, `exit ${scanned.status}: ${scanned.out.slice(0, 200)}`)
}
