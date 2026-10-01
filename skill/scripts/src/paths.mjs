import { relative, sep } from "node:path"

export function toRel(root, absPath) {
  return relative(root, absPath).split(sep).join("/")
}

export function isExcludedPath(rel, excludePaths) {
  return excludePaths.some((p) => rel === p || rel.startsWith(p + "/"))
}
