import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"

const GEMINI_SNIPPET = [
  "slop-gate: добавьте в .gemini/settings.json:",
  '"hooks": {',
  '  "BeforeTool": [',
  "    {",
  '      "matcher": "write_file|replace",',
  '      "hooks": [',
  "        {",
  '          "type": "command",',
  '          "command": "npx stop-ai-slop --pre-tool",',
  "          \"timeout\": 60000",
  "        }",
  "      ]",
  "    }",
  "  ]",
  "}",
].join("\n")

const QWEN_SNIPPET = [
  "slop-gate: добавьте в .qwen/settings.json:",
  '"hooks": {',
  '  "PreToolUse": [',
  "    {",
  '      "matcher": "write_file|replace",',
  '      "hooks": [',
  "        {",
  '          "type": "command",',
  '          "command": "npx stop-ai-slop --pre-tool"',
  "        }",
  "      ]",
  "    }",
  "  ]",
  "}",
].join("\n")

export default async function ({ check, runCli, selfPath }) {
  const abs = selfPath.split(sep).join("/")
  const stagedCmd = `node "${abs}" --staged`
  const MARK = "# >>> slop-gate >>>"
  const CLOSE = "# <<< slop-gate <<<"
  const block = `${MARK}\nif [ ! -f "${abs}" ]; then\n  echo "slop-gate: сканер не найден: ${abs} — запустите --install заново" >&2\n  exit 2\nfi\n${stagedCmd}\n${CLOSE}\n`
  const gitInit = (d) =>
    execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "init", "-q", "-b", "main"], {
      cwd: d,
      stdio: "pipe",
    })

  const gc = mkdtempSync(join(tmpdir(), "slop-gate-golden-create-"))
  try {
    gitInit(gc)
    runCli(["--install"], gc)
    const hook = readFileSync(join(gc, ".git", "hooks", "pre-commit"), "utf8")
    check(
      "golden: pre-commit create — блок байт-в-байт (shebang, guard, stagedCmd)",
      hook === `#!/bin/sh\n${block}`,
      JSON.stringify(hook),
    )
  } finally {
    rmSync(gc, { recursive: true, force: true })
  }

  const ga = mkdtempSync(join(tmpdir(), "slop-gate-golden-append-"))
  try {
    gitInit(ga)
    writeFileSync(join(ga, ".git", "hooks", "pre-commit"), "#!/bin/sh\necho existing hook")
    runCli(["--install"], ga)
    const hook = readFileSync(join(ga, ".git", "hooks", "pre-commit"), "utf8")
    check(
      "golden: pre-commit append — чужой текст сохранён, добит \\n, блок байт-в-байт",
      hook === `#!/bin/sh\necho existing hook\n${block}`,
      JSON.stringify(hook),
    )
  } finally {
    rmSync(ga, { recursive: true, force: true })
  }

  const gr = mkdtempSync(join(tmpdir(), "slop-gate-golden-replace-"))
  try {
    gitInit(gr)
    const oldBlock = `${MARK}\nnode "/old/path/scan.mjs" --staged\n${CLOSE}\n`
    writeFileSync(join(gr, ".git", "hooks", "pre-commit"), `#!/bin/sh\necho before\n${oldBlock}echo after\n`)
    runCli(["--install"], gr)
    const hook = readFileSync(join(gr, ".git", "hooks", "pre-commit"), "utf8")
    check(
      "golden: pre-commit replace — старый блок заменён, обрамление сохранено",
      hook === `#!/bin/sh\necho before\n${block}echo after\n`,
      JSON.stringify(hook),
    )
  } finally {
    rmSync(gr, { recursive: true, force: true })
  }

  const gs = mkdtempSync(join(tmpdir(), "slop-gate-golden-snippets-"))
  try {
    const res = runCli(["--install-hooks"], gs)
    check(
      "golden: install-hooks печатает сниппеты gemini/qwen байт-в-байт",
      res.status === 0 && res.out.includes(GEMINI_SNIPPET) && res.out.includes(QWEN_SNIPPET),
      `exit ${res.status}: ${res.out.slice(0, 300)}`,
    )
  } finally {
    rmSync(gs, { recursive: true, force: true })
  }

  const foreign = { matcher: "Bash", hooks: [{ type: "command", command: "my-own-check.sh" }] }
  const staleOwn = {
    matcher: "Write|Edit|MultiEdit|write_file|replace|apply_patch",
    hooks: [{ type: "command", command: 'node "/old/path/scan.mjs" --pre-tool' }],
  }
  const gd = mkdtempSync(join(tmpdir(), "slop-gate-golden-order-"))
  try {
    mkdirSync(join(gd, ".codex"), { recursive: true })
    writeFileSync(join(gd, ".codex", "hooks.json"), JSON.stringify({ hooks: { PreToolUse: [staleOwn, foreign] } }, null, 2) + "\n")
    const res = runCli(["--install-hooks"], gd)
    const list = JSON.parse(readFileSync(join(gd, ".codex", "hooks.json"), "utf8")).hooks.PreToolUse
    check(
      "golden: merge ordering — чужая запись на месте, наша в конце, набор записей идентичен",
      res.status === 0 &&
        list.length === 2 &&
        JSON.stringify(list[0]) === JSON.stringify(foreign) &&
        list[1].matcher === staleOwn.matcher &&
        list[1].hooks[0].command === `node "${selfPath.split(sep).join("/")}" --pre-tool`,
      `exit ${res.status}: ${JSON.stringify(list)}`,
    )
  } finally {
    rmSync(gd, { recursive: true, force: true })
  }

  const gv = mkdtempSync(join(tmpdir(), "slop-gate-golden-order-devin-"))
  try {
    mkdirSync(join(gv, ".devin"), { recursive: true })
    const devinForeign = { hooks: [{ type: "command", command: "team-hook.sh" }] }
    const devinStale = { hooks: [{ type: "command", command: 'node "/old/path/scan.mjs" --pre-tool' }] }
    writeFileSync(join(gv, ".devin", "hooks.v1.json"), JSON.stringify({ PreToolUse: [devinStale, devinForeign] }, null, 2) + "\n")
    const res = runCli(["--install-hooks"], gv)
    const list = JSON.parse(readFileSync(join(gv, ".devin", "hooks.v1.json"), "utf8")).PreToolUse
    check(
      "golden: devin merge ordering — чужая запись на месте, наша в конце",
      res.status === 0 &&
        list.length === 2 &&
        JSON.stringify(list[0]) === JSON.stringify(devinForeign) &&
        list[1].hooks[0].command === `node "${selfPath.split(sep).join("/")}" --pre-tool`,
      `exit ${res.status}: ${JSON.stringify(list)}`,
    )
  } finally {
    rmSync(gv, { recursive: true, force: true })
  }
}
