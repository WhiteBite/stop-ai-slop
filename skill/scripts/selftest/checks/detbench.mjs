import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

export default async function ({ check, runCli, selfPath, selfRoot }) {
  const genPath = resolve(dirname(selfPath), "gen-detbench.mjs")
  const run = (args) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, [genPath, ...args], { encoding: "utf8", stdio: "pipe" }) }
    } catch (error) {
      return { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
    }
  }
  const sync = run(["--check"])
  check(
    "detbench: corpus в синхроне с детектором [exit 0, in sync]",
    sync.status === 0 && sync.out.includes("in sync"),
    `exit ${sync.status}: ${sync.out.slice(0, 200)}`,
  )
  const live = runCli(["--detbench"], selfRoot)
  check(
    "detbench: CLI --detbench зелёный на живом корпусе [exit 0]",
    live.status === 0 && live.out.includes("slop-gate: detbench"),
    `exit ${live.status}: ${live.out.slice(0, 200)}`,
  )
  let corpus = null
  try {
    corpus = JSON.parse(readFileSync(join(selfRoot, "detbench-corpus.json"), "utf8"))
  } catch {
    corpus = null
  }
  const broken = corpus === null ? null : JSON.parse(JSON.stringify(corpus))
  if (broken !== null && broken.length > 0) {
    broken[0].lines = ["// сбрасываем здесь, т.к. ниже освобождаем слот"]
    const tmp = mkdtempSync(join(tmpdir(), "slop-gate-detbench-"))
    try {
      const brokenPath = join(tmp, "detbench-corpus.json")
      writeFileSync(brokenPath, JSON.stringify(broken) + "\n")
      const res = runCli(["--detbench"], selfRoot, { ...process.env, STOP_AI_SLOP_DETBENCH: brokenPath })
      check(
        "detbench: испорченная запись роняет гейт [exit 1]",
        res.status === 1 && res.out.includes("не стреляет"),
        `exit ${res.status}: ${res.out.slice(0, 200)}`,
      )
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  } else {
    check("detbench: испорченная запись роняет гейт [exit 1]", false, "corpus unreadable or empty")
  }
  const shaped = Array.isArray(corpus) && corpus.length >= 10 && corpus.every((e) => e && typeof e.file === "string" && Array.isArray(e.lines) && typeof e.rule === "string")
  check("detbench: форма записей (file/lines/rule) и корпус не пуст", shaped, `entries: ${Array.isArray(corpus) ? corpus.length : "—"}`)
}
