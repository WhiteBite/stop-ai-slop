import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SLOP_YAML = "# первая строка блока\n# вторая строка блока\nkey: value\n"
const SLOP_TS = "// первая строка блока\n// вторая строка блока\nconst x = 1\n"
const SLOP_YML = "# первая строка блока\n# вторая строка блока\nname: ci\n"
const SLOP_MD = "<!-- первая строка\nвторая строка -->\n"

export default async function ({ check, runCli, selfPath }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-overrides-"))
  try {
    const put = (dir, rel, content) => {
      const slash = rel.lastIndexOf("/")
      if (slash !== -1) mkdirSync(join(dir, rel.slice(0, slash)), { recursive: true })
      writeFileSync(join(dir, rel), content)
    }
    const scenario = (name, files, config) => {
      const dir = join(work, name)
      mkdirSync(dir, { recursive: true })
      for (const [rel, content] of Object.entries(files)) put(dir, rel, content)
      writeFileSync(join(dir, ".stop-ai-slop.yaml"), config)
      return runCli(["scan", "."], dir)
    }

    const basic = scenario(
      "basic",
      { "slop.yaml": SLOP_YAML, "slop.ts": SLOP_TS },
      'overrides:\n  - paths:\n      - "*.yaml"\n    rules:\n      multi-line-comment: warning\n',
    )
    check(
      "ovr-basic: *.yaml понижает multi-line-comment до warning, .ts без матча остаётся error [exit 1]",
      basic.status === 1 &&
        basic.out.includes("slop.yaml:1 multi-line-comment [warning]") &&
        basic.out.includes("slop.ts:1 multi-line-comment [error]"),
      `exit ${basic.status}: ${basic.out.slice(0, 300)}`,
    )

    const precGlobal = scenario(
      "prec-global",
      { "slop.yaml": SLOP_YAML },
      'rules:\n  multi-line-comment: error\noverrides:\n  - paths:\n      - "*.yaml"\n    rules:\n      multi-line-comment: warning\n',
    )
    check(
      "ovr-precedence-global: оверрайд warning бьёт глобальный rules: error [exit 0]",
      precGlobal.status === 0 && precGlobal.out.includes("slop.yaml:1 multi-line-comment [warning]"),
      `exit ${precGlobal.status}: ${precGlobal.out.slice(0, 300)}`,
    )

    const precOrder = scenario(
      "prec-order",
      { "slop.yaml": SLOP_YAML },
      'overrides:\n  - paths:\n      - "*.yaml"\n    rules:\n      multi-line-comment: warning\n  - paths:\n      - "*.yaml"\n    rules:\n      multi-line-comment: error\n',
    )
    check(
      "ovr-precedence-order: поздняя запись overrides бьёт раннюю [error, exit 1]",
      precOrder.status === 1 && precOrder.out.includes("slop.yaml:1 multi-line-comment [error]"),
      `exit ${precOrder.status}: ${precOrder.out.slice(0, 300)}`,
    )

    const prefix = scenario(
      "prefix",
      { "config/a.yaml": SLOP_YAML, "configuration.md": SLOP_MD },
      "overrides:\n  - paths:\n      - config\n    rules:\n      multi-line-comment: warning\n",
    )
    check(
      "ovr-prefix: шаблон без * — префикс: config матчит config/a.yaml, но не configuration.md",
      prefix.out.includes("config/a.yaml:1 multi-line-comment [warning]") &&
        prefix.out.includes("configuration.md:1 multi-line-comment [error]"),
      `exit ${prefix.status}: ${prefix.out.slice(0, 300)}`,
    )

    const globDeep = scenario(
      "glob-deep",
      { ".github/workflows/ci.yml": SLOP_YML },
      'overrides:\n  - paths:\n      - ".github/**/*.yml"\n    rules:\n      multi-line-comment: warning\n',
    )
    check(
      "ovr-glob-deep: .github/**/*.yml матчит .github/workflows/ci.yml — ** пересекает / [warning]",
      globDeep.out.includes(".github/workflows/ci.yml:1 multi-line-comment [warning]"),
      `exit ${globDeep.status}: ${globDeep.out.slice(0, 300)}`,
    )

    const globFlat = scenario(
      "glob-flat",
      { "a/b.yml": SLOP_YML },
      'overrides:\n  - paths:\n      - "*.yml"\n    rules:\n      multi-line-comment: warning\n',
    )
    check(
      "ovr-glob-flat: *.yml не матчит a/b.yml — * не пересекает / [error, exit 1]",
      globFlat.status === 1 && globFlat.out.includes("a/b.yml:1 multi-line-comment [error]"),
      `exit ${globFlat.status}: ${globFlat.out.slice(0, 300)}`,
    )

    const off = scenario(
      "off",
      { "slop.yaml": SLOP_YAML, "slop.ts": SLOP_TS },
      'overrides:\n  - paths:\n      - "*.yaml"\n    rules:\n      multi-line-comment: off\n',
    )
    check(
      "ovr-off: off снимает находку только для матчащих файлов [yaml нет, ts error]",
      off.status === 1 && !off.out.includes("slop.yaml:1 multi-line-comment") && off.out.includes("slop.ts:1 multi-line-comment [error]"),
      `exit ${off.status}: ${off.out.slice(0, 300)}`,
    )

    const bad = scenario(
      "bad",
      { "slop.yaml": SLOP_YAML },
      'overrides:\n  - paths:\n      - "*.yaml"\n    rules:\n      multi-line-comment: bogus\n',
    )
    check(
      "ovr-bad-sev: недопустимое severity в overrides → exit 2 с файлом и строкой",
      bad.status === 2 && bad.out.includes(".stop-ai-slop.yaml:5") && bad.out.includes("недопустимое severity"),
      `exit ${bad.status}: ${bad.out.slice(0, 300)}`,
    )

    const bogusRules = scenario(
      "bogus-rules",
      { "slop.yaml": SLOP_YAML },
      'rules:\n  bogus-rule: off\n',
    )
    check(
      "ovr-bogus-rule: неизвестный id в rules: → exit 2 с файлом, строкой и id",
      bogusRules.status === 2 &&
        bogusRules.out.includes(".stop-ai-slop.yaml:2") &&
        bogusRules.out.includes("bogus-rule") &&
        bogusRules.out.includes("неизвестное правило"),
      `exit ${bogusRules.status}: ${bogusRules.out.slice(0, 300)}`,
    )

    const bogusOverride = scenario(
      "bogus-override",
      { "slop.yaml": SLOP_YAML },
      'overrides:\n  - paths:\n      - "*.yaml"\n    rules:\n      bogus-rule: error\n',
    )
    check(
      "ovr-bogus-override: неизвестный id в override rules: → exit 2 с файлом, строкой и id",
      bogusOverride.status === 2 &&
        bogusOverride.out.includes(".stop-ai-slop.yaml:5") &&
        bogusOverride.out.includes("bogus-rule") &&
        bogusOverride.out.includes("неизвестное правило"),
      `exit ${bogusOverride.status}: ${bogusOverride.out.slice(0, 300)}`,
    )

    const validMixed = scenario(
      "valid-mixed",
      { "slop.yaml": SLOP_YAML },
      'rules:\n  multi-line-comment: warning\n  long-comment: off\n',
    )
    check(
      "ovr-valid-mixed: валидный конфиг с известными id грузится [warning, exit 0]",
      validMixed.status === 0 && validMixed.out.includes("slop.yaml:1 multi-line-comment [warning]"),
      `exit ${validMixed.status}: ${validMixed.out.slice(0, 300)}`,
    )

    const preTool = (payload, cwd) => {
      try {
        return {
          status: 0,
          out: execFileSync(process.execPath, [selfPath, "--pre-tool"], {
            cwd,
            input: JSON.stringify(payload),
            encoding: "utf8",
            stdio: "pipe",
            env: { ...process.env, STOP_AI_SLOP_LANG: "ru" },
          }),
        }
      } catch (error) {
        return { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
      }
    }
    const gateDir = join(work, "pretool")
    mkdirSync(gateDir, { recursive: true })
    writeFileSync(join(gateDir, "slop.yaml"), SLOP_YAML)
    writeFileSync(join(gateDir, "slop.ts"), SLOP_TS)
    writeFileSync(
      join(gateDir, ".stop-ai-slop.yaml"),
      'overrides:\n  - paths:\n      - "*.yaml"\n    rules:\n      multi-line-comment: warning\n',
    )
    const yamlEdit = preTool(
      { tool_name: "edit", tool_input: { file_path: join(gateDir, "slop.yaml"), old_string: "", new_string: "# новая строка один\n# новая строка два\n" } },
      gateDir,
    )
    check(
      "ovr-pretool-yaml: --pre-tool правка .yaml с оверрайдом warning не блокирует [exit 0]",
      yamlEdit.status === 0,
      `exit ${yamlEdit.status}: ${yamlEdit.out.slice(0, 200)}`,
    )
    const tsEdit = preTool(
      { tool_name: "edit", tool_input: { file_path: join(gateDir, "slop.ts"), old_string: "", new_string: "// новая строка один\n// новая строка два\n" } },
      gateDir,
    )
    check(
      "ovr-pretool-ts: та же правка в .ts без матча блокирует [exit 2]",
      tsEdit.status === 2 && tsEdit.out.includes("multi-line-comment"),
      `exit ${tsEdit.status}: ${tsEdit.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
