import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CP = (...cps) => String.fromCodePoint(...cps)
const BS = CP(0x5c)
const LRM = CP(0x200e)
const RLM = CP(0x200f)
const ZWB = CP(0x200b)
const RLO = CP(0x202e)
const BOM = CP(0xfeff)
const ZWJ = CP(0x200d)
const FAMILY = CP(0x1f468) + ZWJ + CP(0x1f469) + ZWJ + CP(0x1f467)

export default async function ({ check, runCli }) {
  const work = mkdtempSync(join(tmpdir(), "slop-gate-fixmark-"))
  try {
    const codeMark = join(work, "code-mark.ts")
    writeFileSync(codeMark, "const a = '" + ZWB + LRM + "value'\nconst x = 1\n")
    runCli(["--fix", codeMark], work)
    const codeMarkFixed = readFileSync(codeMark, "utf8")
    check(
      "fix-mark-code: U+200E in the code part is stripped together with the flagged U+200B",
      !codeMarkFixed.includes(ZWB) && !codeMarkFixed.includes(LRM) && codeMarkFixed.includes("const a = 'value'"),
      JSON.stringify(codeMarkFixed),
    )

    const markAlone = join(work, "mark-alone.ts")
    writeFileSync(markAlone, "const label = '" + RLM + "example'\n")
    runCli(["--fix", markAlone], work)
    const markAloneFixed = readFileSync(markAlone, "utf8")
    check(
      "fix-mark-alone: a line flagged for the mark alone strips it",
      markAloneFixed === "const label = 'example'\n",
      JSON.stringify(markAloneFixed),
    )

    const repro = join(work, "repro.ts")
    const reproComment = "// note with a legitimate " + LRM + " mark"
    writeFileSync(repro, "const a = '" + ZWB + "' " + reproComment + "\nconst x = 1\n")
    runCli(["--fix", repro], work)
    const reproFixed = readFileSync(repro, "utf8")
    const reproLine = reproFixed.split("\n")[0]
    check(
      "fix-mark-comment: U+200E in the comment part survives --fix byte-for-byte",
      !reproLine.includes(ZWB) && reproLine.slice(reproLine.indexOf("//")) === reproComment,
      JSON.stringify({ got: reproLine, want: reproComment }),
    )

    const override = join(work, "override-comment.ts")
    writeFileSync(override, "// note " + RLO + " reversed " + LRM + " end\nconst x = 1\n")
    runCli(["--fix", override], work)
    const overrideFixed = readFileSync(override, "utf8")
    check(
      "fix-override-comment: U+202E inside a comment is still stripped, the mark next to it survives",
      !overrideFixed.includes(RLO) && overrideFixed.includes(LRM),
      JSON.stringify(overrideFixed),
    )

    const zwj = join(work, "zwj.ts")
    writeFileSync(zwj, "const family = '" + FAMILY + "' // " + ZWB + " bad\n")
    runCli(["--fix", zwj], work)
    const zwjFixed = readFileSync(zwj, "utf8")
    check(
      "fix-zwj: a legitimate emoji ZWJ family sequence survives --fix",
      zwjFixed.includes(FAMILY) && !zwjFixed.includes(ZWB),
      JSON.stringify(zwjFixed),
    )

    const bom = join(work, "bom.ts")
    writeFileSync(bom, BOM + "const bad = '" + ZWB + "'\n")
    runCli(["--fix", bom], work)
    const bomFixed = readFileSync(bom, "utf8")
    check(
      "fix-bom: a leading BOM at position 0 survives --fix on the rewritten line",
      bomFixed === BOM + "const bad = ''\n",
      JSON.stringify(bomFixed),
    )

    const escape = join(work, "escape.ts")
    writeFileSync(escape, "const esc = '" + BS + "u200E'\n")
    runCli(["--fix", escape], work)
    const escapeFixed = readFileSync(escape, "utf8")
    check(
      "fix-escape: the source-escape spelling survives --fix",
      escapeFixed === "const esc = '" + BS + "u200E'\n",
      JSON.stringify(escapeFixed),
    )

    runCli(["--fix", repro], work)
    const reproSecond = readFileSync(repro, "utf8")
    check("fix-idempotent: a second --fix run changes nothing", reproSecond === reproFixed, JSON.stringify(reproSecond))

    const untouched = join(work, "untouched.ts")
    const untouchedLine = "// untouched note " + LRM + " here"
    writeFileSync(untouched, "const bad = '" + ZWB + "'\n" + untouchedLine + "\nconst x = 1\n")
    runCli(["--fix", untouched], work)
    const untouchedFixed = readFileSync(untouched, "utf8")
    check(
      "fix-untouched: a line with no finding is not rewritten",
      untouchedFixed.split("\n")[1] === untouchedLine && !untouchedFixed.includes(ZWB),
      JSON.stringify(untouchedFixed),
    )

    const crlf = join(work, "crlf.ts")
    writeFileSync(crlf, "const a = 1\r\nconst b = 2 // было так, стало иначе\r\n// ----------\r\nconst c = 3\r\n")
    runCli(["--fix", crlf], work)
    const crlfFixed = readFileSync(crlf, "utf8")
    check(
      "fix-crlf: --fix on a CRLF file keeps CRLF on every line, no mixed EOL, trailing EOL kept",
      crlfFixed === "const a = 1\r\nconst b = 2\r\nconst c = 3\r\n",
      JSON.stringify(crlfFixed),
    )

    const crlfNoTrail = join(work, "crlf-no-trail.ts")
    writeFileSync(crlfNoTrail, "const a = 1\r\n// ----------\r\nconst c = 3")
    runCli(["--fix", crlfNoTrail], work)
    const crlfNoTrailFixed = readFileSync(crlfNoTrail, "utf8")
    check(
      "fix-crlf-no-trail: a CRLF file without a trailing EOL stays without one",
      crlfNoTrailFixed === "const a = 1\r\nconst c = 3",
      JSON.stringify(crlfNoTrailFixed),
    )

    const obvious = join(work, "obvious.ts")
    writeFileSync(obvious, "// validate the token\nvalidateToken(token)\n")
    runCli(["--fix", obvious], work)
    const obviousFixed = readFileSync(obvious, "utf8")
    check(
      "fix-obvious-comment: a full-line obvious comment is deleted by --fix",
      obviousFixed === "validateToken(token)\n",
      JSON.stringify(obviousFixed),
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
