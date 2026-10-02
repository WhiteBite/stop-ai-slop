import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const git = (cwd, args) =>
  execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    stdio: "pipe",
  })

export default async function ({ check, runCli }) {
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
}
