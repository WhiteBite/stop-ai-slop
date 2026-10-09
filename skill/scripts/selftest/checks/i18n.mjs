import { RULES } from "../../src/rules.mjs"
import { RULE_TEXT_EN } from "../../messages.mjs"
import { explainText } from "../../src/report.mjs"
import { currentLang, setLang } from "../../src/i18n.mjs"

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
  const langBefore = currentLang()
  try {
    for (const rule of RULES) {
      setLang("en")
      const enText = explainText(rule.id)
      check(
        `i18n-parity: explain ${rule.id} на EN без RU-фолбэка`,
        enText !== null && !enText.includes(rule.why),
        String(enText).slice(0, 200),
      )
      setLang("ru")
      const ruText = explainText(rule.id)
      check(
        `i18n-parity: explain ${rule.id} печатает RU why`,
        ruText !== null && ruText.includes(rule.why),
        String(ruText).slice(0, 200),
      )
    }
  } finally {
    setLang(langBefore)
  }
  const smokeRule = RULES.find((r) => r.id === "vend/generic-todo")
  const smokeEn = runCli(["--lang", "en", "--explain", smokeRule.id], dir)
  check(
    "i18n-parity: CLI --lang en --explain end-to-end без RU-фолбэка [exit 0]",
    smokeEn.status === 0 && !smokeEn.out.includes(smokeRule.why),
    `exit ${smokeEn.status}: ${smokeEn.out.slice(0, 200)}`,
  )
  const smokeRu = runCli(["--explain", smokeRule.id], dir)
  check(
    "i18n-parity: CLI --explain end-to-end печатает RU why [exit 0]",
    smokeRu.status === 0 && smokeRu.out.includes(smokeRule.why),
    `exit ${smokeRu.status}: ${smokeRu.out.slice(0, 200)}`,
  )
}
