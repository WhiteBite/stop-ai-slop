import { detectCommentSlop } from "../../skill/scripts/src/detect.mjs"
import { PROFILES, profileFor } from "../../skill/scripts/src/profiles.mjs"
import { rt, setLang } from "../../skill/scripts/src/i18n.mjs"

const SLOP_SAMPLE = [
  "const LIMIT = 42",
  "// Эта функция пересчитывает лимиты",
  "// было: лимит брался из конфига, стало: из ответа сервера",
  "// TODO починить потом",
  "// Шаг 1: нормализуем вход",
  "export function recalc(limits) {",
  "  return limits",
  "}",
].join("\n")
const CLEAN_SAMPLE = [
  "// внешний лимит: upstream рвёт соединение через 30 секунд",
  "const TIMEOUT_MS = 30_000",
  "",
  "export function connect(url) {",
  "  return open(url, { timeout: TIMEOUT_MS })",
  "}",
].join("\n")

const code = document.querySelector("#code")
const ext = document.querySelector("#ext")
const list = document.querySelector("#findings")
const summary = document.querySelector("#summary")
let last = []

const currentLang = () => document.querySelector("input[name=lang]:checked").value

function render() {
  list.replaceChildren()
  let errors = 0
  for (const f of last) {
    if (f.severity === "error") errors++
    const li = document.createElement("li")
    li.className = f.severity
    const msg = rt(f.rule, "message") ?? f.rule
    li.textContent = `line ${f.lineNo} · ${f.rule} [${f.severity}] · ${f.reason === undefined ? msg : `${msg} (${f.reason})`}`
    list.append(li)
  }
  summary.textContent = currentLang() === "ru" ? `${last.length} находок, ${errors} ошибок` : `${last.length} findings, ${errors} errors`
}

function scan() {
  const profile = profileFor(`sample${ext.value}`) ?? PROFILES.legacy
  last = detectCommentSlop(code.value.replaceAll("\r\n", "\n").split("\n"), profile)
  render()
}

document.querySelector("#scan").addEventListener("click", scan)
document.querySelector("#sample-slop").addEventListener("click", () => {
  code.value = SLOP_SAMPLE
  ext.value = ".ts"
  scan()
})
document.querySelector("#sample-clean").addEventListener("click", () => {
  code.value = CLEAN_SAMPLE
  ext.value = ".ts"
  scan()
})
for (const radio of document.querySelectorAll("input[name=lang]")) {
  radio.addEventListener("change", () => {
    setLang(radio.value)
    render()
  })
}

code.value = SLOP_SAMPLE
scan()
