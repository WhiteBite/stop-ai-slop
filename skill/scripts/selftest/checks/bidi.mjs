import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CP = (...cps) => String.fromCodePoint(...cps)
const BS = CP(0x5c)

export default async function ({ check, runCli, dir }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-bidi-"))
  const lrm = join(work, "lrm.ts")
  const rlm = join(work, "rlm.ts")
  const lrmEsc = join(work, "lrm-escape.ts")
  const rlmEsc = join(work, "rlm-escape.ts")
  const bidi = join(work, "bidi-202e.ts")
  const zw = join(work, "zw-200b.ts")
  const zwj = join(work, "zwj-ok.ts")
  const bom = join(work, "bom-ok.ts")
  const lrmComment = join(work, "lrm-comment.ts")
  const lrmInline = join(work, "lrm-inline.ts")
  const lrmProse = join(work, "lrm-prose.md")
  const rloComment = join(work, "rlo-comment.ts")
  const fix = join(work, "fix.ts")
  try {
    writeFileSync(lrm, "const label = '" + CP(0x200e) + "example'\n")
    writeFileSync(rlm, "const label = '" + CP(0x200f) + "example'\n")
    writeFileSync(lrmEsc, "const label = '" + BS + "u200Eexample'\n")
    writeFileSync(rlmEsc, "const label = '" + BS + "u200Fexample'\n")
    writeFileSync(bidi, "const url = '" + CP(0x202e) + "reversed.com'\n")
    writeFileSync(zw, "const value = '" + CP(0x200b) + "test'\n")
    writeFileSync(zwj, "const family = '" + CP(0x1f468) + CP(0x200d) + CP(0x1f469) + CP(0x200d) + CP(0x1f467) + "'\n")
    writeFileSync(bom, CP(0xfeff) + "const x = 1\n")
    writeFileSync(lrmComment, "// " + CP(0x200e) + " direction note\nconst x = 1\n")
    writeFileSync(lrmInline, "const x = 1 // " + CP(0x200f) + " note\n")
    writeFileSync(lrmProse, "<!-- " + CP(0x200e) + " note -->\ntext\n")
    writeFileSync(rloComment, "// " + CP(0x202e) + " reversed\nconst x = 1\n")
    writeFileSync(fix, "const label = '" + CP(0x200e) + CP(0x200f) + "example'\nconst esc = '" + BS + "u200E'\n")

    const scanOf = (file) => runCli(["scan", file], work)

    const lrmRun = scanOf(lrm)
    check(
      "bidi: U+200E в строке кода -> vend/bidi-controls [error]",
      lrmRun.status === 1 && lrmRun.out.includes("vend/bidi-controls [error]"),
      `exit ${lrmRun.status}: ${lrmRun.out.slice(0, 200)}`,
    )
    const rlmRun = scanOf(rlm)
    check(
      "bidi: U+200F в строке кода -> vend/bidi-controls [error]",
      rlmRun.status === 1 && rlmRun.out.includes("vend/bidi-controls [error]"),
      `exit ${rlmRun.status}: ${rlmRun.out.slice(0, 200)}`,
    )
    const lrmEscRun = scanOf(lrmEsc)
    check(
      "bidi: escape " + BS + "u200E в исходнике -> vend/bidi-controls [error]",
      lrmEscRun.status === 1 && lrmEscRun.out.includes("vend/bidi-controls [error]"),
      `exit ${lrmEscRun.status}: ${lrmEscRun.out.slice(0, 200)}`,
    )
    const rlmEscRun = scanOf(rlmEsc)
    check(
      "bidi: escape " + BS + "u200F в исходнике -> vend/bidi-controls [error]",
      rlmEscRun.status === 1 && rlmEscRun.out.includes("vend/bidi-controls [error]"),
      `exit ${rlmEscRun.status}: ${rlmEscRun.out.slice(0, 200)}`,
    )

    const bidiRun = scanOf(bidi)
    check(
      "bidi-regress: U+202E по-прежнему флагается [error]",
      bidiRun.status === 1 && bidiRun.out.includes("vend/bidi-controls [error]"),
      `exit ${bidiRun.status}: ${bidiRun.out.slice(0, 200)}`,
    )
    const zwRun = scanOf(zw)
    check(
      "bidi-regress: U+200B остаётся vend/zero-width-chars [error]",
      zwRun.status === 1 && zwRun.out.includes("vend/zero-width-chars [error]") && !zwRun.out.includes("vend/bidi-controls"),
      `exit ${zwRun.status}: ${zwRun.out.slice(0, 200)}`,
    )
    const zwjRun = scanOf(zwj)
    check("bidi-regress: эмодзи-ZWJ последовательность не флагается [exit 0]", zwjRun.status === 0, `exit ${zwjRun.status}: ${zwjRun.out.slice(0, 200)}`)
    const bomRun = scanOf(bom)
    check("bidi-regress: BOM в позиции 0 строки 0 не флагается [exit 0]", bomRun.status === 0, `exit ${bomRun.status}: ${bomRun.out.slice(0, 200)}`)

    const marksInComment = scanOf(lrmComment)
    check(
      "bidi-marks: U+200E in a full-line comment is legitimate RTL typography [exit 0]",
      marksInComment.status === 0 && !marksInComment.out.includes("vend/bidi-controls"),
      `exit ${marksInComment.status}: ${marksInComment.out.slice(0, 200)}`,
    )
    const marksInline = scanOf(lrmInline)
    check(
      "bidi-marks: U+200F in an inline comment is not flagged [exit 0]",
      marksInline.status === 0 && !marksInline.out.includes("vend/bidi-controls"),
      `exit ${marksInline.status}: ${marksInline.out.slice(0, 200)}`,
    )
    const marksProse = scanOf(lrmProse)
    check(
      "bidi-marks: U+200E in a prose file is not flagged [exit 0]",
      marksProse.status === 0 && !marksProse.out.includes("vend/bidi-controls"),
      `exit ${marksProse.status}: ${marksProse.out.slice(0, 200)}`,
    )
    const overrideInComment = scanOf(rloComment)
    check(
      "bidi-marks: U+202E override still fires inside a comment [error]",
      overrideInComment.status === 1 && overrideInComment.out.includes("vend/bidi-controls [error]"),
      `exit ${overrideInComment.status}: ${overrideInComment.out.slice(0, 200)}`,
    )

    runCli(["--fix", fix], work)
    const fixed = readFileSync(fix, "utf8")
    check(
      "bidi-fix: настоящие U+200E/U+200F удалены, escape-форма цела",
      !fixed.includes(CP(0x200e)) && !fixed.includes(CP(0x200f)) && fixed.includes(BS + "u200E"),
      fixed,
    )

    const ruExplain = runCli(["--explain", "vend/bidi-controls"], dir)
    check(
      "bidi-explain-ru: перечисляет U+200E и U+200F",
      ruExplain.status === 0 && ruExplain.out.includes("U+200E") && ruExplain.out.includes("U+200F"),
      ruExplain.out.slice(0, 300),
    )
    const enExplain = runCli(["--lang", "en", "--explain", "vend/bidi-controls"], dir)
    check(
      "bidi-explain-en: enumerates U+200E and U+200F",
      enExplain.status === 0 && enExplain.out.includes("U+200E") && enExplain.out.includes("U+200F"),
      enExplain.out.slice(0, 300),
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}