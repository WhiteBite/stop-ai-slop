import type { Plugin } from "@opencode-ai/plugin"
import { addedFromToolArgs, appendAudit, detectCommentSlop, RULES } from "../skill/scripts/scan.mjs"

export { detectCommentSlop }
export type { Violation } from "../skill/scripts/scan.mjs"

const MUTATING_TOOLS = new Set(["edit", "write", "multiedit"])
const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]))
const POLICY =
  "комментарий — максимум одна строка и только неочевидное внешнее ограничение/инвариант/воркэраунд; пересказ диффа (было/стало/почему тест существует) живёт в коммите и имени теста. Убери комментарий или сожми до одной строки WHY."

export const CommentGate: Plugin = async () => {
  appendAudit({ event: "loaded" })
  return {
    "tool.execute.before": async (input, output) => {
      if (!MUTATING_TOOLS.has(input.tool)) return
      const args = (output?.args ?? {}) as Record<string, unknown>
      const extracted = addedFromToolArgs(input.tool, args)
      if (extracted === null) return
      const violations = detectCommentSlop(extracted.added).filter((v) => v.severity === "error")
      if (violations.length === 0) {
        appendAudit({ verdict: "passed", tool: input.tool, filePath: extracted.filePath, added: extracted.added.length })
        return
      }
      appendAudit({
        verdict: "blocked",
        tool: input.tool,
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
    },
  }
}
