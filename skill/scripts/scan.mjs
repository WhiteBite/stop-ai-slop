#!/usr/bin/env node
import { realpathSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { main } from "./src/cli.mjs"

export { RULES, RULE_BY_ID } from "./src/rules.mjs"
export { currentLang, resolveLang, setLang } from "./src/i18n.mjs"
export { isCommentLine, profileFor } from "./src/profiles.mjs"
export { detectCommentSlop, isCodePath, multisetDiff } from "./src/detect.mjs"
export { readDisk } from "./src/diskio.mjs"
export { isGeneratedFile, loadGitattributesGenerated } from "./src/generated.mjs"
export { addedFromToolArgs, evaluateEdit } from "./src/gate.mjs"
export { CONFIG_KEYS, loadConfig } from "./src/config.mjs"
export { collectFiles, scanFiles } from "./src/git.mjs"
export { benchDelta } from "./src/bench.mjs"
export { appendAudit, auditLogPath } from "./src/audit.mjs"
export { KNOWN_FLAGS } from "./src/cli.mjs"

// Node realpaths the main module before import.meta.url; argv[1] keeps the symlink, so compare realpaths
const isMain = (() => {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    try {
      return process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
    } catch {
      return false
    }
  }
})()
if (isMain) {
  const exitCode = main(process.argv.slice(2))
  if (exitCode instanceof Promise) exitCode.then((code) => process.exit(code), () => process.exit(2))
  else process.exit(exitCode)
}