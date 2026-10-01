import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { appendAudit } from "../../scan.mjs"

export default async function ({ check, dir }) {
  const root = join(dir, "audit-prefilter")
  mkdirSync(root, { recursive: true })
  try {
    const rotatePath = join(root, "rotate-10001.jsonl")
    const seed = Array.from({ length: 10000 }, (_, i) =>
      JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", verdict: "passed", filePath: `f${i}.ts` }) + "\n",
    ).join("")
    writeFileSync(rotatePath, seed)
    appendAudit({ verdict: "blocked", tool: "write", filePath: "newest.ts", rules: ["multi-line-comment"] }, rotatePath)
    const after = readFileSync(rotatePath, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "")
    check(
      "audit-prefilter: 10001 запись оставляет не более 5001 строк, newest виден",
      after.length <= 5001 && after[after.length - 1].includes("newest.ts"),
      `строк: ${after.length}`,
    )

    const smallPath = join(root, "small.jsonl")
    for (let i = 0; i < 50; i++) appendAudit({ verdict: "passed", tool: "edit", filePath: `s${i}.ts` }, smallPath)
    const smallLines = readFileSync(smallPath, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "")
    check(
      "audit-prefilter: лог ниже порога растёт без ротации",
      statSync(smallPath).size < 10000 &&
        smallLines.length === 50 &&
        smallLines[0].includes("s0.ts") &&
        smallLines[49].includes("s49.ts"),
      `строк: ${smallLines.length}, размер: ${statSync(smallPath).size}`,
    )

    const boundaryPath = join(root, "boundary.jsonl")
    writeFileSync(boundaryPath, "\n".repeat(10000))
    appendAudit({ verdict: "passed", filePath: "b.ts" }, boundaryPath)
    const boundary = readFileSync(boundaryPath, "utf8").split(/\r?\n/)
    check(
      "audit-prefilter: минимально возможный файл у порога ротируется",
      statSync(boundaryPath).size < 10000 && boundary[boundary.length - 2].includes("b.ts"),
      `строк: ${boundary.length}, размер: ${statSync(boundaryPath).size}`,
    )

    const underPath = join(root, "under.jsonl")
    writeFileSync(underPath, "\n".repeat(9999))
    appendAudit({ verdict: "passed", filePath: "u.ts" }, underPath)
    const under = readFileSync(underPath, "utf8")
    check(
      "audit-prefilter: на строку ниже порога ротации нет",
      under.startsWith("\n".repeat(9999)) && under.split(/\r?\n/).length === 10001,
      `строк: ${under.split(/\r?\n/).length}`,
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
    check("audit-prefilter: appendAudit не бросает при недоступном пути", swallowed)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
