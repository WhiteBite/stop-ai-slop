import { MESSAGES, RULE_TEXT_EN } from "../messages.mjs"
import { RULE_BY_ID } from "./rules.mjs"

export let LANG = "ru"
export function resolveLang(argv, env = process.env) {
  const flagIdx = argv.indexOf("--lang")
  if (flagIdx !== -1) {
    const value = argv[flagIdx + 1]
    if (value !== "ru" && value !== "en") return { lang: null, error: true }
    return { lang: value, error: false }
  }
  const explicit = env.STOP_AI_SLOP_LANG
  if (explicit === "ru" || explicit === "en") return { lang: explicit, error: false }
  const locale = env.LC_ALL ?? env.LANG
  if (typeof locale === "string" && locale !== "") {
    const norm = locale.toLowerCase()
    if (norm === "c" || norm === "posix" || norm.startsWith("c.")) return { lang: "ru", error: false }
    return { lang: norm.startsWith("ru") ? "ru" : "en", error: false }
  }
  return { lang: "ru", error: false }
}
export function setLang(lang) {
  LANG = lang
}
export function currentLang() {
  return LANG
}
export const T = (key, ...args) => {
  const entry = MESSAGES[LANG]?.[key] ?? MESSAGES.ru[key]
  return typeof entry === "function" ? entry(...args) : entry
}
export const rt = (ruleId, field) => (LANG === "en" ? RULE_TEXT_EN[ruleId]?.[field] : undefined) ?? RULE_BY_ID.get(ruleId)?.[field]
