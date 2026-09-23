import type { Plugin } from "@opencode-ai/plugin"
import { addedFromToolArgs, detectCommentSlop } from "../skill/scripts/scan.mjs"

export { detectCommentSlop }
export type { Violation } from "../skill/scripts/scan.mjs"

const MUTATING_TOOLS = new Set(["edit", "write", "multiedit"])
const POLICY =
  "комментарий — максимум одна строка и только неочевидное внешнее ограничение/инвариант/воркэраунд; пересказ диффа (было/стало/почему тест существует) живёт в коммите и имени теста. Убери комментарий или сожми до одной строки WHY."

export const CommentGate: Plugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (!MUTATING_TOOLS.has(input.tool)) return
      const args = (output?.args ?? {}) as Record<string, unknown>
      const extracted = addedFromToolArgs(input.tool, args)
      if (extracted === null) return
      const violations = detectCommentSlop(extracted.added).filter((v) => v.severity === "error")
      if (violations.length === 0) return
      throw new Error(
        violations
          .map(
            (v) =>
              `comment-gate: ${v.rule} at ${extracted.filePath}:${v.lineNo}\n${v.lines.join("\n")}\nPolicy: ${POLICY}`,
          )
          .join("\n\n"),
      )
    },
  }
}
