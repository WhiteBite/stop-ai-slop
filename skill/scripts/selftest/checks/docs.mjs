import { execFileSync } from "node:child_process"
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
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

const PINNED_TABLES = {
  "readme-en": { header: "| Rule | Severity | What it catches |", sep: "| --- | --- | --- |" },
  "readme-ru": { header: "| Правило | Severity | Суть |", sep: "| --- | --- | --- |" },
  "skill-ru": { header: "| Правило | Severity | Why | Write | Ignore-when |", sep: "| --- | --- | --- | --- | --- |" },
}

const CONTENT_FIELDS = {
  "readme-en": (rule) => [rule.en.message],
  "readme-ru": (rule) => [rule.message],
  "skill-ru": (rule) => [rule.why, rule.write, rule.ignoreWhen],
}

const uncell = (text) => text.replaceAll("\\|", "|")

const rowsOf = (block) =>
  (block ?? "").split("\n").slice(2).map((line) => line.split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim()))

const idOf = (cells) => (cells[0] ?? "").replace(/^`|`$/g, "")

export default async function ({ check, runCli, selfRoot }) {
  const synced = gen(["--check"], selfRoot)
  check(
    "docs-sync: gen-docs --check on the committed tree [exit 0]",
    synced.status === 0 && synced.out.includes("docs: in sync"),
    `exit ${synced.status}: ${synced.out.slice(0, 300)}`,
  )

  const { RULES, RULE_BY_ID } = await import("../../scan.mjs")
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
    const sample = RULES.find((r) => r.id === "long-comment")
    const expected = kind === "readme-en" ? sample.en.message : kind === "readme-ru" ? sample.message : sample.why
    const foreign = kind === "readme-en" ? sample.message : kind === "readme-ru" ? sample.en.message : sample.en.why
    check(
      `docs-lang[${rel}]: the block carries the expected language and not the other one`,
      (block ?? "").includes(expected) && !(block ?? "").includes(foreign),
      `expected absent or foreign present; expected: ${expected.slice(0, 70)}`,
    )
    const scanned = runCli(["scan", rel], selfRoot)
    check(`docs-clean[${rel}]: the generated document passes the scanner [exit 0]`, scanned.status === 0, `exit ${scanned.status}: ${scanned.out.slice(0, 200)}`)

    const pinned = PINNED_TABLES[kind]
    const lines = (block ?? "").split("\n")
    check(
      `docs-table-header[${rel}]: column order matches the pinned snapshot, not the generator`,
      lines[0] === pinned.header && lines[1] === pinned.sep,
      `header: ${lines[0] ?? "—"}; sep: ${lines[1] ?? "—"}`,
    )
    const rows = rowsOf(block)
    const rowIds = rows.map(idOf)
    const expectedIds = RULES.map((r) => r.id)
    const absentIds = expectedIds.filter((id) => !rowIds.includes(id))
    const extraIds = rowIds.filter((id) => !expectedIds.includes(id))
    const repeatedIds = expectedIds.filter((id) => countOf(block ?? "", `\`${id}\``) !== 1)
    check(
      `docs-table-ids[${rel}]: exactly one row per RULES id, no unknown or repeated ids`,
      rows.length === expectedIds.length && absentIds.length === 0 && extraIds.length === 0 && repeatedIds.length === 0,
      `rows=${rows.length}/${expectedIds.length}; absent: ${absentIds.join(", ") || "—"}; extra: ${extraIds.join(", ") || "—"}; repeated: ${repeatedIds.join(", ") || "—"}`,
    )
    const badSeverity = rows.filter((cells) => {
      const rule = RULE_BY_ID.get(idOf(cells))
      return rule === undefined || cells[1] !== rule.severity
    })
    check(
      `docs-table-severity[${rel}]: every row carries the severity from RULES`,
      badSeverity.length === 0,
      badSeverity.map((cells) => `${cells[0] ?? "?"}→${cells[1] ?? "—"}`).slice(0, 5).join("; "),
    )
    const fields = CONTENT_FIELDS[kind]
    const badContent = rows.filter((cells) => {
      const rule = RULE_BY_ID.get(idOf(cells))
      if (rule === undefined) return true
      const want = fields(rule)
      const got = cells.slice(2).map(uncell)
      return want.length !== got.length || want.some((value, i) => value !== got[i])
    })
    check(
      `docs-table-content[${rel}]: message cells equal the RULES fields, not the generator's rendering`,
      badContent.length === 0,
      badContent.map((cells) => cells[0] ?? "?").slice(0, 5).join(", "),
    )
  }

  const work = mkdtempSync(join(tmpdir(), "slop-docs-tamper-"))
  try {
    cpSync(join(selfRoot, "skill"), join(work, "skill"), { recursive: true })
    for (const rel of ["README.md", "README.ru.md"]) copyFileSync(join(selfRoot, rel), join(work, rel))
    const target = join(work, "README.md")
    writeFileSync(target, readFileSync(target, "utf8").replace("| `multi-line-comment` |", "| `multi-line-comment-TAMPERED` |"))
    const tampered = gen(["--check"], work)
    check(
      "docs-tamper: a hand-edited generated row is reported with the file and line",
      tampered.status === 1 && tampered.out.includes("OUT OF SYNC") && tampered.out.includes("README.md") && tampered.out.includes("regenerate:"),
      `exit ${tampered.status}: ${tampered.out.slice(0, 300)}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  const untouched = gen(["--check"], selfRoot)
  check("docs-tamper: the tamper scenario never writes the working tree, still in sync", untouched.status === 0, `exit ${untouched.status}: ${untouched.out.slice(0, 200)}`)

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
