import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export default async function ({ check, runCli }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-todo-word-"))
  try {
    writeFileSync(join(work, "fixme.ts"), "// FIXME: check the qualifier\nconst x = 1\n")
    writeFileSync(join(work, "fixme-ticket.ts"), "// FIXME KRY-482 drop the cache\nconst x = 1\n")
    writeFileSync(join(work, "xxx.ts"), "/* XXX Consider: leading '+' */\nconst x = 1\n")
    writeFileSync(join(work, "hack.ts"), "// hack to see if errors are reported\nconst x = 1\n")
    writeFileSync(join(work, "todo-case.ts"), "// Todo lowercase still fires\nconst x = 1\n")

    const fixme = runCli(["scan", "fixme.ts"], work)
    const fixmeLine = fixme.out.split("\n").find((l) => l.includes("vend/generic-todo ["))
    check(
      "todo-word: FIXME без тикета флагается [exit 0, warning]",
      fixme.status === 0 && fixmeLine === "fixme.ts:1 vend/generic-todo [warning] TODO/FIXME/XXX без ссылки на тикет",
      `exit ${fixme.status}: ${fixme.out.slice(0, 200)}`,
    )

    const ticket = runCli(["scan", "fixme-ticket.ts"], work)
    check(
      "todo-word: FIXME с тикетом чист [нет vend/generic-todo]",
      ticket.status === 0 && !ticket.out.includes("vend/generic-todo"),
      `exit ${ticket.status}: ${ticket.out.slice(0, 200)}`,
    )

    const xxx = runCli(["scan", "xxx.ts"], work)
    check(
      "todo-word: XXX в блок-комментарии флагается [exit 0]",
      xxx.status === 0 && xxx.out.includes("xxx.ts:1 vend/generic-todo [warning]"),
      `exit ${xxx.status}: ${xxx.out.slice(0, 200)}`,
    )

    const hack = runCli(["scan", "hack.ts"], work)
    check(
      "todo-word: HACK не маркер долга [нет vend/generic-todo]",
      hack.status === 0 && !hack.out.includes("vend/generic-todo"),
      `exit ${hack.status}: ${hack.out.slice(0, 200)}`,
    )

    const todoCase = runCli(["scan", "todo-case.ts"], work)
    check(
      "todo-word: Todo в любом регистре флагается [exit 0]",
      todoCase.status === 0 && todoCase.out.includes("todo-case.ts:1 vend/generic-todo [warning]"),
      `exit ${todoCase.status}: ${todoCase.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
