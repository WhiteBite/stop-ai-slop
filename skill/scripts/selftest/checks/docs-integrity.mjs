import { readFileSync } from "node:fs"
import { join } from "node:path"

const FILES = ["AGENTS.md", "README.md", "README.ru.md", "docs/TECH_DEBT.md"]
const PATTERNS = [
  /\b\d+\s+(?:PASS|FAIL|SKIP)\b/g,
  /\b\d+\s+failures\b/g,
  /\d+\s+тест(?:а|ов|ы)?/g,
]

export default async function ({ check, selfRoot }) {
  const hits = []
  for (const rel of FILES) {
    let text
    try {
      text = readFileSync(join(selfRoot, rel), "utf8")
    } catch {
      continue
    }
    for (const re of PATTERNS) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(text)) !== null) {
        const line = text.slice(0, m.index).split("\n").length
        hits.push(`${rel}:${line}: «${m[0]}»`)
      }
    }
  }
  check("docs-integrity: счётчики тестов не живут в прозе (AGENTS/README/TECH_DEBT)", hits.length === 0, hits)
}
