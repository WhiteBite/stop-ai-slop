import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export default async function ({ check, runCli, selfPath, dir }) {
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

  const runSession = (input) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, [selfPath, "--mcp"], { input: input.join("\n") + "\n", encoding: "utf8", stdio: "pipe", cwd: dir }) }
    } catch (error) {
      return { status: error.status ?? 1, out: String(error.stdout ?? "") }
    }
  }
  const parseSession = (text) => {
    const parsed = []
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue
      parsed.push(JSON.parse(line))
    }
    return parsed
  }

  const proto = runSession([
    init(1, "2024-11-05"),
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "no_such_tool", arguments: {} } }),
    JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "slop_explain", arguments: { ruleId: "no-such-rule" } } }),
  ])
  let protoParsed = null
  let protoJson = true
  try {
    protoParsed = parseSession(proto.out)
  } catch {
    protoJson = false
  }
  const protoById = new Map((protoParsed ?? []).filter((r) => typeof r === "object" && r !== null && "id" in r).map((r) => [r.id, r]))
  check(
    "mcp-ping: ping → pong (пустой result, без isError)",
    protoJson && JSON.stringify(protoById.get(2)?.result) === "{}",
    `exit ${proto.status}: ${proto.out.slice(0, 300)}`,
  )
  check(
    "mcp-unknown-tool: tools/call с неизвестным именем → isError",
    protoJson && protoById.get(3)?.result?.isError === true,
    String(JSON.stringify(protoById.get(3))).slice(0, 300),
  )
  check(
    "mcp-unknown-ruleid: slop_explain с неизвестным ruleId → isError",
    protoJson && protoById.get(4)?.result?.isError === true,
    String(JSON.stringify(protoById.get(4))).slice(0, 300),
  )

  const batch = runSession([
    JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "ping" },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "slop_explain", arguments: { ruleId: "changelog-marker" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ]),
    JSON.stringify([{ jsonrpc: "2.0", method: "notifications/initialized" }]),
    "[]",
    JSON.stringify([42, { jsonrpc: "2.0", id: 7, method: "ping" }]),
    JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" }),
  ])
  let batchParsed = null
  let batchJson = true
  try {
    batchParsed = parseSession(batch.out)
  } catch {
    batchJson = false
  }
  const batchOk = batchJson && batch.status === 0
  const batchFirst = batchParsed?.[0]
  const batchIds = Array.isArray(batchFirst) ? batchFirst.map((r) => r.id) : null
  check(
    "mcp-batch: массив запросов → один массив ответов, по элементу на каждый request",
    batchOk &&
      Array.isArray(batchFirst) &&
      batchIds.length === 4 &&
      JSON.stringify(batchIds) === JSON.stringify([1, 2, 3, 4]) &&
      batchFirst.every((r) => r.jsonrpc === "2.0") &&
      batchFirst[0].result?.protocolVersion === "2024-11-05" &&
      Array.isArray(batchFirst[1].result?.tools) &&
      batchFirst[1].result.tools.length === 3 &&
      JSON.stringify(batchFirst[2].result) === "{}" &&
      batchFirst[3].result?.content?.[0]?.type === "text" &&
      batchFirst[3].result?.isError !== true,
    `exit ${batch.status}: ${batch.out.slice(0, 400)}`,
  )
  check(
    "mcp-batch-notifications: batch только из нотификаций не порождает ответа (5 строк входа → 4 строки stdout)",
    batchOk && batchParsed.length === 4,
    `exit ${batch.status}, строк stdout: ${batchParsed === null ? "n/a" : batchParsed.length}: ${batch.out.slice(0, 300)}`,
  )
  const batchEmpty = batchParsed?.[1]
  check(
    "mcp-batch-empty: пустой batch [] → одиночный ответ с ошибкой -32600",
    batchOk && !Array.isArray(batchEmpty) && batchEmpty?.error?.code === -32600 && batchEmpty?.id === null,
    String(JSON.stringify(batchEmpty)).slice(0, 300),
  )
  const batchInvalid = batchParsed?.[2]
  check(
    "mcp-batch-invalid-element: невалидный элемент (42) → -32600 c id null, соседний ping отвечает",
    batchOk &&
      Array.isArray(batchInvalid) &&
      batchInvalid.length === 2 &&
      batchInvalid[0].error?.code === -32600 &&
      batchInvalid[0].id === null &&
      batchInvalid[1].id === 7 &&
      JSON.stringify(batchInvalid[1].result) === "{}",
    String(JSON.stringify(batchInvalid)).slice(0, 300),
  )
  const batchAfter = batchParsed?.[3]
  check(
    "mcp-batch-after: одиночный ping после batch-строк → обычный одиночный ответ",
    batchOk && !Array.isArray(batchAfter) && batchAfter?.id === 9 && JSON.stringify(batchAfter?.result) === "{}",
    String(JSON.stringify(batchAfter)).slice(0, 300),
  )
  check(
    "mcp-batch-purity: stdout batch-сессии — только валидный JSON, exit 0",
    batchOk,
    `exit ${batch.status}: ${batch.out.slice(0, 300)}`,
  )

  const scanCall = (id, path) => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "slop_scan", arguments: { path } } })
  const slopBody = "const x = 1\n// alpha beta\n// gamma delta\nconst y = 2\n"
  const repoDir = mkdtempSync(join(tmpdir(), "slop-gate-mcp-repo-"))
  const plainDir = mkdtempSync(join(tmpdir(), "slop-gate-mcp-plain-"))
  const baseDir = mkdtempSync(join(tmpdir(), "slop-gate-mcp-baseline-"))
  const controlDir = mkdtempSync(join(tmpdir(), "slop-gate-mcp-control-"))
  try {
    execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "init", "-q", "-b", "main"], { cwd: repoDir, stdio: "pipe" })
    writeFileSync(join(repoDir, ".stop-ai-slop.yaml"), "rules:\n  multi-line-comment: off\n")
    mkdirSync(join(repoDir, "sub"))
    writeFileSync(join(repoDir, "sub", "slop.ts"), slopBody)
    writeFileSync(join(plainDir, ".stop-ai-slop.yaml"), "rules:\n  multi-line-comment: off\n")
    writeFileSync(join(plainDir, "slop.ts"), slopBody)
    writeFileSync(join(baseDir, "slop.ts"), slopBody)
    runCli(["--baseline-write"], baseDir)
    writeFileSync(join(controlDir, "slop.ts"), slopBody)
    const l5 = runSession([init(1, "2024-11-05"), scanCall(2, join(repoDir, "sub")), scanCall(3, plainDir), scanCall(4, baseDir), scanCall(5, controlDir)])
    let l5Parsed = null
    let l5Json = true
    try {
      l5Parsed = parseSession(l5.out)
    } catch {
      l5Json = false
    }
    const l5ById = new Map((l5Parsed ?? []).filter((r) => typeof r === "object" && r !== null && "id" in r).map((r) => [r.id, r]))
    const scanText = (id) => l5ById.get(id)?.result?.content?.[0]?.text
    const scanClean = (id) => l5Json && l5ById.get(id)?.result?.isError !== true && typeof scanText(id) === "string" && !scanText(id).includes("multi-line-comment")
    check(
      "mcp-scan-config-toplevel: slop_scan пути в чужом git-репо → конфиг корня этого репо, не cwd сервера",
      scanClean(2),
      `exit ${l5.status}: ${String(scanText(2)).slice(0, 300)}`,
    )
    check(
      "mcp-scan-config-norepo: slop_scan пути вне репо → конфиг самого пути (fallback)",
      scanClean(3),
      `exit ${l5.status}: ${String(scanText(3)).slice(0, 300)}`,
    )
    check(
      "mcp-scan-baseline: slop_scan пути с локальным baseline → находка замаскирована",
      scanClean(4),
      `exit ${l5.status}: ${String(scanText(4)).slice(0, 300)}`,
    )
    check(
      "mcp-scan-control: тот же slop без конфига и baseline → находка видна (не вакуумная проверка)",
      l5Json && typeof scanText(5) === "string" && scanText(5).includes("multi-line-comment"),
      `exit ${l5.status}: ${String(scanText(5)).slice(0, 300)}`,
    )
  } finally {
    rmSync(repoDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
    rmSync(baseDir, { recursive: true, force: true })
    rmSync(controlDir, { recursive: true, force: true })
  }
}
