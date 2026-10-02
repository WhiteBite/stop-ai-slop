import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { T } from "./i18n.mjs"
import { RULES } from "./rules.mjs"
import {
  ConfigParseError,
  collectCommands,
  mergeHooks,
  readJsonConfig,
  recordOwnership,
  writeJsonAtomic,
  writeMarkerBlock,
} from "../vendor/harness-kit/src/index.mjs"

export const SLOP_GATE_ID = "slop-gate"

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
  const hookPath = join(hooksDir, "pre-commit")
  const MARK = `# >>> ${SLOP_GATE_ID} >>>`
  const block = `${MARK}\nif [ ! -f "${abs}" ]; then\n  echo "slop-gate: сканер не найден: ${abs} — запустите --install заново" >&2\n  exit 2\nfi\n${stagedCmd}\n# <<< ${SLOP_GATE_ID} <<<\n`
  const result = writeMarkerBlock(hookPath, block, { variant: "shell-block", id: SLOP_GATE_ID })
  if (result.action === "created") console.log("slop-gate: pre-commit hook создан")
  else if (result.action === "appended") console.log("slop-gate: pre-commit hook — добавлен блок после существующего содержимого")
  else console.log(`slop-gate: pre-commit hook — ${SLOP_GATE_ID} блок обновлён`)
  return 0
}

export function cmdInstallHooks() {
  const root = process.cwd()
  const abs = join(dirname(fileURLToPath(import.meta.url)), "..", "scan.mjs").split(sep).join("/")
  const command = `node "${abs}" --pre-tool`
  const matcher = "Write|Edit|MultiEdit|write_file|replace|apply_patch"
  const isMine = (cmd) => typeof cmd === "string" && cmd.includes("--pre-tool")
  const mergeHook = (rel, template, shape, locatorOf) => {
    const file = join(root, rel)
    let existing
    try {
      existing = readJsonConfig(file)
    } catch (error) {
      if (error instanceof ConfigParseError) {
        console.log(`slop-gate: ${rel} — ${error.message.includes("not valid JSON") ? "не JSON" : "не объект"}, пропущен`)
        return
      }
      throw error
    }
    let merged
    try {
      merged = mergeHooks(existing ?? {}, template, { shape, isMine })
    } catch {
      console.log(`slop-gate: ${rel} — не объект, пропущен`)
      return
    }
    const hadOwn = existing !== null && collectCommands(existing, { shape }).some(isMine)
    writeJsonAtomic(file, merged)
    recordOwnership(root, "stop-ai-slop", rel, merged, [locatorOf(merged)])
    console.log(`slop-gate: ${rel} — ${hadOwn ? "хук обновлён" : "хук добавлен"}`)
  }
  mergeHook(
    ".codex/hooks.json",
    { hooks: { PreToolUse: [{ matcher, hooks: [{ type: "command", command }] }] } },
    "nested-hooks",
    (merged) => ["hooks", "PreToolUse", merged.hooks.PreToolUse.length - 1],
  )
  mergeHook(
    ".devin/hooks.v1.json",
    { PreToolUse: [{ hooks: [{ type: "command", command }] }] },
    "root-events",
    (merged) => ["PreToolUse", merged.PreToolUse.length - 1],
  )
  const vscodeRel = ".github/hooks/stop-ai-slop.json"
  const vscodeFile = join(root, vscodeRel)
  const vscodeObj = { hooks: { PreToolUse: [{ type: "command", command, timeout: 30 }] } }
  const vscodeData = JSON.stringify(vscodeObj, null, 2) + "\n"
  const prev = existsSync(vscodeFile) ? readFileSync(vscodeFile, "utf8") : null
  if (prev !== vscodeData) writeJsonAtomic(vscodeFile, vscodeObj)
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
  const message = (rel, action) => {
    if (action === "skipped-foreign") return `slop-gate: ${rel} — пропущен (чужой контент)`
    if (action === "unchanged") return `slop-gate: ${rel} — уже на месте`
    return `slop-gate: ${rel} — ${action === "created" ? "создан" : "обновлён"}`
  }
  const writeMarked = (rel, block, opts) => {
    const result = writeMarkerBlock(join(root, rel), block, opts)
    console.log(message(rel, result.action))
  }
  const writeOwned = (rel, content) => {
    const file = join(root, rel)
    const prev = existsSync(file) ? readFileSync(file, "utf8") : null
    if (prev === content) {
      console.log(`slop-gate: ${rel} — уже на месте`)
      return
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
    console.log(`slop-gate: ${rel} — ${prev === null ? "создан" : "обновлён"}`)
  }
  writeMarked(".cursor/rules/stop-ai-slop.mdc", null, {
    variant: "mdc-frontmatter",
    fields: [
      ["description", "stop-ai-slop — политика комментариев: одна строка, только WHY"],
      ["globs", '"**/*"'],
      ["alwaysApply", "true"],
    ],
    body,
  })
  writeMarked(".windsurfrules", `${hashMarker}\n${body}`, { variant: "first-line-marker", marker: hashMarker })
  writeMarked("CONVENTIONS.md", `${generatedMarker}\n\n${body}`, { variant: "first-line-marker", marker: generatedMarker })
  writeMarked(".clinerules", `${hashMarker}\n${body}`, { variant: "first-line-marker", marker: hashMarker })
  writeOwned(".devin/rules/stop-ai-slop.md", `${generatedMarker}\n\n${body}`)
  writeMarked(".github/copilot-instructions.md", `${blockOpen}\n# stop-ai-slop\n\n${body}${blockClose}\n`, {
    variant: "html-block",
    id: "stop-ai-slop",
  })
  return 0
}
