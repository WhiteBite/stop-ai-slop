import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { GEN_HEADER_LAX, GEN_HEADER_STRICT, GEN_NAME_SAFE } from "./markers.mjs"
import { isExcludedPath } from "./paths.mjs"
import { isCommentLine, profileFor } from "./profiles.mjs"

// header markers are comments; matching raw source would exempt any file that merely quotes the patterns
function headerText(relPath, text) {
  const profile = profileFor(relPath) ?? undefined
  return text
    .split("\n", 10)
    .filter((line) => isCommentLine(line, profile))
    .join("\n")
}

export function isGeneratedFile(relPath, text, extra) {
  if (extra?.scanGenerated === true) return false
  const base = relPath.split(/[\\/]/).pop() ?? ""
  if (GEN_NAME_SAFE.test(base)) return true
  if (extra?.gitattr != null && extra.gitattr(relPath)) return true
  if (isExcludedPath(relPath, extra?.cfgPaths ?? [])) return true
  const head = headerText(relPath, text)
  if (GEN_HEADER_STRICT.test(head)) return true
  return GEN_HEADER_LAX.every((re) => re.test(head))
}
export const GLOB_SPECIAL = /[.+^${}()|[\]\\]/g

export function gitattrGlobRe(pattern) {
  let p = pattern.replace(/^\//, "")
  if (p.endsWith("/")) p += "**"
  const anchored = p.includes("/")
  let body = ""
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === "*") {
      if (p[i + 1] === "*") {
        body += ".*"
        i++
      } else body += "[^/]*"
    } else if (c === "?") body += "[^/]"
    else body += c.replace(GLOB_SPECIAL, "\\$&")
  }
  return anchored ? new RegExp("^" + body + "$") : new RegExp("(?:^|/)" + body + "$")
}
export function loadGitattributesGenerated(root) {
  const path = join(root, ".gitattributes")
  if (!existsSync(path)) return null
  const res = []
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (line === "" || line.startsWith("#")) continue
    const parts = line.split(/\s+/)
    if (!parts.slice(1).some((a) => a === "linguist-generated" || a === "linguist-generated=true")) continue
    res.push(gitattrGlobRe(parts[0]))
  }
  if (res.length === 0) return null
  return (rel) => res.some((re) => re.test(rel))
}
export function genContext(root, config) {
  return { gitattr: loadGitattributesGenerated(root), cfgPaths: config?.generatedPaths ?? [], scanGenerated: config?.scanGenerated === true }
}
