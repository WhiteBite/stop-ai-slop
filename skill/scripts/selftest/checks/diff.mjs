import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseUnifiedDiff } from "../../src/git.mjs"

const git = (cwd, args) =>
  execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    stdio: "pipe",
  })

const diffFor = (plus) =>
  ["diff --git a/x b/x", "new file mode 100644", "index 0000000..1111111", "--- /dev/null", plus, "@@ -0,0 +1 @@", "+const x = 1"].join("\n")

const QUOTED_CASES = [
  ["tab", '+++ "b/a\\tb.ts"', "a\tb.ts"],
  ["newline", '+++ "b/new\\nline.ts"', "new\nline.ts"],
  ["carriage-return", '+++ "b/new\\rline.ts"', "new\rline.ts"],
  ["quote", '+++ "b/quote\\"x.ts"', 'quote"x.ts'],
  ["backslash", '+++ "b/back\\\\slash.ts"', "back\\slash.ts"],
  ["octal-utf8", '+++ "b/caf\\303\\251.ts"', "café.ts"],
]

export default async function ({ check, runCli }) {
  for (const [label, plus, expected] of QUOTED_CASES) {
    const parsed = parseUnifiedDiff(diffFor(plus))
    const lines = parsed.get(expected)
    check(
      `diff-unquote: quoted path with ${label} escape is C-unquoted`,
      lines !== undefined && lines.length === 1 && lines[0].text === "const x = 1" && lines[0].lineNo === 1,
      `keys: ${JSON.stringify([...parsed.keys()])}`,
    )
  }

  for (const [label, plus, expected] of [
    ["ascii", "+++ b/plain.ts", "plain.ts"],
    ["raw-utf8", "+++ b/café.ts", "café.ts"],
  ]) {
    const parsed = parseUnifiedDiff(diffFor(plus))
    check(
      `diff-unquote: unquoted ${label} path is unchanged`,
      parsed.has(expected) && !parsed.has("b/" + expected),
      `keys: ${JSON.stringify([...parsed.keys()])}`,
    )
  }

  const deletion = parseUnifiedDiff(
    ["diff --git a/x b/x", "deleted file mode 100644", "index 1111111..0000000", "--- a/x", "+++ /dev/null", "@@ -1 +0,0 @@", "-const x = 1"].join("\n"),
  )
  check("diff-unquote: /dev/null target yields no file", deletion.size === 0, `keys: ${JSON.stringify([...deletion.keys()])}`)

  const renameDir = mkdtempSync(join(tmpdir(), "slop-gate-rename-"))
  try {
    const body = Array.from({ length: 10 }, (_, i) => `const v${i} = ${i}`).join("\n") + "\n"
    git(renameDir, ["init", "-q", "-b", "main"])
    writeFileSync(join(renameDir, "old.ts"), body)
    git(renameDir, ["add", "old.ts"])
    git(renameDir, ["commit", "-q", "-m", "init"])
    git(renameDir, ["mv", "old.ts", "new.ts"])
    writeFileSync(join(renameDir, "new.ts"), "// aaa\n// bbb\n" + body)
    git(renameDir, ["add", "-A"])
    const staged = runCli(["--staged"], renameDir)
    check(
      "staged-rename: slop staged inside a renamed file is caught on the new path [exit 1]",
      staged.status === 1 && staged.out.includes("new.ts") && staged.out.includes("multi-line-comment") && !staged.out.includes("old.ts"),
      `exit ${staged.status}: ${staged.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(renameDir, { recursive: true, force: true })
  }

  const binDir = mkdtempSync(join(tmpdir(), "slop-gate-binary-"))
  try {
    git(binDir, ["init", "-q", "-b", "main"])
    writeFileSync(join(binDir, "blob.ts"), Buffer.concat([Buffer.from("const x = 1\n"), Buffer.from([0, 1, 2])]))
    git(binDir, ["add", "blob.ts"])
    const staged = runCli(["--staged"], binDir)
    check(
      "staged-binary: staged binary file is skipped without a crash [exit 0]",
      staged.status === 0 && !staged.out.includes("blob.ts"),
      `exit ${staged.status}: ${staged.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(binDir, { recursive: true, force: true })
  }
}
