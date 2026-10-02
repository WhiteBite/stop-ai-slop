import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export default async function ({ check, runCli }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-ai-vocab-"))
  try {
    writeFileSync(
      join(work, "density.ts"),
      "// delve into the parser\nconst x = 1\n// crucial for the retry path\nconst y = 2\n// pivotal step in the pipeline\nconst z = 3\n",
    )
    const density = runCli(["scan", "density.ts"], work)
    const hits = density.out.split("\n").filter((l) => l.includes("vend/ai-vocab-density"))
    check(
      "ai-vocab: 3 разных токена дают одну file-level находку на первой строке [exit 0, warning]",
      density.status === 0 &&
        hits.length === 1 &&
        hits[0] === "density.ts:1 vend/ai-vocab-density [warning] 3+ разных слов из ИИ-канона (delve, pivotal, tapestry...) в комментариях файла",
      `exit ${density.status}: ${density.out.slice(0, 300)}`,
    )

    writeFileSync(join(work, "sub-threshold.ts"), "// delve into the parser\nconst x = 1\n// crucial for the retry path\nconst y = 2\n")
    const sub = runCli(["scan", "sub-threshold.ts"], work)
    check(
      "ai-vocab: 2 разных токена ниже порога [нет находки]",
      sub.status === 0 && !sub.out.includes("vend/ai-vocab-density"),
      `exit ${sub.status}: ${sub.out.slice(0, 200)}`,
    )

    writeFileSync(
      join(work, "same-token.ts"),
      "// crucial for the retry path\nconst x = 1\n// crucial again\nconst y = 2\n// delve into the parser\nconst z = 3\n",
    )
    const same = runCli(["scan", "same-token.ts"], work)
    check(
      "ai-vocab: повтор токена считается один раз [2 разных — нет находки]",
      same.status === 0 && !same.out.includes("vend/ai-vocab-density"),
      `exit ${same.status}: ${same.out.slice(0, 200)}`,
    )

    writeFileSync(
      join(work, "doc-block.ts"),
      "/**\n * delve into the parser\n * crucial for the retry path\n * pivotal step in the pipeline\n */\nconst x = 1\n",
    )
    const doc = runCli(["scan", "doc-block.ts"], work)
    check(
      "ai-vocab: doc-блок не считается [нет находки]",
      doc.status === 0 && !doc.out.includes("vend/ai-vocab-density"),
      `exit ${doc.status}: ${doc.out.slice(0, 200)}`,
    )

    writeFileSync(
      join(work, "inline.ts"),
      "const x = 1 // delve deeper\n// crucial for the retry path\nconst y = 2\n// pivotal step in the pipeline\nconst z = 3\n",
    )
    const inline = runCli(["scan", "inline.ts"], work)
    const inlineHits = inline.out.split("\n").filter((l) => l.includes("vend/ai-vocab-density"))
    check(
      "ai-vocab: inline-комментарий считается, находка на строке первого вхождения",
      inline.status === 0 && inlineHits.length === 1 && inlineHits[0].startsWith("inline.ts:1 vend/ai-vocab-density [warning]"),
      `exit ${inline.status}: ${inline.out.slice(0, 300)}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
