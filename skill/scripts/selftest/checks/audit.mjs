import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { appendAudit } from "../../scan.mjs"

const ROTATE_AT_BYTES = 512 * 1024

export default async function ({ check, dir }) {
  const root = join(dir, "audit-byte-rotation")
  mkdirSync(root, { recursive: true })
  try {
    const rotatePath = join(root, "rotate.jsonl")
    const seed = Array.from({ length: 10000 }, (_, i) =>
      JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", verdict: "passed", tool: "write", filePath: `f${i}.ts` }) + "\n",
    ).join("")
    writeFileSync(rotatePath, seed)
    appendAudit({ verdict: "blocked", tool: "write", filePath: "newest.ts", rules: ["multi-line-comment"] }, rotatePath)
    const after = readFileSync(rotatePath, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "")
    check(
      "audit-byte-rotation: файл >512KB ротируется, newest виден",
      statSync(rotatePath).size < ROTATE_AT_BYTES && after[after.length - 1].includes("newest.ts"),
      `размер: ${statSync(rotatePath).size}, строк: ${after.length}`,
    )

    const smallPath = join(root, "small.jsonl")
    for (let i = 0; i < 50; i++) appendAudit({ verdict: "passed", tool: "edit", filePath: `s${i}.ts` }, smallPath)
    const smallLines = readFileSync(smallPath, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "")
    check(
      "audit-byte-rotation: лог ниже 512KB растёт без ротации",
      statSync(smallPath).size < ROTATE_AT_BYTES &&
        smallLines.length === 50 &&
        smallLines[0].includes("s0.ts") &&
        smallLines[49].includes("s49.ts"),
      `строк: ${smallLines.length}, размер: ${statSync(smallPath).size}`,
    )

    const underPath = join(root, "under.jsonl")
    const underSeed = JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", verdict: "passed", filePath: "base.ts" }) + "\n"
    writeFileSync(underPath, underSeed.repeat(6000))
    const underBeforeSize = statSync(underPath).size
    appendAudit({ verdict: "passed", filePath: "u.ts" }, underPath)
    check(
      "audit-byte-rotation: 6000 записей (~480KB) не ротируются",
      statSync(underPath).size > underBeforeSize && statSync(underPath).size < ROTATE_AT_BYTES,
      `размер до: ${underBeforeSize}, после: ${statSync(underPath).size}`,
    )

    const blocker = join(root, "blocker.txt")
    writeFileSync(blocker, "x")
    let swallowed = true
    try {
      appendAudit({ event: "loaded" }, root)
      appendAudit({ event: "loaded" }, join(blocker, "nested.jsonl"))
    } catch {
      swallowed = false
    }
    check("audit-byte-rotation: appendAudit не бросает при недоступном пути", swallowed)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}