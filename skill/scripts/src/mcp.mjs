import { createInterface } from "node:readline"
import { statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { gitToplevel, collectFiles, readScannable } from "./git.mjs"
import { loadConfig } from "./config.mjs"
import { configFindings } from "./gate.mjs"
import { toRel } from "./paths.mjs"
import { loadBaseline, maskBaselined } from "./baseline.mjs"
import { explainText, findingsToText, toolVersion } from "./report.mjs"
import { T } from "./i18n.mjs"

export const MCP_PROTOCOLS = ["2024-11-05", "2025-11-25", "2026-07-28"]

// resultType определён схемой 2026-07-28 (обязательное поле базового Result); ранние ревизии его не знают
const RESULT_TYPE_PROTOCOLS = new Set(["2026-07-28"])

export const MCP_TOOLS = [
  {
    name: "slop_scan",
    description: "Полное сканирование каталога на slop-комментарии",
    inputSchema: { type: "object", properties: { path: { type: "string", description: "Каталог или файл (по умолчанию текущий)" } }, required: [] },
  },
  {
    name: "slop_explain",
    description: "Обоснование правила (Why/Instead/Write/Ignore)",
    inputSchema: { type: "object", properties: { ruleId: { type: "string" } }, required: ["ruleId"] },
  },
  {
    name: "slop_baseline",
    description: "Записи baseline текущего git-корня",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
]
export function mcpToolResult(text, isError = false, protocolVersion) {
  return {
    ...(RESULT_TYPE_PROTOCOLS.has(protocolVersion) ? { resultType: "complete" } : {}),
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  }
}
export function mcpCallTool(name, args, protocolVersion) {
  if (name === "slop_scan") {
    const path = typeof args?.path === "string" && args.path !== "" ? args.path : "."
    const abs = resolve(path)
    const entry = statSync(abs, { throwIfNoEntry: false })
    // root must come from the scanned path, not cwd: the MCP host cwd is often another repo
    const root = gitToplevel(entry !== undefined && entry.isFile() ? dirname(abs) : abs)
    let config
    try {
      config = loadConfig(root)
    } catch (error) {
      return mcpToolResult(`ошибка конфига: ${error.message}`, true, protocolVersion)
    }
    const findings = []
    for (const file of collectFiles([abs], root, config?.excludePaths ?? [])) {
      const text = readScannable(file)
      if (text === null) continue
      for (const v of configFindings(root, file, text.replaceAll("\r\n", "\n").split("\n"), false, config)) {
        findings.push({ rel: toRel(root, file), ...v })
      }
    }
    const baseline = loadBaseline(root)
    return mcpToolResult(findingsToText(maskBaselined(baseline, findings)), false, protocolVersion)
  }
  if (name === "slop_explain") {
    const text = explainText(String(args?.ruleId ?? ""))
    return text === null ? mcpToolResult("правило не найдено", true, protocolVersion) : mcpToolResult(text, false, protocolVersion)
  }
  if (name === "slop_baseline") {
    const baseline = loadBaseline(gitToplevel(process.cwd()))
    const entries = [...baseline.legacy, ...[...baseline.fp].map((p) => `fp:${p}`)]
    return mcpToolResult(entries.length === 0 ? "baseline пуст" : entries.join("\n"), false, protocolVersion)
  }
  return mcpToolResult(T("mcpUnknownTool", name), true, protocolVersion)
}
export function cmdMcp() {
  const version = toolVersion()
  let negotiated = null
  const write = (msg) => process.stdout.write(JSON.stringify(msg) + "\n")
  const handleMessage = (msg) => {
    if (typeof msg !== "object" || msg === null || Array.isArray(msg)) {
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }
    }
    const { id, method, params } = msg
    if (method === "notifications/initialized" || method === "notifications/cancelled") return null
    if (method === "initialize") {
      const requested = params?.protocolVersion
      negotiated = MCP_PROTOCOLS.includes(requested) ? requested : MCP_PROTOCOLS[MCP_PROTOCOLS.length - 1]
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiated,
          capabilities: { tools: {} },
          serverInfo: { name: "stop-ai-slop", version },
        },
      }
    }
    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} }
    }
    if (method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } }
    }
    if (method === "tools/call") {
      let result
      try {
        result = mcpCallTool(params?.name, params?.arguments, negotiated)
      } catch (error) {
        result = mcpToolResult(String(error?.message ?? error), true, negotiated)
      }
      return { jsonrpc: "2.0", id, result }
    }
    if (id !== undefined) return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }
    return null
  }
  const rl = createInterface({ input: process.stdin })
  return new Promise((resolvePromise) => {
    rl.on("line", (line) => {
      const trimmed = line.trim()
      if (trimmed === "") return
      let msg
      try {
        msg = JSON.parse(trimmed)
      } catch {
        write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
        return
      }
      if (Array.isArray(msg)) {
        if (msg.length === 0) {
          write({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } })
          return
        }
        const responses = msg.map(handleMessage).filter((r) => r !== null)
        if (responses.length > 0) write(responses)
        return
      }
      const response = handleMessage(msg)
      if (response !== null) write(response)
    })
    rl.on("close", () => {
      process.stdout.write("", () => resolvePromise(0))
    })
  })
}
