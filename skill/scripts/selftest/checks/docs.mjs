import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { END, START, TARGETS, tableFor } from "../../gen-docs.mjs"

const gen = (args, cwd) => {
  try {
    return {
      status: 0,
      out: execFileSync(process.execPath, [join(cwd, "skill", "scripts", "gen-docs.mjs"), ...args], { cwd, encoding: "utf8", stdio: "pipe" }),
    }
  } catch (error) {
    return { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

const blockOf = (raw) => {
  const start = raw.indexOf(START)
  const end = raw.indexOf(END)
  return start === -1 || end === -1 ? null : raw.slice(start + START.length, end).replace(/^\n/, "").replace(/\n$/, "")
}

const countOf = (raw, needle) => raw.split(needle).length - 1

export default async function ({ check, runCli, selfRoot }) {
  const synced = gen(["--check"], selfRoot)
  check(
    "docs-sync: gen-docs --check on the committed tree [exit 0]",
    synced.status === 0 && synced.out.includes("docs: in sync"),
    `exit ${synced.status}: ${synced.out.slice(0, 300)}`,
  )

  const { RULES } = await import("../../scan.mjs")
  for (const { rel, kind } of TARGETS) {
    const raw = readFileSync(join(selfRoot, rel), "utf8")
    const block = blockOf(raw)
    check(
      `docs-markers[${rel}]: exactly one start and one end marker`,
      countOf(raw, START) === 1 && countOf(raw, END) === 1 && block !== null,
      `start=${countOf(raw, START)} end=${countOf(raw, END)}`,
    )
    check(`docs-block[${rel}]: generated block equals tableFor(${kind})`, block === tableFor(kind), (block ?? "").slice(0, 200))
    const missing = RULES.filter((r) => !(block ?? "").includes(`\`${r.id}\``)).map((r) => r.id)
    check(`docs-coverage[${rel}]: every rule id present with its vend/ prefix`, missing.length === 0, missing.join(", "))
    const scanned = runCli(["scan", rel], selfRoot)
    check(`docs-clean[${rel}]: the generated document passes the scanner [exit 0]`, scanned.status === 0, `exit ${scanned.status}: ${scanned.out.slice(0, 200)}`)
  }

  const target = join(selfRoot, "README.md")
  const original = readFileSync(target, "utf8")
  try {
    writeFileSync(target, original.replace("| `multi-line-comment` |", "| `multi-line-comment-TAMPERED` |"))
    const tampered = gen(["--check"], selfRoot)
    check(
      "docs-tamper: a hand-edited generated row is reported with the file and line",
      tampered.status === 1 && tampered.out.includes("OUT OF SYNC") && tampered.out.includes("README.md") && tampered.out.includes("regenerate:"),
      `exit ${tampered.status}: ${tampered.out.slice(0, 300)}`,
    )
  } finally {
    writeFileSync(target, original)
  }
  const restored = gen(["--check"], selfRoot)
  check("docs-tamper: restored byte-exact, back in sync", restored.status === 0 && readFileSync(target, "utf8") === original, `exit ${restored.status}`)

  const llms = readFileSync(join(selfRoot, "llms.txt"), "utf8")
  const listLine = llms.split("\n").find((l) => l.includes("Rules reference"))
  const absent = RULES.filter((r) => !(listLine ?? "").includes(r.id)).map((r) => r.id)
  const bare = RULES.filter((r) => r.id.startsWith("vend/") && new RegExp(`(?<!vend/)\\b${r.id.slice(5)}\\b`).test(listLine ?? "")).map((r) => r.id)
  check(
    "docs-llms: the llms.txt rules list carries every canonical id and no bare form",
    listLine !== undefined && absent.length === 0 && bare.length === 0,
    `absent: ${absent.join(", ") || "—"}; bare: ${bare.join(", ") || "—"}`,
  )

  const unknownFlag = gen(["--frobnicate"], selfRoot)
  check("docs-cli: unknown flag exits 2", unknownFlag.status === 2 && unknownFlag.out.includes("usage:"), `exit ${unknownFlag.status}: ${unknownFlag.out.slice(0, 160)}`)
}
