import { execFileSync } from "node:child_process"

export default async function ({ check, selfPath, dir }) {
  const init = (id, protocolVersion) =>
    JSON.stringify({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion, capabilities: {}, clientInfo: { name: "t", version: "0" } } })
  const call = (id) => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "slop_explain", arguments: { ruleId: "changelog-marker" } } })
  const list = (id) => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list" })
  const lines = [
    init(1, "2024-11-05"),
    call(2),
    list(3),
    init(4, "2026-07-28"),
    call(5),
    list(6),
    init(7, "2025-11-25"),
    call(8),
    list(9),
    init(10, "2025-06-18"),
    call(11),
    list(12),
  ]
  let out = ""
  let status = 0
  try {
    out = execFileSync(process.execPath, [selfPath, "--mcp"], { input: lines.join("\n") + "\n", encoding: "utf8", stdio: "pipe", cwd: dir })
  } catch (error) {
    status = error.status ?? 1
    out = String(error.stdout ?? "")
  }
  const responses = []
  let allJson = true
  for (const line of out.split("\n")) {
    if (line.trim() === "") continue
    try {
      responses.push(JSON.parse(line))
    } catch {
      allJson = false
    }
  }
  const byId = new Map(responses.filter((r) => typeof r === "object" && r !== null && "id" in r).map((r) => [r.id, r]))
  const callResult = (id) => byId.get(id)?.result
  const callOk = (id) => callResult(id)?.content?.[0]?.type === "text" && callResult(id)?.isError !== true
  check(
    "mcp-resulttype-2024-11-05: tools/call без resultType [negotiate 2024-11-05]",
    callOk(2) && callResult(2).resultType === undefined,
    String(JSON.stringify(callResult(2))).slice(0, 300),
  )
  check(
    "mcp-resulttype-2026-07-28: tools/call с resultType complete [negotiate 2026-07-28]",
    callOk(5) && callResult(5).resultType === "complete",
    String(JSON.stringify(callResult(5))).slice(0, 300),
  )
  check(
    "mcp-resulttype-2025-11-25: tools/call без resultType [схема 2025-11-25 поле не определяет]",
    callOk(8) && callResult(8).resultType === undefined,
    String(JSON.stringify(callResult(8))).slice(0, 300),
  )
  const listClean = [3, 6, 9, 12].every((id) => {
    const result = byId.get(id)?.result
    return Array.isArray(result?.tools) && result.tools.length === 3 && result.resultType === undefined
  })
  check(
    "mcp-resulttype-tools-list: tools/list без resultType при любой negotiate-версии",
    listClean,
    [3, 6, 9, 12].map((id) => String(JSON.stringify(byId.get(id))).slice(0, 200)).join(" | "),
  )
  check(
    "mcp-resulttype-unknown-version: неизвестная версия → newest 2026-07-28, tools/call с resultType",
    byId.get(10)?.result?.protocolVersion === "2026-07-28" && callOk(11) && callResult(11).resultType === "complete",
    String(JSON.stringify(byId.get(10))).slice(0, 200) + " | " + String(JSON.stringify(callResult(11))).slice(0, 200),
  )
  check(
    "mcp-resulttype-purity: каждая непустая строка stdout — валидный JSON, exit 0 по закрытии stdin",
    status === 0 && allJson,
    `exit ${status}: ${out.slice(0, 300)}`,
  )
}
