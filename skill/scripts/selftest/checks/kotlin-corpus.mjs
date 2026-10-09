import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

export default async function ({ check, selfPath, selfRoot }) {
  const genPath = resolve(dirname(selfPath), "gen-parity-fixtures.mjs")
  const run = (args) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, [genPath, ...args], { encoding: "utf8", stdio: "pipe" }) }
    } catch (error) {
      return { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
    }
  }
  const sync = run(["--check"])
  check(
    "kotlin-corpus: parity-corpus.json в синхроне с JS-движком [exit 0]",
    sync.status === 0 && sync.out.includes("in sync"),
    `exit ${sync.status}: ${sync.out.slice(0, 200)}`,
  )
  const { CASES } = await import(pathToFileURL(genPath).href)
  const corpusPath = join(selfRoot, "detekt-rules", "src", "test", "resources", "parity-corpus.json")
  let corpus = null
  let parseError = null
  try {
    corpus = JSON.parse(readFileSync(corpusPath, "utf8"))
  } catch (error) {
    parseError = error
  }
  const names = Array.isArray(corpus) ? corpus.map((c) => c && c.name) : []
  const missing = CASES.map((c) => c.name).filter((n) => !names.includes(n))
  check(
    "kotlin-corpus: seed-кейсы присутствуют в parity-corpus.json",
    parseError === null && missing.length === 0,
    parseError !== null ? String(parseError.message ?? parseError) : `missing: ${missing.join(", ") || "—"}; cases: ${names.length}`,
  )
  const shaped = Array.isArray(corpus) && corpus.every((c) => c && Array.isArray(c.lines) && Array.isArray(c.expected))
  check("kotlin-corpus: каждая запись несёт lines[] и expected[]", shaped, JSON.stringify(names.slice(0, 3)))
}