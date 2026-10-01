import { RULES } from "../../src/rules.mjs"
import { RULE_TEXT_EN } from "../../messages.mjs"

const FIELDS = ["message", "why", "instead", "write", "ignoreWhen"]

export default async function ({ check, runCli, dir }) {
  const missing = []
  for (const rule of RULES) {
    const en = RULE_TEXT_EN[rule.id]
    if (en === undefined) {
      missing.push(`${rule.id}: no EN entry`)
      continue
    }
    for (const field of FIELDS) {
      if (typeof en[field] !== "string" || en[field] === "") missing.push(`${rule.id}.${field}`)
    }
  }
  check("i18n-parity: каждый id из RULES имеет EN-запись с пятью непустыми полями", missing.length === 0, missing)
  const known = new Set(RULES.map((r) => r.id))
  const orphans = Object.keys(RULE_TEXT_EN).filter((id) => !known.has(id))
  check("i18n-parity: EN-записей вне RULES нет", orphans.length === 0, orphans)
  for (const rule of RULES) {
    const en = runCli(["--lang", "en", "--explain", rule.id], dir)
    check(
      `i18n-parity: --lang en --explain ${rule.id} без RU-фолбэка [exit 0]`,
      en.status === 0 && !en.out.includes(rule.why),
      `exit ${en.status}: ${en.out.slice(0, 200)}`,
    )
    const ru = runCli(["--explain", rule.id], dir)
    check(
      `i18n-parity: --explain ${rule.id} печатает RU why [exit 0]`,
      ru.status === 0 && ru.out.includes(rule.why),
      `exit ${ru.status}: ${ru.out.slice(0, 200)}`,
    )
  }
}
