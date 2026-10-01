import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { RULES } from "../../scan.mjs"
import { patternFromRules } from "../../gen-schema.mjs"

export default async function ({ check, selfPath, selfRoot }) {
  const schemaPath = join(selfRoot, "schema", "stop-ai-slop.schema.json")
  let committed = null
  let readError = null
  try {
    committed = Object.keys(JSON.parse(readFileSync(schemaPath, "utf8")).properties.rules.patternProperties)[0]
  } catch (error) {
    readError = error
  }
  const generated = patternFromRules(RULES)
  check(
    "schema-gen-sync: patternProperties паттерн байт-в-байт равен patternFromRules(RULES)",
    committed === generated,
    readError !== null ? String(readError.message ?? readError) : `committed: ${committed}; generated: ${generated}`,
  )
  let anchoredOk = false
  let anchoredDetail = readError !== null ? String(readError.message ?? readError) : "schema unreadable"
  if (committed !== null) {
    const re = new RegExp(committed)
    const isAnchored = committed.startsWith("^") && committed.endsWith("$")
    const allMatch = RULES.every((r) => re.test(r.id))
    const rejects = !re.test("bogus-rule") && !re.test("multi-line-commentX")
    anchoredOk = isAnchored && allMatch && rejects
    anchoredDetail = `anchored: ${isAnchored}; allMatch: ${allMatch}; rejects: ${rejects}`
  }
  check("schema-gen-anchored: паттерн заякорен, покрывает все RULES и отвергает посторонние id", anchoredOk, anchoredDetail)
  const genPath = join(dirname(selfPath), "gen-schema.mjs")
  let cliRun = { status: 0, out: "" }
  try {
    cliRun.out = execFileSync(process.execPath, [genPath, "--check"], { encoding: "utf8", stdio: "pipe", cwd: selfRoot })
  } catch (error) {
    cliRun = { status: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
  check(
    "schema-gen-cli: gen-schema.mjs --check [exit 0, in sync]",
    cliRun.status === 0 && cliRun.out.includes("schema: in sync"),
    `exit ${cliRun.status}: ${cliRun.out.slice(0, 200)}`,
  )
  const fakeId = "vend/fake-rule"
  const withFake = patternFromRules([...RULES, { id: fakeId }])
  const expected = "^(" + [...RULES.map((r) => r.id), fakeId].join("|") + ")$"
  check(
    "schema-gen-new-rule: patternFromRules строит паттерн из переданных правил, новый id попадает в вывод",
    withFake === expected && new RegExp(withFake).test(fakeId) && !new RegExp(generated).test(fakeId),
    `withFake: ${withFake}`,
  )
}
