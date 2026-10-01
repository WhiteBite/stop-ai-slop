import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"

export default async function ({ check, runCli, selfPath }) {
  const abs = selfPath.split(sep).join("/")
  const staged = `node "${abs}" --staged`
  const all = `node "${abs}" scan`
  const scriptsOk = (pkg) => pkg.scripts["stop-ai-slop"] === staged && pkg.scripts["stop-ai-slop:all"] === all
  const repoWith = (prefix, pkgText) => {
    const d = mkdtempSync(join(tmpdir(), prefix))
    execFileSync("git", ["-c", "user.email=slop@test", "-c", "user.name=slop", "init", "-q", "-b", "main"], { cwd: d, stdio: "pipe" })
    writeFileSync(join(d, "package.json"), pkgText)
    return d
  }
  const pkgOf = (d) => readFileSync(join(d, "package.json"), "utf8")

  const d4 = repoWith("slop-gate-pkg4-", '{\n    "name": "consumer",\n    "version": "1.0.0",\n    "scripts": {\n        "test": "echo test"\n    }\n}\n')
  try {
    const res = runCli(["--install"], d4)
    const after = pkgOf(d4)
    check(
      "install-pkg-4space: отступ 4 пробела сохранён, scripts добавлены",
      res.status === 0 && /^ {4}"name"/m.test(after) && /^ {8}"test"/m.test(after) && !/^ {2}"/m.test(after) && scriptsOk(JSON.parse(after)) && res.out.includes("добавлены"),
      `exit ${res.status}: ${JSON.stringify(after)}`,
    )
  } finally {
    rmSync(d4, { recursive: true, force: true })
  }

  const d8 = repoWith("slop-gate-pkg8-", '{\n        "name": "consumer",\n        "scripts": {\n                "test": "echo test"\n        }\n}\n')
  try {
    const res = runCli(["--install"], d8)
    const after = pkgOf(d8)
    check(
      "install-pkg-8space: отступ 8 пробелов сохранён",
      res.status === 0 && /^ {8}"name"/m.test(after) && /^ {16}"test"/m.test(after) && !/^ {2}"/m.test(after) && scriptsOk(JSON.parse(after)),
      `exit ${res.status}: ${JSON.stringify(after)}`,
    )
  } finally {
    rmSync(d8, { recursive: true, force: true })
  }

  const d3 = repoWith("slop-gate-pkg3-", '{\n   "name": "consumer",\n   "scripts": {\n      "test": "echo test"\n   }\n}\n')
  try {
    const res = runCli(["--install"], d3)
    const after = pkgOf(d3)
    check(
      "install-pkg-3space: отступ 3 пробела сохранён",
      res.status === 0 && /^ {3}"name"/m.test(after) && /^ {6}"test"/m.test(after) && !/^ {2}"/m.test(after) && scriptsOk(JSON.parse(after)),
      `exit ${res.status}: ${JSON.stringify(after)}`,
    )
  } finally {
    rmSync(d3, { recursive: true, force: true })
  }

  const dTab = repoWith("slop-gate-pkgtab-", '{\n\t"name": "consumer",\n\t"scripts": {\n\t\t"test": "echo test"\n\t}\n}\n')
  try {
    const res = runCli(["--install"], dTab)
    const after = pkgOf(dTab)
    check(
      "install-pkg-tab: таб-отступ сохранён",
      res.status === 0 && /^\t"name"/m.test(after) && /^\t\t"test"/m.test(after) && !/^ {2}"/m.test(after) && scriptsOk(JSON.parse(after)),
      `exit ${res.status}: ${JSON.stringify(after)}`,
    )
  } finally {
    rmSync(dTab, { recursive: true, force: true })
  }

  const dMin = repoWith("slop-gate-pkgmin-", '{"name":"consumer","version":"1.0.0","scripts":{"test":"echo test"}}\n')
  try {
    const res = runCli(["--install"], dMin)
    const after = pkgOf(dMin)
    const expected = JSON.stringify({ name: "consumer", version: "1.0.0", scripts: { test: "echo test", "stop-ai-slop": staged, "stop-ai-slop:all": all } }) + "\n"
    check(
      "install-pkg-minified: однострочный package.json остаётся одной строкой",
      res.status === 0 && after === expected,
      `exit ${res.status}: ${JSON.stringify(after)}`,
    )
  } finally {
    rmSync(dMin, { recursive: true, force: true })
  }

  const dCrlf = repoWith("slop-gate-pkgcrlf-", '{\r\n    "name": "consumer",\r\n    "scripts": {\r\n        "test": "echo test"\r\n    }\r\n}\r\n')
  try {
    const res = runCli(["--install"], dCrlf)
    const after = pkgOf(dCrlf)
    check(
      "install-pkg-crlf: CRLF сохранён, голых LF нет",
      res.status === 0 && after.includes("\r\n") && !after.replace(/\r\n/g, "").includes("\n") && /^ {4}"name"/m.test(after) && scriptsOk(JSON.parse(after)),
      `exit ${res.status}: ${JSON.stringify(after)}`,
    )
  } finally {
    rmSync(dCrlf, { recursive: true, force: true })
  }

  const dNoNl = repoWith("slop-gate-pkgnonl-", '{\n    "name": "consumer",\n    "scripts": {\n        "test": "echo test"\n    }\n}')
  try {
    const res = runCli(["--install"], dNoNl)
    const after = pkgOf(dNoNl)
    check(
      "install-pkg-no-final-newline: файл без финального перевода строки не получает его",
      res.status === 0 && !/\r?\n$/.test(after) && /^ {4}"name"/m.test(after) && scriptsOk(JSON.parse(after)),
      `exit ${res.status}: ${JSON.stringify(after)}`,
    )
  } finally {
    rmSync(dNoNl, { recursive: true, force: true })
  }

  const dForeign = repoWith("slop-gate-pkgforeign-", '{\n    "name": "consumer",\n    "scripts": {\n        "prepare": "echo stop-ai-slop",\n        "banner": "stop-ai-slop:all is managed elsewhere"\n    }\n}\n')
  try {
    const res = runCli(["--install"], dForeign)
    const after = pkgOf(dForeign)
    const pkg = JSON.parse(after)
    check(
      "install-pkg-foreign-value: чужое значение с подстрокой stop-ai-slop не тронуто, наши ключи записаны",
      res.status === 0 && pkg.scripts.prepare === "echo stop-ai-slop" && pkg.scripts.banner === "stop-ai-slop:all is managed elsewhere" && scriptsOk(pkg) && /^ {8}"prepare"/m.test(after),
      `exit ${res.status}: ${JSON.stringify(after)}`,
    )
  } finally {
    rmSync(dForeign, { recursive: true, force: true })
  }

  const dIdem = repoWith("slop-gate-pkgidem-", '{\n    "name": "consumer",\n    "scripts": {\n        "test": "echo test"\n    }\n}\n')
  try {
    const first = runCli(["--install"], dIdem)
    const after1 = pkgOf(dIdem)
    const second = runCli(["--install"], dIdem)
    const after2 = pkgOf(dIdem)
    check(
      "install-pkg-idempotent: повторный --install даёт байт-в-байт тот же файл",
      first.status === 0 && second.status === 0 && after1 === after2 && scriptsOk(JSON.parse(after2)),
      `exit ${first.status}/${second.status}: ${JSON.stringify(after2)}`,
    )
  } finally {
    rmSync(dIdem, { recursive: true, force: true })
  }

  const dOrder = repoWith("slop-gate-pkgorder-", '{\n  "version": "1.0.0",\n  "name": "consumer",\n  "private": true,\n  "scripts": {\n    "test": "echo test"\n  }\n}\n')
  try {
    const res = runCli(["--install"], dOrder)
    const pkg = JSON.parse(pkgOf(dOrder))
    check(
      "install-pkg-key-order: порядок ключей package.json сохранён",
      res.status === 0 && Object.keys(pkg).join(",") === "version,name,private,scripts" && Object.keys(pkg.scripts).join(",") === "test,stop-ai-slop,stop-ai-slop:all",
      `exit ${res.status}: ${JSON.stringify(Object.keys(pkg))} / ${JSON.stringify(Object.keys(pkg.scripts))}`,
    )
  } finally {
    rmSync(dOrder, { recursive: true, force: true })
  }

  const dNoop = repoWith("slop-gate-pkgnoop-", JSON.stringify({ name: "consumer", scripts: { "stop-ai-slop": staged, "stop-ai-slop:all": all } }, null, 4) + "\n")
  try {
    const before = pkgOf(dNoop)
    const mtimeBefore = statSync(join(dNoop, "package.json")).mtimeMs
    const res = runCli(["--install"], dNoop)
    const after = pkgOf(dNoop)
    const mtimeAfter = statSync(join(dNoop, "package.json")).mtimeMs
    check(
      "install-pkg-noop: scripts уже на месте — файл не перезаписывается",
      res.status === 0 && after === before && mtimeAfter === mtimeBefore && res.out.includes("уже на месте"),
      `exit ${res.status}: mtime ${mtimeBefore} -> ${mtimeAfter}: ${JSON.stringify(after)}`,
    )
  } finally {
    rmSync(dNoop, { recursive: true, force: true })
  }
}
