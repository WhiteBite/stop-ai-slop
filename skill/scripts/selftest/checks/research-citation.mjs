import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export default async function ({ check, runCli }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-research-citation-"))
  try {
    const scenario = (name, content) => {
      writeFileSync(join(work, name), content)
      return runCli(["scan", name], work)
    }
    const citations = (out) => out.split("\n").filter((l) => l.includes("vend/research-citation"))

    const etal = scenario("etal.ts", "// ported from (Cormen et al., 2009) chapter 13\nconst x = 1\n")
    check(
      "research-citation: (Cormen et al., 2009) флагается [exit 0, warning]",
      etal.status === 0 && citations(etal.out).length === 1 && etal.out.includes("etal.ts:1 vend/research-citation [warning]"),
      `exit ${etal.status}: ${etal.out.slice(0, 300)}`,
    )

    const bare = scenario("bare.ts", "// the trick from (Cormen, 2009)\nconst x = 1\n")
    check(
      "research-citation: (Cormen, 2009) флагается [exit 0, warning]",
      bare.status === 0 && citations(bare.out).length === 1,
      `exit ${bare.status}: ${bare.out.slice(0, 300)}`,
    )

    const arxiv = scenario("arxiv.ts", "// see arXiv:2407.12241\nconst x = 1\n")
    check(
      "research-citation: arXiv:2407.12241 флагается [exit 0, warning]",
      arxiv.status === 0 && citations(arxiv.out).length === 1,
      `exit ${arxiv.status}: ${arxiv.out.slice(0, 300)}`,
    )

    const ru = scenario("ru.ts", "// (Иванов и др., 2023) описывает подход\nconst x = 1\n")
    check(
      "research-citation: (Иванов и др., 2023) флагается [exit 0, warning]",
      ru.status === 0 && citations(ru.out).length === 1,
      `exit ${ru.status}: ${ru.out.slice(0, 300)}`,
    )

    const inline = scenario("inline.ts", "const x = 1 // see arXiv:2407.12241v2\n")
    check(
      "research-citation: inline-комментарий после кода флагается [exit 0, warning]",
      inline.status === 0 && citations(inline.out).length === 1 && inline.out.includes("inline.ts:1 vend/research-citation [warning]"),
      `exit ${inline.status}: ${inline.out.slice(0, 300)}`,
    )

    const two = scenario("two.ts", "// (Aaa, 2001) и (Bbb, 2002) оба подхода\nconst x = 1\n")
    check(
      "research-citation: одна находка на строку, не на каждый матч [exit 0]",
      two.status === 0 && citations(two.out).length === 1,
      `exit ${two.status}: ${two.out.slice(0, 300)}`,
    )

    const clean = scenario("clean.ts", "// red-black tree invariant\nconst x = 1\n")
    check(
      "research-citation: чистая проза без ссылок не флагается [exit 0]",
      clean.status === 0 && !clean.out.includes("vend/research-citation"),
      `exit ${clean.status}: ${clean.out.slice(0, 200)}`,
    )

    const doc = scenario("doc.ts", "/**\n * (Smith, 2020) describes the trick\n */\nconst x = 1\n")
    check(
      "research-citation: цитата внутри doc-блока не флагается [exit 0]",
      doc.status === 0 && !doc.out.includes("vend/research-citation"),
      `exit ${doc.status}: ${doc.out.slice(0, 200)}`,
    )

    const str = scenario("str.ts", 'const s = "(Smith, 2020)"\n')
    check(
      "research-citation: цитата в строковом литерале не флагается [exit 0]",
      str.status === 0 && !str.out.includes("vend/research-citation"),
      `exit ${str.status}: ${str.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
