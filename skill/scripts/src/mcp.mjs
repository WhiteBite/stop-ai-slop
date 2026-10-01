import { createInterface } from "node:readline"
import { gitToplevel, collectFiles, readScannable } from "./git.mjs"
import { loadConfig } from "./config.mjs"
import { configFindings } from "./gate.mjs"
import { toRel } from "./paths.mjs"
import { loadBaseline, maskBaselined } from "./baseline.mjs"
import { explainText, findingsToText, toolVersion } from "./report.mjs"
import { T } from "./i18n.mjs"

export const MCP_PROTOCOLS = ["2024-11-05", "2025-11-25", "2026-07-28"]

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
export function mcpToolResult(text, isError = false) {
  return { resultType: "complete", content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) }
}
export function mcpCallTool(name, args) {
  if (name === "slop_scan") {
    const path = typeof args?.path === "string" && args.path !== "" ? args.path : "."
    const root = gitToplevel(process.cwd())
    let config
    try {
      config = loadConfig(root)
    } catch (error) {
      return mcpToolResult(`ошибка конфига: ${error.message}`, true)
    }
    const findings = []
    for (const file of collectFiles([path], root, config?.excludePaths ?? [])) {
      const text = readScannable(file)
      if (text === null) continue
      for (const v of configFindings(root, file, text.replaceAll("\r\n", "\n").split("\n"), false, config)) {
        findings.push({ rel: toRel(root, file), ...v })
      }
    }
    const baseline = loadBaseline(root)
    return mcpToolResult(findingsToText(maskBaselined(baseline, findings)))
  }
  if (name === "slop_explain") {
    const text = explainText(String(args?.ruleId ?? ""))
    return text === null ? mcpToolResult("правило не найдено", true) : mcpToolResult(text)
  }
  if (name === "slop_baseline") {
    const baseline = loadBaseline(gitToplevel(process.cwd()))
    const entries = [...baseline.legacy, ...[...baseline.fp].map((p) => `fp:${p}`)]
    return mcpToolResult(entries.length === 0 ? "baseline пуст" : entries.join("\n"))
  }
  return mcpToolResult(T("mcpUnknownTool", name), true)
}
export function cmdMcp() {
  const version = toolVersion()
  const write = (msg) => process.stdout.write(JSON.stringify(msg) + "\n")
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
      const { id, method, params } = typeof msg === "object" && msg !== null ? msg : {}
      if (method === "notifications/initialized" || method === "notifications/cancelled") return
      if (method === "initialize") {
        const requested = params?.protocolVersion
        write({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: MCP_PROTOCOLS.includes(requested) ? requested : MCP_PROTOCOLS[MCP_PROTOCOLS.length - 1],
            capabilities: { tools: {} },
            serverInfo: { name: "stop-ai-slop", version },
          },
        })
        return
      }
      if (method === "ping") {
        write({ jsonrpc: "2.0", id, result: {} })
        return
      }
      if (method === "tools/list") {
        write({ jsonrpc: "2.0", id, result: { resultType: "complete", tools: MCP_TOOLS } })
        return
      }
      if (method === "tools/call") {
        let result
        try {
          result = mcpCallTool(params?.name, params?.arguments)
        } catch (error) {
          result = mcpToolResult(String(error?.message ?? error), true)
        }
        write({ jsonrpc: "2.0", id, result })
        return
      }
      if (id !== undefined) write({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } })
    })
    rl.on("close", () => {
      process.stdout.write("", () => resolvePromise(0))
    })
  })
}
