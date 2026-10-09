import { existsSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"

const PATH_KEYS = ["skills", "agents", "outputStyles", "workflows"]
const ROOT_REF = /\$\{CLAUDE_PLUGIN_ROOT\}([^"\s]+)/g

function collectComponentPaths(manifest) {
  const entries = []
  const push = (key, value) => {
    if (typeof value === "string") entries.push({ key, value })
  }
  for (const key of PATH_KEYS) {
    const value = manifest[key]
    if (value === undefined) continue
    if (Array.isArray(value)) for (const item of value) push(key, item)
    else push(key, value)
  }
  for (const key of ["hooks", "mcpServers"]) {
    const value = manifest[key]
    if (value === undefined) continue
    if (typeof value === "string") push(key, value)
    else if (Array.isArray(value)) for (const item of value) push(key, item)
  }
  const commands = manifest.commands
  if (commands !== undefined) {
    if (typeof commands === "string") push("commands", commands)
    else if (Array.isArray(commands)) for (const item of commands) push("commands", item)
    else if (typeof commands === "object")
      for (const entry of Object.values(commands))
        if (entry !== null && typeof entry === "object" && typeof entry.source === "string") push("commands", entry.source)
  }
  return entries
}

function hookCommandsFromEventMap(eventMap) {
  const commands = []
  if (eventMap === null || typeof eventMap !== "object") return commands
  for (const blocks of Object.values(eventMap)) {
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (block === null || typeof block !== "object") continue
      if (!Array.isArray(block.hooks)) continue
      for (const hook of block.hooks) {
        if (hook !== null && typeof hook === "object" && typeof hook.command === "string") commands.push(hook.command)
      }
    }
  }
  return commands
}

export default async function ({ check, selfRoot }) {
  const pluginRoot = resolve(selfRoot)
  const rel = (path) => relative(pluginRoot, path) || "."
  const manifestPath = join(pluginRoot, ".claude-plugin", "plugin.json")
  const manifestExists = existsSync(manifestPath)
  check(
    "claude-plugin: манифест в .claude-plugin/plugin.json (plugin root = корень репо)",
    manifestExists,
    manifestExists ? rel(manifestPath) : `нет ${rel(manifestPath)} — манифест обязан лежать в <plugin-root>/.claude-plugin/plugin.json`,
  )

  let manifest = null
  let parseError = null
  if (manifestExists) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    } catch (error) {
      parseError = error
    }
  }
  check(
    "claude-plugin: манифест — валидный JSON с непустыми name и version",
    manifest !== null &&
      parseError === null &&
      typeof manifest?.name === "string" &&
      manifest.name.length > 0 &&
      typeof manifest?.version === "string" &&
      manifest.version.length > 0,
    parseError !== null
      ? String(parseError.message ?? parseError)
      : manifest === null
        ? "манифест отсутствует"
        : `name=${JSON.stringify(manifest.name)} version=${JSON.stringify(manifest.version)}`,
  )

  const pathViolations = []
  if (manifest !== null) {
    for (const { key, value } of collectComponentPaths(manifest)) {
      if (key === "skills" && (value === "." || value === "./")) continue
      if (key === "mcpServers" && /^https?:\/\//.test(value)) continue
      if (!value.startsWith("./")) {
        pathViolations.push(`${key}: "${value}" без префикса ./`)
        continue
      }
      const resolved = resolve(pluginRoot, value)
      if (resolved !== pluginRoot && !resolved.startsWith(pluginRoot + sep)) {
        pathViolations.push(`${key}: "${value}" выходит за plugin root`)
        continue
      }
      if (!existsSync(resolved)) pathViolations.push(`${key}: "${value}" не существует`)
    }
  }
  check(
    "claude-plugin: каждый component-путь (skills/hooks/mcpServers/agents/commands) — с ./, внутри plugin root, существует",
    manifest !== null && pathViolations.length === 0,
    manifest === null ? "манифест отсутствует" : pathViolations.join("; ") || "нарушений нет",
  )

  const marketplacePath = join(pluginRoot, ".claude-plugin", "marketplace.json")
  const marketplaceRoot = dirname(dirname(marketplacePath))
  let marketplace = null
  let marketplaceError = null
  if (existsSync(marketplacePath)) {
    try {
      marketplace = JSON.parse(readFileSync(marketplacePath, "utf8"))
    } catch (error) {
      marketplaceError = error
    }
  }
  const sourceViolations = []
  if (marketplace !== null && Array.isArray(marketplace.plugins)) {
    for (const entry of marketplace.plugins) {
      if (entry === null || typeof entry !== "object" || typeof entry.source !== "string") continue
      const pluginDir = resolve(marketplaceRoot, entry.source)
      if (!existsSync(join(pluginDir, ".claude-plugin", "plugin.json"))) {
        sourceViolations.push(`${JSON.stringify(entry.name)}: source "${entry.source}" не указывает на каталог с .claude-plugin/plugin.json`)
      }
    }
  }
  check(
    "claude-plugin: marketplace.json source указывает на каталог с .claude-plugin/plugin.json",
    marketplace !== null && marketplaceError === null && Array.isArray(marketplace?.plugins) && sourceViolations.length === 0,
    marketplaceError !== null
      ? String(marketplaceError.message ?? marketplaceError)
      : marketplace === null
        ? `нет ${rel(marketplacePath)}`
        : !Array.isArray(marketplace.plugins)
          ? "plugins не массив"
          : sourceViolations.join("; ") || "нарушений нет",
  )

  const hookFiles = []
  const inlineHookConfigs = []
  const defaultHooks = join(pluginRoot, "hooks", "hooks.json")
  if (existsSync(defaultHooks)) hookFiles.push(defaultHooks)
  if (manifest !== null && manifest.hooks !== undefined) {
    if (typeof manifest.hooks === "string") {
      const declared = resolve(pluginRoot, manifest.hooks)
      if (existsSync(declared)) hookFiles.push(declared)
    } else if (Array.isArray(manifest.hooks)) {
      for (const item of manifest.hooks) {
        if (typeof item !== "string") {
          inlineHookConfigs.push(item)
          continue
        }
        const declared = resolve(pluginRoot, item)
        if (existsSync(declared)) hookFiles.push(declared)
      }
    } else if (typeof manifest.hooks === "object") {
      inlineHookConfigs.push(manifest.hooks)
    }
  }
  const hookViolations = []
  const commands = []
  for (const file of hookFiles) {
    let parsed = null
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"))
    } catch (error) {
      hookViolations.push(`${rel(file)}: невалидный JSON (${String(error.message ?? error)})`)
      continue
    }
    if (parsed === null || typeof parsed !== "object" || parsed.hooks === null || typeof parsed.hooks !== "object") {
      hookViolations.push(`${rel(file)}: нет обёртки "hooks"`)
      continue
    }
    commands.push(...hookCommandsFromEventMap(parsed.hooks))
  }
  for (const inline of inlineHookConfigs) commands.push(...hookCommandsFromEventMap(inline))
  for (const command of commands) {
    for (const match of command.matchAll(ROOT_REF)) {
      const target = join(pluginRoot, match[1])
      if (!existsSync(target)) hookViolations.push(`\${CLAUDE_PLUGIN_ROOT}${match[1]} не существует`)
    }
  }
  check(
    "claude-plugin: hook-команды есть и каждый ${CLAUDE_PLUGIN_ROOT}/… из них существует",
    commands.length > 0 && hookViolations.length === 0,
    hookViolations.length > 0 ? hookViolations.join("; ") : `hook-команд: ${commands.length}`,
  )
}
