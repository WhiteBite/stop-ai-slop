import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const TICKET_CONFIG = "ticketPattern: '\\bKRY-\\d+\\b'\n"
const BROAD_CONFIG = "ticketPattern: '\\b[A-Z]+-\\d+\\b'\n"
const CVE_CONFIG = "ticketPattern: '\\bCVE-\\d+\\b'\n"

export default async function ({ check, runCli, selfRoot }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-ticket-ref-"))
  try {
    const scenario = (name, files, config) => {
      const dir = join(work, name)
      mkdirSync(dir, { recursive: true })
      for (const [rel, content] of Object.entries(files)) writeFileSync(join(dir, rel), content)
      if (config !== null) writeFileSync(join(dir, ".stop-ai-slop.yaml"), config)
      return runCli(["scan", "."], dir)
    }
    const ticketRefs = (out) => out.split("\n").filter((l) => l.includes("vend/ticket-ref"))

    const fires = scenario("fires", { "a.ts": "// KRY-482 drop the cache\nconst x = 1\n" }, TICKET_CONFIG)
    check(
      "ticket-ref: KRY-482 без TODO с настроенным ticketPattern → 1 warning [exit 0]",
      fires.status === 0 && ticketRefs(fires.out).length === 1 && fires.out.includes("a.ts:1 vend/ticket-ref [warning]"),
      `exit ${fires.status}: ${fires.out.slice(0, 300)}`,
    )

    const inline = scenario("inline", { "b.ts": "const x = 1 // KRY-482 drop the cache\n" }, TICKET_CONFIG)
    check(
      "ticket-ref: inline-комментарий после кода тоже флагается [exit 0]",
      inline.status === 0 && ticketRefs(inline.out).length === 1 && inline.out.includes("b.ts:1 vend/ticket-ref [warning]"),
      `exit ${inline.status}: ${inline.out.slice(0, 300)}`,
    )

    const perLine = scenario("per-line", { "c.ts": "// KRY-482 and KRY-483 both touch this\nconst x = 1\n" }, TICKET_CONFIG)
    check(
      "ticket-ref: одна находка на строку, не на каждый матч [exit 0]",
      perLine.status === 0 && ticketRefs(perLine.out).length === 1,
      `exit ${perLine.status}: ${perLine.out.slice(0, 300)}`,
    )

    const todo = scenario("todo", { "d.ts": "// TODO KRY-482 drop the cache\nconst x = 1\n" }, TICKET_CONFIG)
    check(
      "ticket-ref: TODO с тикетом — территория generic-todo, ticket-ref молчит [exit 0]",
      todo.status === 0 && !todo.out.includes("vend/ticket-ref") && !todo.out.includes("vend/generic-todo"),
      `exit ${todo.status}: ${todo.out.slice(0, 300)}`,
    )

    const link = scenario("link", { "e.ts": "// see https://track/KRY-482\nconst x = 1\n" }, TICKET_CONFIG)
    check(
      "ticket-ref: ссылка на трекер (ISSUE_LINK) не флагается [exit 0]",
      link.status === 0 && !link.out.includes("vend/ticket-ref"),
      `exit ${link.status}: ${link.out.slice(0, 300)}`,
    )

    const advisory = scenario("advisory", { "f.ts": "// CVE-2026-1234 affects this path\nconst x = 1\n" }, CVE_CONFIG)
    check(
      "ticket-ref: CVE-/GHSA- advisory не флагается, даже если паттерн сам матчит [exit 0]",
      advisory.status === 0 && !advisory.out.includes("vend/ticket-ref"),
      `exit ${advisory.status}: ${advisory.out.slice(0, 300)}`,
    )

    const inertNoConfig = scenario("inert-no-config", { "g.ts": "// KRY-482 drop the cache\nconst x = 1\n" }, null)
    check(
      "ticket-ref: без конфига правило инертно [exit 0]",
      inertNoConfig.status === 0 && !inertNoConfig.out.includes("vend/ticket-ref"),
      `exit ${inertNoConfig.status}: ${inertNoConfig.out.slice(0, 300)}`,
    )

    const inertOtherKeys = scenario("inert-other-keys", { "h.ts": "// KRY-482 drop the cache\nconst x = 1\n" }, "maxCommentLength: 100\n")
    check(
      "ticket-ref: конфиг без ticketPattern — правило инертно [exit 0]",
      inertOtherKeys.status === 0 && !inertOtherKeys.out.includes("vend/ticket-ref"),
      `exit ${inertOtherKeys.status}: ${inertOtherKeys.out.slice(0, 300)}`,
    )

    const broad = scenario(
      "broad",
      {
        "utf8.ts": "// decode UTF-8 first\nconst x = 1\n",
        "todo-utf8.ts": "// TODO fix UTF-8\nconst x = 1\n",
        "rfc.ts": "// RFC-3330 per spec\nconst x = 1\n",
      },
      BROAD_CONFIG,
    )
    check(
      "ticket-ref: широкий паттерн честно флагает UTF-8 и RFC-3330, TODO-гард держит [exit 0]",
      broad.status === 0 &&
        broad.out.includes("utf8.ts:1 vend/ticket-ref [warning]") &&
        broad.out.includes("rfc.ts:1 vend/ticket-ref [warning]") &&
        !broad.out.includes("todo-utf8.ts:1 vend/ticket-ref"),
      `exit ${broad.status}: ${broad.out.slice(0, 400)}`,
    )

    const kdoc = scenario(
      "kdoc",
      { "Doc.kt": "/**\n * KRY-482 limits the retry window\n */\nfun main() {}\n" },
      TICKET_CONFIG,
    )
    check(
      "ticket-ref: doc-блок (kdoc) не флагается [exit 0]",
      kdoc.status === 0 && !kdoc.out.includes("vend/ticket-ref"),
      `exit ${kdoc.status}: ${kdoc.out.slice(0, 300)}`,
    )

    const bad = scenario("bad-regex", { "i.ts": "const x = 1\n" }, "ticketPattern: '\\bKRY-\\d+('\n")
    check(
      "ticket-ref: некомпилируемый ticketPattern → exit 2 с файлом и строкой",
      bad.status === 2 && bad.out.includes(".stop-ai-slop.yaml:1") && bad.out.includes("ticketPattern"),
      `exit ${bad.status}: ${bad.out.slice(0, 300)}`,
    )

    const empty = scenario("empty-regex", { "j.ts": "const x = 1\n" }, "ticketPattern: ''\n")
    check(
      "ticket-ref: пустой ticketPattern → exit 2 с файлом и строкой",
      empty.status === 2 && empty.out.includes(".stop-ai-slop.yaml:1") && empty.out.includes("ticketPattern"),
      `exit ${empty.status}: ${empty.out.slice(0, 300)}`,
    )

    let schemaProps = null
    try {
      schemaProps = Object.keys(JSON.parse(readFileSync(join(selfRoot, "schema", "stop-ai-slop.schema.json"), "utf8")).properties)
    } catch {
      schemaProps = null
    }
    check(
      "ticket-ref: schema включает ticketPattern (config-parity)",
      schemaProps !== null && schemaProps.includes("ticketPattern"),
      `properties: ${schemaProps === null ? "unreadable" : schemaProps.join(", ")}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
