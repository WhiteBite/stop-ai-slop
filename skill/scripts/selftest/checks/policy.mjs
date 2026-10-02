const IDS = ["multi-line-comment", "changelog-marker", "vend/step-numbered", "vend/zero-width-chars"]

export default async function ({ check, runCli, dir }) {
  const ru = runCli(["--policy"], dir)
  check(
    "policy: --policy печатает политику и строки <id> [severity] для правил [exit 0]",
    ru.status === 0 &&
      ru.out.split("\n")[0].includes("максимум одна строка") &&
      IDS.every((id) => ru.out.includes(id)) &&
      /multi-line-comment \[error\]/.test(ru.out) &&
      /vend\/step-numbered \[warning\]/.test(ru.out),
    `exit ${ru.status}: ${ru.out.slice(0, 300)}`,
  )
  const en = runCli(["--lang", "en", "--policy"], dir)
  check(
    "policy: --lang en --policy печатает EN-сообщения без RU-фолбэка [exit 0]",
    en.status === 0 && en.out.includes("a comment spans 2+ consecutive lines") && !en.out.includes("комментарий занимает 2+ строки"),
    `exit ${en.status}: ${en.out.slice(0, 300)}`,
  )
}
