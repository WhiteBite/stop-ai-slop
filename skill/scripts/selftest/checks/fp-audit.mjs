import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const FEFF = String.fromCodePoint(0xfeff)
const FEFF_TEXT = "\\u" + "FEFF"

export default async function ({ check, runCli }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-fp-audit-"))
  try {
    writeFileSync(
      join(work, "why2-must.py"),
      "def respawn():\n    # Respawn races cancel the lifespan mid-wait;\n    # CancelledError must surface as RuntimeError so the best-effort wiring can degrade.\n    pass\n",
    )
    writeFileSync(
      join(work, "why2-nomarker.py"),
      "def f():\n    # The respawn loop races the lifespan during the wait.\n    # The second attempt then reuses the stale session.\n    pass\n",
    )
    writeFileSync(
      join(work, "why3-marker.ts"),
      "// The cache is keyed by path because lookups are hot.\n// The map is shared across workers.\n// The lock is taken on write.\nconst x = 1\n",
    )
    writeFileSync(
      join(work, "javadoc-cont.java"),
      "class Engine {\n * Applies the configured identifier rules, in their declared order.\n * Later rules run on the output of earlier rules; failures stop the chain.\n}\n",
    )
    writeFileSync(
      join(work, "block-narrative.java"),
      "class Engine {\n/* We rewrote the whole dispatch loop.\n * It used to be synchronous and is now queued.\n * The old path was removed in the refactor.\n */\n}\n",
    )
    writeFileSync(
      join(work, "why2-dart.dart"),
      "void build() {\n  // inline preview card serves compact/medium where the rail is hidden —\n  // on expanded the two must not duplicate each other.\n}\n",
    )
    writeFileSync(
      join(work, "why2-yaml.yaml"),
      "jvm:\n  # heap comes from the cgroup limit, not the host RAM,\n  # because the JVM cannot see the container boundary by default.\n  opts: -xmx\n",
    )
    writeFileSync(join(work, "bom-escape.ts"), 'export const withBom = (lines) => "' + FEFF_TEXT + '" + lines.join("\\r\\n")\n')
    writeFileSync(join(work, "bom-real.ts"), 'const s = "a' + FEFF + 'b"\n')
    writeFileSync(
      join(work, "nolonger.ts"),
      "// The walker no longer rebuilds the list; previously it ran on every keystroke.\nconst x = 1\n",
    )

    const scanOf = (name) => runCli(["scan", name], work)

    const why2 = scanOf("why2-must.py")
    check(
      "fp-audit: 2-строчный why с маркером must — эксемпт, даже если не влезает в один лимит длины",
      why2.status === 0,
      `exit ${why2.status}: ${why2.out.slice(0, 200)}`,
    )
    const why2No = scanOf("why2-nomarker.py")
    check(
      "fp-audit: 2-строчный run без why-маркера по-прежнему флагается",
      why2No.status === 1 && why2No.out.includes("multi-line-comment"),
      `exit ${why2No.status}: ${why2No.out.slice(0, 200)}`,
    )
    const why3 = scanOf("why3-marker.ts")
    check(
      "fp-audit: 3-строчный run с why-маркером по-прежнему флагается",
      why3.status === 1 && why3.out.includes("multi-line-comment"),
      `exit ${why3.status}: ${why3.out.slice(0, 200)}`,
    )
    const why2Dart = scanOf("why2-dart.dart")
    check(
      "fp-audit: 2-строчный why в dart (//) — эксемпт",
      why2Dart.status === 0,
      `exit ${why2Dart.status}: ${why2Dart.out.slice(0, 200)}`,
    )
    const why2Yaml = scanOf("why2-yaml.yaml")
    check(
      "fp-audit: 2-строчный why в yaml (#) — эксемпт",
      why2Yaml.status === 0,
      `exit ${why2Yaml.status}: ${why2Yaml.out.slice(0, 200)}`,
    )
    const javadoc = scanOf("javadoc-cont.java")
    check(
      "fp-audit: continuation-run из ` * ` строк без opener в дельте не флагается (JSDoc/KDoc)",
      javadoc.status === 0,
      `exit ${javadoc.status}: ${javadoc.out.slice(0, 200)}`,
    )
    const narrative = scanOf("block-narrative.java")
    check(
      "fp-audit: блок с видимым /*-opener и narrative по-прежнему флагается",
      narrative.status === 1 && narrative.out.includes("multi-line-comment"),
      `exit ${narrative.status}: ${narrative.out.slice(0, 200)}`,
    )
    const bomEscape = scanOf("bom-escape.ts")
    check(
      "fp-audit: escape-написание FEFF как текст в строке кода не флагается zero-width",
      bomEscape.status === 0,
      `exit ${bomEscape.status}: ${bomEscape.out.slice(0, 200)}`,
    )
    const bomReal = scanOf("bom-real.ts")
    check(
      "fp-audit: реальный U+FEFF в середине строки по-прежнему флагается",
      bomReal.status === 1 && bomReal.out.includes("vend/zero-width-chars"),
      `exit ${bomReal.status}: ${bomReal.out.slice(0, 200)}`,
    )
    const noLonger = scanOf("nolonger.ts")
    check(
      "fp-audit: «no longer» в прозе о текущем состоянии не считается changelog-маркером",
      noLonger.status === 0 && !noLonger.out.includes("changelog-marker"),
      `exit ${noLonger.status}: ${noLonger.out.slice(0, 200)}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
