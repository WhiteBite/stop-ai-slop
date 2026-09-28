import type { Plugin } from "@opencode-ai/plugin"
import { addedFromToolArgs, appendAudit, detectCommentSlop, profileFor, RULES } from "../skill/scripts/scan.mjs"

export { detectCommentSlop }
export type { Violation } from "../skill/scripts/scan.mjs"

const MUTATING_TOOLS = new Set(["edit", "write", "multiedit"])
const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]))
const POLICY =
  "комментарий — максимум одна строка и только неочевидное внешнее ограничение/инвариант/воркэраунд; пересказ диффа (было/стало/почему тест существует) живёт в коммите и имени теста. Убери комментарий или сожми до одной строки WHY."

function guard(tool: string, args: Record<string, unknown>) {
  if (!MUTATING_TOOLS.has(tool)) return
  const extracted = addedFromToolArgs(tool, args)
  if (extracted === null) return
  const violations = detectCommentSlop(extracted.added, profileFor(extracted.filePath) ?? undefined, true).filter(
    (v) => v.severity === "error",
  )
  if (violations.length === 0) {
    appendAudit({ verdict: "passed", tool, filePath: extracted.filePath, added: extracted.added.length })
    return
  }
  appendAudit({
    verdict: "blocked",
    tool,
    filePath: extracted.filePath,
    rules: violations.map((v) => v.rule),
    added: extracted.added.length,
  })
  throw new Error(
    violations
      .map(
        (v) =>
          `comment-gate: ${v.rule} [${v.severity}] at ${extracted.filePath}:${v.lineNo}\n${v.lines.join("\n")}\ninstead: ${
            RULE_BY_ID.get(v.rule)?.instead ?? ""
          }\nPolicy: ${POLICY}`,
      )
      .join("\n\n"),
  )
}

export const CommentGate: Plugin = async () => {
  appendAudit({ event: "loaded" })
  return {
    "tool.execute.before": async (input, output) => guard(input.tool, (output?.args ?? {}) as Record<string, unknown>),
  }
}

async function setup(ctx: {
  tool: { hook(name: string, cb: (event: { tool: string; input: unknown }) => void): Promise<unknown> }
}) {
  appendAudit({ event: "loaded" })
  await ctx.tool.hook("execute.before", (event) => {
    guard(event.tool, (event.input ?? {}) as Record<string, unknown>)
  })
}

export default { id: "stop-ai-slop", server: CommentGate, setup }
