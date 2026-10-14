#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { detbenchEntryFromFileFinding, detbenchLogPath, entryFires, mineAuditLog, normalizeDetBench } from "./src/detbench.mjs"

const CORPUS_PATH = fileURLToPath(new URL("../../detbench-corpus.json", import.meta.url))

const serialize = (corpus) => JSON.stringify(corpus, null, 2) + "\n"

function reportDelta(current, next) {
  const a = current.split("\n")
  const b = next.split("\n")
  const total = Math.max(a.length, b.length)
  let shown = 0
  for (let i = 0; i < total && shown < 20; i++) {
    if (a[i] !== b[i]) {
      console.error(`line ${i + 1}:`)
      console.error(`  - ${a[i] ?? ""}`)
      console.error(`  + ${b[i] ?? ""}`)
      shown++
    }
  }
  if (total - shown > 0 && a.length !== b.length) console.error(`… ${Math.abs(a.length - b.length)} line(s) difference in length`)
}

function readCommitted() {
  if (!existsSync(CORPUS_PATH)) return null
  try {
    const parsed = JSON.parse(readFileSync(CORPUS_PATH, "utf8"))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function main(argv) {
  const mode = argv[0]
  if (mode === "--write") {
    const logPath = detbenchLogPath()
    if (!existsSync(logPath)) {
      console.error(`detbench: аудит-лог не найден: ${logPath}`)
      return 2
    }
    const findings = mineAuditLog(logPath)
    const dropped = []
    const kept = []
    for (const e of findings.map(detbenchEntryFromFileFinding)) {
      if (entryFires(e)) kept.push(e)
      else dropped.push(e)
    }
    const corpus = normalizeDetBench(kept)
    writeFileSync(CORPUS_PATH, serialize(corpus))
    const perRule = {}
    for (const e of corpus) perRule[e.rule] = (perRule[e.rule] ?? 0) + 1
    console.log(`detbench: written ${CORPUS_PATH} (${corpus.length} entries: ${Object.entries(perRule).map(([r, n]) => `${r} ${n}`).join(", ") || "—"})`)
    const dropCounts = {}
    for (const e of dropped) dropCounts[e.rule] = (dropCounts[e.rule] ?? 0) + 1
    for (const [rule, n] of Object.entries(dropCounts)) console.log(`detbench: dropped (не стреляет при реконструкции) ${rule}: ${n}`)
    return 0
  }
  if (mode === "--normalize") {
    const committed = readCommitted()
    if (committed === null) {
      console.error(`detbench: ${CORPUS_PATH} отсутствует или не массив`)
      return 2
    }
    writeFileSync(CORPUS_PATH, serialize(normalizeDetBench(committed)))
    console.log(`detbench: normalized ${CORPUS_PATH}`)
    return 0
  }
  if (mode === "--check") {
    const committed = readCommitted()
    if (committed === null) {
      console.error(`detbench: ${CORPUS_PATH} отсутствует или не массив`)
      return 1
    }
    const firing = committed.filter(entryFires)
    const next = serialize(normalizeDetBench(firing))
    const current = readFileSync(CORPUS_PATH, "utf8")
    if (current === next) {
      console.log("detbench: in sync")
      return 0
    }
    const lost = committed.length - firing.length
    console.error(`detbench: out of sync${lost > 0 ? ` — ${lost} записей перестали стрелять (recall-регрессия)` : " — порядок/форма дрейфнули"}`)
    reportDelta(current, next)
    return 1
  }
  console.error("usage: gen-detbench.mjs (--write | --check | --normalize)")
  return 2
}

const isMain = (() => {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    try {
      return process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
    } catch {
      return false
    }
  }
})()
if (isMain) process.exit(main(process.argv.slice(2)))
