import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const ZWSP = String.fromCodePoint(0x200b)
const FEFF = String.fromCodePoint(0xfeff)

const git = (cwd, args) =>
  execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    stdio: "pipe",
  })

export default async function ({ check, runCli, selfPath }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-semantics-"))
  try {
    writeFileSync(join(work, "why-long.ts"), "// " + "x".repeat(118) + " otherwise the slot leaks\nconst x = 1\n")
    writeFileSync(join(work, "why-long-ru.ts"), "// " + "z".repeat(118) + " иначе слот утекает\nconst x = 1\n")
    writeFileSync(join(work, "plain-long.ts"), "// " + "y".repeat(118) + "\nconst x = 1\n")
    writeFileSync(
      join(work, "sparse-obvious.ts"),
      ["// increment the counter", "counter += 1", ...Array(99).fill("const a1 = 1")].join("\n") + "\n",
    )
    writeFileSync(
      join(work, "dense-obvious.ts"),
      [
        "// increment the counter",
        "counter += 1",
        "// validate the token",
        "validateToken(token)",
        "// normalize the input",
        "normalizeInput(input)",
        ...Array(27).fill("const b1 = 2"),
      ].join("\n") + "\n",
    )
    writeFileSync(join(work, "strsupp.ts"), 'const s = "// stop-ai-slop-ignore-file"\n// было иначе, стало так\n')
    writeFileSync(join(work, "realsupp.ts"), "// stop-ai-slop-ignore-file\n// было иначе, стало так\n")
    const inlineDirective = 'const s = "stop-ai-slop-ignore-file"; ' + "// было, стало\n"
    writeFileSync(join(work, "strsupp-inline.ts"), inlineDirective)
    writeFileSync(join(work, "bogus-line.ts"), "// stop-ai-slop-ignore-line bogus-id\n// было, стало\nconst x = 1\n")
    writeFileSync(join(work, "bogus-file.ts"), "// stop-ai-slop-ignore-file bogus-id\n// было, стало\nconst x = 1\n")
    writeFileSync(join(work, "plan.ts"), "// step 2 of the plan: wire the handler\nconst x = 1\n")
    writeFileSync(join(work, "plan-ack.ts"), "// as requested, the timeout is 30 seconds\nconst x = 1\n")
    writeFileSync(join(work, "plan-fp.ts"), "/* Module API version as requested during initialization. */\nint apiver = 1;\n")
    writeFileSync(join(work, "plan-ru.ts"), "// согласно ТЗ таймаут 30 секунд\nconst x = 1\n")
    writeFileSync(join(work, "plan-todo.ts"), "// TODO KRY-482 per the ticket drop the workaround\nconst x = 1\n")
    writeFileSync(join(work, "plan-clean.ts"), "// таймаут 30 с, т.к. вендор не отвечает быстрее\nconst x = 1\n")
    writeFileSync(join(work, "godoc.go"), "package main\n\n// Server handles requests.\n// It owns the listener.\nfunc Server() {}\n")
    writeFileSync(join(work, "godoc-header.go"), "// Server handles requests.\n// It owns the listener.\nfunc Server() {}\n")
    writeFileSync(
      join(work, "gometh.go"),
      "package main\n\n// Start begins serving.\n// It blocks until the listener closes.\nfunc (s *Server) Start() {}\n",
    )
    writeFileSync(
      join(work, "gonarr.go"),
      "package main\n\n// The server handles requests.\n// It owns the listener.\nfunc Server() {}\n",
    )
    writeFileSync(join(work, "tsdoc.ts"), "// Server handles requests.\n// It owns the listener.\nfunction Server() {}\n")

    const scanOf = (name) => runCli(["scan", name], work)

    const whyLong = scanOf("why-long.ts")
    check(
      "why-long: длинная строка с why-маркером не флагается [exit 0]",
      whyLong.status === 0 && !whyLong.out.includes("long-comment"),
      `exit ${whyLong.status}: ${whyLong.out.slice(0, 200)}`,
    )
    const whyLongRu = scanOf("why-long-ru.ts")
    check(
      "why-long-ru: RU why-маркер («иначе») не флагается [exit 0]",
      whyLongRu.status === 0 && !whyLongRu.out.includes("long-comment"),
      `exit ${whyLongRu.status}: ${whyLongRu.out.slice(0, 200)}`,
    )
    const plainLong = scanOf("plain-long.ts")
    check(
      "plain-long: длинная строка без why-маркера флагается [exit 1]",
      plainLong.status === 1 && plainLong.out.includes("long-comment"),
      `exit ${plainLong.status}: ${plainLong.out.slice(0, 200)}`,
    )

    const sparse = scanOf("sparse-obvious.ts")
    check(
      "obvious-density: 1 пересказ на 100 строк кода снимается плотностью [exit 0]",
      sparse.status === 0 && !sparse.out.includes("vend/obvious-comment"),
      `exit ${sparse.status}: ${sparse.out.slice(0, 200)}`,
    )
    const dense = scanOf("dense-obvious.ts")
    const denseHits = dense.out.split("vend/obvious-comment").length - 1
    check(
      "obvious-density: 3 пересказа на 30 строк кода (10%) остаются [3 warning]",
      dense.status === 0 && denseHits === 3,
      `exit ${dense.status}: hits ${denseHits}: ${dense.out.slice(0, 200)}`,
    )

    const strsupp = scanOf("strsupp.ts")
    check(
      "strsupp: директива внутри строкового литерала не глушит файл [exit 1]",
      strsupp.status === 1 && strsupp.out.includes("changelog-marker"),
      `exit ${strsupp.status}: ${strsupp.out.slice(0, 200)}`,
    )
    const realsupp = scanOf("realsupp.ts")
    check(
      "strsupp: та же директива в реальном комментарии глушит файл [exit 0]",
      realsupp.status === 0,
      `exit ${realsupp.status}: ${realsupp.out.slice(0, 200)}`,
    )
    const strsuppInline = scanOf("strsupp-inline.ts")
    check(
      "strsupp-inline: директива в строке не глушит trailing-комментарий той же строки [exit 1]",
      strsuppInline.status === 1 && strsuppInline.out.includes("changelog-marker"),
      `exit ${strsuppInline.status}: ${strsuppInline.out.slice(0, 200)}`,
    )
    const bogusLine = scanOf("bogus-line.ts")
    check(
      "bogus-id: ignore-line с невалидным id не подавляет находки [exit 1]",
      bogusLine.status === 1 && bogusLine.out.includes("multi-line-comment") && bogusLine.out.includes("changelog-marker"),
      `exit ${bogusLine.status}: ${bogusLine.out.slice(0, 200)}`,
    )
    const bogusFile = scanOf("bogus-file.ts")
    check(
      "bogus-id: ignore-file с невалидным id не глушит файл [exit 1]",
      bogusFile.status === 1 && bogusFile.out.includes("changelog-marker"),
      `exit ${bogusFile.status}: ${bogusFile.out.slice(0, 200)}`,
    )

    const plan = scanOf("plan.ts")
    check(
      "plan-narration: «step 2 of the plan» флагается [warning]",
      plan.status === 0 && plan.out.includes("vend/ai-plan-narration"),
      `exit ${plan.status}: ${plan.out.slice(0, 200)}`,
    )
    const planRu = scanOf("plan-ru.ts")
    check(
      "plan-narration: «согласно ТЗ» флагается [warning]",
      planRu.status === 0 && planRu.out.includes("vend/ai-plan-narration"),
      `exit ${planRu.status}: ${planRu.out.slice(0, 200)}`,
    )
    const planAck = scanOf("plan-ack.ts")
    check(
      "plan-narration: «as requested» в начале комментария флагается [warning]",
      planAck.status === 0 && planAck.out.includes("vend/ai-plan-narration"),
      `exit ${planAck.status}: ${planAck.out.slice(0, 200)}`,
    )
    const planFp = scanOf("plan-fp.ts")
    check(
      "plan-narration: «as requested» в середине фразы (FP-форма из bench) не флагается [exit 0]",
      planFp.status === 0 && !planFp.out.includes("vend/ai-plan-narration"),
      `exit ${planFp.status}: ${planFp.out.slice(0, 200)}`,
    )
    const planTodo = scanOf("plan-todo.ts")
    check(
      "plan-narration: TODO с тикетом не флагается [exit 0]",
      planTodo.status === 0 && !planTodo.out.includes("vend/ai-plan-narration"),
      `exit ${planTodo.status}: ${planTodo.out.slice(0, 200)}`,
    )
    const planClean = scanOf("plan-clean.ts")
    check(
      "plan-narration: why-комментарий без ссылок на план не флагается [exit 0]",
      planClean.status === 0 && !planClean.out.includes("vend/ai-plan-narration"),
      `exit ${planClean.status}: ${planClean.out.slice(0, 200)}`,
    )

    const godoc = scanOf("godoc.go")
    check(
      "go-doc: // ран над func с совпадающим первым словом эксемптен [exit 0]",
      godoc.status === 0,
      `exit ${godoc.status}: ${godoc.out.slice(0, 200)}`,
    )
    const godocHeader = scanOf("godoc-header.go")
    check(
      "go-doc: doc-ран в начале файла не даёт multi-line/header [exit 0]",
      godocHeader.status === 0 && !godocHeader.out.includes("vend/file-summary-header"),
      `exit ${godocHeader.status}: ${godocHeader.out.slice(0, 200)}`,
    )
    const gometh = scanOf("gometh.go")
    check(
      "go-doc: метод с ресивером эксемптен [exit 0]",
      gometh.status === 0,
      `exit ${gometh.status}: ${gometh.out.slice(0, 200)}`,
    )
    const gonarr = scanOf("gonarr.go")
    check(
      "go-doc: нарративный ран без идентификатора флагается [exit 1]",
      gonarr.status === 1 && gonarr.out.includes("multi-line-comment"),
      `exit ${gonarr.status}: ${gonarr.out.slice(0, 200)}`,
    )
    const tsdoc = scanOf("tsdoc.ts")
    check(
      "go-doc: та же форма в .ts флагается — эксемпт только для Go [exit 1]",
      tsdoc.status === 1 && tsdoc.out.includes("multi-line-comment") && tsdoc.out.includes("vend/file-summary-header"),
      `exit ${tsdoc.status}: ${tsdoc.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  const suppDir = mkdtempSync(join(tmpdir(), "slop-gate-strsuppdiff-"))
  try {
    git(suppDir, ["init", "-q", "-b", "main"])
    writeFileSync(join(suppDir, "a.ts"), "const x = 1\n")
    git(suppDir, ["add", "a.ts"])
    git(suppDir, ["commit", "-q", "-m", "init"])
    writeFileSync(join(suppDir, "a.ts"), 'const s = "// stop-ai-slop-ignore-file"\n// было иначе, стало так\n')
    git(suppDir, ["add", "a.ts"])
    const staged = runCli(["--staged"], suppDir)
    check(
      "strsupp-staged: директива в строке не глушит файл в --staged [exit 1]",
      staged.status === 1 && staged.out.includes("changelog-marker"),
      `exit ${staged.status}: ${staged.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(suppDir, { recursive: true, force: true })
  }

  const fixDir = mkdtempSync(join(tmpdir(), "slop-gate-semantics-fixes-"))
  try {
    writeFileSync(join(fixDir, "c1c-run.ts"), ["// line one", "// stop-ai-slop-ignore-line", "// line three"].join("\n") + "\n")
    writeFileSync(
      join(fixDir, "c1b-docstring.py"),
      'def f():\n    """\n    # stop-ai-slop-ignore-file\n    """\n    # было так, стало иначе\n',
    )
    writeFileSync(join(fixDir, "c1b-scalar.yaml"), "key: |\n  # stop-ai-slop-ignore-file\n# было так, стало иначе\n")
    writeFileSync(join(fixDir, "h4-regex.ts"), "const re = /a*/\n// comment line\n")
    writeFileSync(join(fixDir, "m7-license.ts"), "// All rights reserved.\n// Proprietary.\nconst x = 1\n")
    writeFileSync(join(fixDir, "m9-version.ts"), "// 1.0.0 is the minimum\nconst x = 1\n// 2.5x faster\nconst y = 2\n")
    writeFileSync(join(fixDir, "l2-spanish.ts"), "// repasa todo el inventario\nconst x = 1\n")
    writeFileSync(join(fixDir, "l2-prose.ts"), "// xxx\nconst x = 1\n")
    writeFileSync(join(fixDir, "h5l-scan.ts"), "const a" + ZWSP + "b = 1 // stop-ai-slop-ignore-line vend/zero-width-chars\n")

    const scanFix = (name) => runCli(["scan", name], fixDir)

    const c1c = scanFix("c1c-run.ts")
    const c1cHits = c1c.out.split("multi-line-comment").length - 1
    check(
      "C1c: директива внутри comment-рана не рвёт ран [exit 1, 1 multi-line]",
      c1c.status === 1 && c1cHits === 1,
      `exit ${c1c.status}: hits ${c1cHits}: ${c1c.out.slice(0, 200)}`,
    )
    const c1bDoc = scanFix("c1b-docstring.py")
    check(
      "C1b: директива в python docstring не глушит файл [exit 1, changelog]",
      c1bDoc.status === 1 && c1bDoc.out.includes("changelog-marker"),
      `exit ${c1bDoc.status}: ${c1bDoc.out.slice(0, 200)}`,
    )
    const c1bScalar = scanFix("c1b-scalar.yaml")
    check(
      "C1b: директива в YAML block scalar не глушит файл [exit 1, changelog]",
      c1bScalar.status === 1 && c1bScalar.out.includes("changelog-marker"),
      `exit ${c1bScalar.status}: ${c1bScalar.out.slice(0, 200)}`,
    )
    const h4 = scanFix("h4-regex.ts")
    check(
      "H4: regex-литерал /a*/ не считается комментарием [exit 0, без multi-line/header]",
      h4.status === 0 && !h4.out.includes("multi-line-comment") && !h4.out.includes("vend/file-summary-header"),
      `exit ${h4.status}: ${h4.out.slice(0, 200)}`,
    )
    const m7 = scanFix("m7-license.ts")
    check(
      "M7: «All rights reserved» + «Proprietary» — лицензионная шапка, не ошибка [exit 0]",
      m7.status === 0 && !m7.out.includes("multi-line-comment") && !m7.out.includes("vend/file-summary-header"),
      `exit ${m7.status}: ${m7.out.slice(0, 200)}`,
    )
    const m9 = scanFix("m9-version.ts")
    check(
      "M9: версии/десятичные (1.0.0, 2.5x) — не step-numbered [нет vend/step-numbered]",
      m9.status === 0 && !m9.out.includes("vend/step-numbered"),
      `exit ${m9.status}: ${m9.out.slice(0, 200)}`,
    )
    const l2Es = scanFix("l2-spanish.ts")
    check(
      "L2: испанская проза «todo» не generic-todo",
      l2Es.status === 0 && !l2Es.out.includes("vend/generic-todo"),
      `exit ${l2Es.status}: ${l2Es.out.slice(0, 200)}`,
    )
    const l2Prose = scanFix("l2-prose.ts")
    check(
      "L2: строчная проза «xxx» не generic-todo",
      l2Prose.status === 0 && !l2Prose.out.includes("vend/generic-todo"),
      `exit ${l2Prose.status}: ${l2Prose.out.slice(0, 200)}`,
    )
    const h5l = scanFix("h5l-scan.ts")
    check(
      "A6: ignore-line rule-scoped гасит security-находку на своей строке [exit 0]",
      h5l.status === 0 && !h5l.out.includes("vend/zero-width-chars"),
      `exit ${h5l.status}: ${h5l.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(fixDir, { recursive: true, force: true })
  }

  const moved = (await import(pathToFileURL(selfPath).href)).multisetDiff("a\nb\nc\n", "a\nc\nb\n")
  check("A6: reorder не считается добавлением строки", moved.length === 0, moved)

  const gDir = mkdtempSync(join(tmpdir(), "slop-gate-semantics-diff-"))
  try {
    git(gDir, ["init", "-q", "-b", "main"])
    writeFileSync(join(gDir, "base.ts"), "const base = 1\n")
    writeFileSync(join(gDir, "m8.ts"), "const x = 1\n")
    writeFileSync(join(gDir, "l3.ts"), "const x = 1\n")
    git(gDir, ["add", "."])
    git(gDir, ["commit", "-q", "-m", "init"])

    writeFileSync(join(gDir, "a.ts"), "const x = 1\n// stop-ai-slop-ignore-file legacy\n// было так, стало иначе\n")
    git(gDir, ["add", "a.ts"])
    const c1a = runCli(["--staged"], gDir)
    check(
      "C1a: ignore-file с невалидным хвостом не глушит файл [changelog + self-suppression]",
      c1a.out.includes("changelog-marker") && c1a.out.includes("vend/self-suppression"),
      `exit ${c1a.status}: ${c1a.out.slice(0, 250)}`,
    )
    git(gDir, ["commit", "-q", "-m", "c1a"])

    writeFileSync(join(gDir, "a2.ts"), "const x = 1\n// stop-ai-slop-ignore-file bogus-id\n// было так, стало иначе\n")
    git(gDir, ["add", "a2.ts"])
    const c1aBogus = runCli(["--staged"], gDir)
    check(
      "C1a-bogus: ignore-file с неизвестным id инертен, self-suppression остаётся [diff]",
      c1aBogus.out.includes("changelog-marker") && c1aBogus.out.includes("vend/self-suppression"),
      `exit ${c1aBogus.status}: ${c1aBogus.out.slice(0, 250)}`,
    )
    git(gDir, ["commit", "-q", "-m", "c1a-bogus"])

    writeFileSync(join(gDir, "m8.ts"), "const x = 1\n// header one\n// header two\n")
    git(gDir, ["add", "m8.ts"])
    const m8 = runCli(["--staged"], gDir)
    check(
      "M8: 2-строчный комментарий в середине файла — не file-summary-header [diff]",
      !m8.out.includes("vend/file-summary-header"),
      `exit ${m8.status}: ${m8.out.slice(0, 250)}`,
    )
    git(gDir, ["commit", "-q", "-m", "m8"])

    writeFileSync(join(gDir, "l3.ts"), "const x = 1\n" + FEFF + "const y = 2\n")
    git(gDir, ["add", "l3.ts"])
    const l3 = runCli(["--staged"], gDir)
    check(
      "L3: FEFF в первой добавленной строке ханка — не BOM, флагается [vend/zero-width-chars]",
      l3.out.includes("vend/zero-width-chars"),
      `exit ${l3.status}: ${l3.out.slice(0, 250)}`,
    )
    git(gDir, ["commit", "-q", "-m", "l3"])

    writeFileSync(join(gDir, "h5b.ts"), "// stop-ai-slop-ignore-next-line bogus-rule\nconst x = 1 // Step 3: normalize\n")
    git(gDir, ["add", "h5b.ts"])
    const h5b = runCli(["--staged"], gDir)
    check(
      "H5: ignore-next-line с bogus-id не подавляет + self-suppression [diff]",
      h5b.out.includes("vend/step-numbered") && h5b.out.includes("vend/self-suppression"),
      `exit ${h5b.status}: ${h5b.out.slice(0, 250)}`,
    )
    git(gDir, ["commit", "-q", "-m", "h5b"])

    writeFileSync(join(gDir, "h5a.ts"), "// stop-ai-slop-ignore-next-line vend/step-numbered\nconst x = 1 // Step 3: normalize\n")
    git(gDir, ["add", "h5a.ts"])
    const h5a = runCli(["--staged"], gDir)
    check(
      "H5: ignore-next-line с валидным id подавляет step-numbered [exit 0]",
      h5a.status === 0 && !h5a.out.includes("vend/step-numbered") && !h5a.out.includes("vend/self-suppression"),
      `exit ${h5a.status}: ${h5a.out.slice(0, 250)}`,
    )
  } finally {
    rmSync(gDir, { recursive: true, force: true })
  }
}
