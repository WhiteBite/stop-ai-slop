import type { Plugin } from "@opencode-ai/plugin"
import { appendAudit, evaluateEdit } from "../skill/scripts/scan.mjs"

export { detectCommentSlop } from "../skill/scripts/scan.mjs"
export type { Violation } from "../skill/scripts/scan.mjs"

function guard(tool: string, args: Record<string, unknown>) {
  const result = evaluateEdit(tool, args)
  if (!result.evaluated) return
  if (!result.blocked) {
    appendAudit({ verdict: "passed", tool, filePath: result.filePath, added: result.addedCount })
    return
  }
  appendAudit({
    verdict: "blocked",
    tool,
    filePath: result.filePath,
    rules: result.violations.map((v) => v.rule),
    findings: result.violations.map((v) => ({ rule: v.rule, lineNo: v.lineNo, text: (v.lines[0] ?? "").slice(0, 120) })),
    added: result.addedCount,
  })
  throw new Error(result.message)
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
