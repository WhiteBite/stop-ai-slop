import { execFileSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { T } from "./i18n.mjs"
import { RULES } from "./rules.mjs"

export function hooksDirFor(root) {
  const gitDir = join(root, ".git")
  if (!existsSync(gitDir)) return null
  let hooksDir = join(gitDir, "hooks")
  try {
    const configured = execFileSync("git", ["config", "core.hooksPath"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
    if (configured !== "") hooksDir = resolve(root, configured)
  } catch {
    hooksDir = join(gitDir, "hooks")
  }
  return hooksDir
}

export function cmdInstall(strict = false) {
  const root = process.cwd()
  const abs = join(dirname(fileURLToPath(import.meta.url)), "..", "scan.mjs").split(sep).join("/")
  const stagedCmd = `node "${abs}" --staged${strict ? " --strict" : ""}`
  const allCmd = `node "${abs}" scan`
  const pkgPath = join(root, "package.json")
  if (existsSync(pkgPath)) {
    const raw = readFileSync(pkgPath, "utf8")
    const noBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
    let pkg
    if (noBom.trim() === "") {
      pkg = {}
    } else {
      try {
        pkg = JSON.parse(noBom)
      } catch {
        console.error(T("pkgNotJson", pkgPath))
        return 2
      }
    }
    if (typeof pkg !== "object" || pkg === null || Array.isArray(pkg)) {
      console.error(T("pkgNotJson", pkgPath))
      return 2
    }
    pkg.scripts = typeof pkg.scripts === "object" && pkg.scripts !== null ? pkg.scripts : {}
    const before = JSON.stringify(pkg.scripts)
    const had = Object.prototype.hasOwnProperty.call(pkg.scripts, "stop-ai-slop")
    pkg.scripts["stop-ai-slop"] = stagedCmd
    pkg.scripts["stop-ai-slop:all"] = allCmd
    if (JSON.stringify(pkg.scripts) === before) console.log("slop-gate: package.json — scripts уже на месте")
    else {
      const eol = raw.includes("\r\n") ? "\r\n" : "\n"
      const indent = raw.match(/^[ \t]+(?=")/m)?.[0] ?? null
      const body = indent === null ? JSON.stringify(pkg) : JSON.stringify(pkg, null, indent)
      writeFileSync(pkgPath, (eol === "\r\n" ? body.replace(/\n/g, "\r\n") : body) + (/\r?\n$/.test(raw) ? eol : ""))
      console.log(`slop-gate: package.json — ${had ? "обновлены" : "добавлены"} scripts.stop-ai-slop и scripts.stop-ai-slop:all`)
    }
  } else {
    console.log("slop-gate: package.json не найден — npm scripts пропущены")
  }
  const hooksDir = hooksDirFor(root)
  if (hooksDir === null) {
    console.log("slop-gate: .git не найден — pre-commit hook пропущен")
    return 0
  }
  mkdirSync(hooksDir, { recursive: true })
  const hookPath = join(hooksDir, "pre-commit")
  const MARK = "# >>> slop-gate >>>"
  const block = `${MARK}\nif [ ! -f "${abs}" ]; then\n  echo "slop-gate: сканер не найден: ${abs} — запустите --install заново" >&2\n  exit 2\nfi\n${stagedCmd}\n# <<< slop-gate <<<\n`
  const blockRe = /# >>> slop-gate >>>[\s\S]*?# <<< slop-gate <<<\r?\n?/
  const writeHook = (content) => {
    writeFileSync(hookPath, content)
    chmodSync(hookPath, 0o755)
  }
  if (existsSync(hookPath)) {
    const current = readFileSync(hookPath, "utf8")
    if (blockRe.test(current)) {
      writeHook(current.replace(blockRe, block))
      console.log("slop-gate: pre-commit hook — slop-gate блок обновлён")
    } else {
      writeHook(current.replace(/\n?$/, "\n") + block)
      console.log("slop-gate: pre-commit hook — добавлен блок после существующего содержимого")
    }
  } else {
    writeHook(`#!/bin/sh\n${block}`)
    console.log("slop-gate: pre-commit hook создан")
  }
  return 0
}

export function cmdInstallHooks() {
  const root = process.cwd()
  const abs = join(dirname(fileURLToPath(import.meta.url)), "..", "scan.mjs").split(sep).join("/")
  const command = `node "${abs}" --pre-tool`
  const matcher = "Write|Edit|MultiEdit|write_file|replace|apply_patch"
  const mergeHook = (rel, entry, nested) => {
    const file = join(root, rel)
    let obj = {}
    if (existsSync(file)) {
      try {
        obj = JSON.parse(readFileSync(file, "utf8"))
      } catch {
        console.log(`slop-gate: ${rel} — не JSON, пропущен`)
        return
      }
      if (
        typeof obj !== "object" ||
        obj === null ||
        Array.isArray(obj) ||
        (nested && obj.hooks !== undefined && (typeof obj.hooks !== "object" || obj.hooks === null || Array.isArray(obj.hooks)))
      ) {
        console.log(`slop-gate: ${rel} — не объект, пропущен`)
        return
      }
    }
    const box = nested ? (obj.hooks = typeof obj.hooks === "object" && obj.hooks !== null && !Array.isArray(obj.hooks) ? obj.hooks : {}) : obj
    const list = Array.isArray(box.PreToolUse) ? box.PreToolUse : (box.PreToolUse = [])
    const idx = list.findIndex((e) => Array.isArray(e?.hooks) && e.hooks.some((h) => typeof h?.command === "string" && h.command.includes("--pre-tool")))
    if (idx === -1) {
      list.push(entry)
      console.log(`slop-gate: ${rel} — хук добавлен`)
    } else {
      list[idx] = entry
      console.log(`slop-gate: ${rel} — хук обновлён`)
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(obj, null, 2) + "\n")
  }
  mergeHook(".codex/hooks.json", { matcher, hooks: [{ type: "command", command }] }, true)
  mergeHook(".devin/hooks.v1.json", { hooks: [{ type: "command", command }] }, false)
  const vscodeRel = ".github/hooks/stop-ai-slop.json"
  const vscodeFile = join(root, vscodeRel)
  const vscodeData = JSON.stringify({ hooks: { PreToolUse: [{ type: "command", command, timeout: 30 }] } }, null, 2) + "\n"
  const prev = existsSync(vscodeFile) ? readFileSync(vscodeFile, "utf8") : null
  mkdirSync(dirname(vscodeFile), { recursive: true })
  if (prev !== vscodeData) writeFileSync(vscodeFile, vscodeData)
  console.log(`slop-gate: ${vscodeRel} — ${prev === null ? "создан" : prev === vscodeData ? "уже на месте" : "обновлён"}`)
  console.log("slop-gate: добавьте в .gemini/settings.json:")
  console.log(`"hooks": ${JSON.stringify({ BeforeTool: [{ matcher: "write_file|replace", hooks: [{ type: "command", command: "npx stop-ai-slop --pre-tool", timeout: 60000 }] }] }, null, 2)}`)
  console.log("slop-gate: добавьте в .qwen/settings.json:")
  console.log(`"hooks": ${JSON.stringify({ PreToolUse: [{ matcher: "write_file|replace", hooks: [{ type: "command", command: "npx stop-ai-slop --pre-tool" }] }] }, null, 2)}`)
  return 0
}

export function generateRulesContent() {
  const lines = [
    "# stop-ai-slop — политика комментариев",
    "",
    "Комментарий — максимум одна строка и только неочевидное внешнее ограничение, инвариант или воркэраунд. Пересказ диффа живёт в коммите, WHY теста — в его имени.",
    "",
    "## Правила",
    "",
  ]
  for (const rule of RULES) {
    lines.push(`- \`${rule.id}\` (${rule.severity}): ${rule.message}${rule.instead ? ` Вместо: ${rule.instead}` : ""}`)
  }
  lines.push("", "## Проверка", "", "npx stop-ai-slop scan . — полный скан; npx stop-ai-slop --staged — только staged-строки.")
  return lines.join("\n") + "\n"
}

export function cmdInstallRules() {
  const root = process.cwd()
  const body = generateRulesContent()
  const hashMarker = "# stop-ai-slop generated rules"
  const generatedMarker = "Generated by stop-ai-slop"
  const blockOpen = "<!-- >>> stop-ai-slop >>> -->"
  const blockClose = "<!-- <<< stop-ai-slop <<< -->"
  const writeTarget = (rel, content, marker) => {
    const file = join(root, rel)
    const prev = existsSync(file) ? readFileSync(file, "utf8") : null
    if (prev !== null && marker !== null && prev.split("\n")[0] !== marker) {
      console.log(`slop-gate: ${rel} — пропущен (чужой контент)`)
      return
    }
    if (prev === content) {
      console.log(`slop-gate: ${rel} — уже на месте`)
      return
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
    console.log(`slop-gate: ${rel} — ${prev === null ? "создан" : "обновлён"}`)
  }
  writeTarget(".cursor/rules/stop-ai-slop.mdc", `---\ndescription: stop-ai-slop — политика комментариев: одна строка, только WHY\nglobs: "**/*"\nalwaysApply: true\n---\n\n${body}`, null)
  writeTarget(".windsurfrules", `${hashMarker}\n${body}`, hashMarker)
  writeTarget("CONVENTIONS.md", `${generatedMarker}\n\n${body}`, generatedMarker)
  writeTarget(".clinerules", `${hashMarker}\n${body}`, hashMarker)
  writeTarget(".devin/rules/stop-ai-slop.md", `${generatedMarker}\n\n${body}`, null)
  const copilotRel = ".github/copilot-instructions.md"
  const copilotFile = join(root, copilotRel)
  const block = `${blockOpen}\n# stop-ai-slop\n\n${body}${blockClose}\n`
  const prevCopilot = existsSync(copilotFile) ? readFileSync(copilotFile, "utf8") : null
  if (prevCopilot === null) {
    mkdirSync(dirname(copilotFile), { recursive: true })
    writeFileSync(copilotFile, block)
    console.log(`slop-gate: ${copilotRel} — создан`)
  } else {
    const open = prevCopilot.indexOf(blockOpen)
    const close = prevCopilot.indexOf(blockClose)
    const next =
      open !== -1 && close > open
        ? prevCopilot.slice(0, open) + block.trimEnd() + prevCopilot.slice(close + blockClose.length)
        : prevCopilot.replace(/\n*$/, "\n\n") + block
    if (next === prevCopilot) {
      console.log(`slop-gate: ${copilotRel} — уже на месте`)
    } else {
      writeFileSync(copilotFile, next)
      console.log(`slop-gate: ${copilotRel} — обновлён`)
    }
  }
  return 0
}
