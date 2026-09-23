# stop-ai-slop

[![license](https://img.shields.io/github/license/WhiteBite/stop-ai-slop)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![zero-deps](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

> English abstract: stop-ai-slop is a zero-dependency comment-slop gate. One scanner (`skill/scripts/scan.mjs`, const `RULES`) is the single source of truth for a one-line/why-only comment policy. It is enforced at four points: an OpenCode write-time plugin that blocks `write`/`edit`/`multiedit`, a pre-commit hook installed via `--install`, a cross-agent skill (`skill/SKILL.md`), and a baseline file that grandfathers legacy code. Node >= 18, works on win32.

## Что и зачем

Политика: комментарий — максимум одна строка и только неочевидное внешнее ограничение, инвариант или воркэраунд. Пересказ диффа живёт в сообщении коммита, why теста — в имени теста. Таблица правил и детектор живут в `skill/scripts/scan.mjs` (const `RULES`) — править правила надо там, всё остальное только применяет их.

Error-правила блокируют (exit 1, write-time gate бросает ошибку). Warning — учитель: выводится, не блокирует.

## Точки приложения

1. **OpenCode write-time плагин** — `plugin/comment-gate.ts` перехватывает `write`/`edit`/`multiedit` и отклоняет правку с error-находками в момент записи. Монтируется в `~/.config/opencode/plugins/` стабом-реэкспортом.
2. **Pre-commit через `--install`** — одна команда вшивает `node .../scan.mjs --staged` в `.git/hooks/pre-commit` (идемпотентно, дописывает блок с маркером, не затирая существующий hook) и добавляет npm scripts `stop-ai-slop` / `stop-ai-slop:all` в package.json.
3. **Agent skill** — `skill/SKILL.md` (name: `stop-ai-slop`): политика, таблица правил, режимы запуска. Монтируется в OpenCode и Claude Code.
4. **Baseline для легаси** — `--baseline-write` записывает `stop-ai-slop.baseline.txt` (записи `relpath:line`, строки с `#` — комментарии). Записи вычитаются из вывода обоих режимов: старый код не мешает, новый слоп не проходит.

## Быстрый старт

```
node skill/scripts/scan.mjs --self-test       # саботаж-тест детектора
node skill/scripts/scan.mjs scan .            # полное сканирование (.ts .tsx .js .jsx .mjs .cjs .py)
node skill/scripts/scan.mjs --staged          # только добавленные строки из git diff --cached
node skill/scripts/scan.mjs --baseline-write  # записать текущие находки в baseline
node skill/scripts/scan.mjs --install         # npm scripts + pre-commit hook в текущем репо
```

Exit 1 — есть error-находки вне baseline; иначе 0.

## Монтаж на другую машину

```
git clone https://github.com/WhiteBite/stop-ai-slop <path>
mklink /J "%USERPROFILE%\.config\opencode\skills\stop-ai-slop" "<path>\skill"
mklink /J "%USERPROFILE%\.claude\skills\stop-ai-slop" "<path>\skill"
```

Write-time плагин OpenCode: файл `%USERPROFILE%\.config\opencode\plugins\comment-gate.ts` из одной строки
`export { CommentGate, detectCommentSlop } from "<path>/plugin/comment-gate.ts"`.
На Linux/macOS вместо `mklink /J` — `ln -s`. В любом git-репо без агентов работает `scan.mjs --install`.

## Правила

| Правило | Severity | Суть |
| --- | --- | --- |
| `multi-line-comment` | error | комментарий занимает 2+ строки подряд |
| `changelog-marker` | error | комментарий пересказывает дифф (было/стало/раньше/вместо/fixes) |
| `long-comment` | error | строка комментария длиннее 120 символов |
| `vend/step-numbered` | warning | нумерованный шаг в комментарии (// Step N или // N.) |
| `vend/section-divider` | warning | строка-разделитель из символов -=#* |
| `vend/markdown-in-comment` | warning | markdown-разметка внутри комментария (**, -, \|) |
| `vend/this-function-opener` | warning | комментарий начинается с «This function/class/method/component» |
| `vend/file-summary-header` | warning | шапка-резюме из 2+ строк комментария в начале файла |
| `vend/generic-todo` | warning | TODO без ссылки на тикет |

Полное обоснование по правилу (Why / Instead of / Write / Ignore it when из той же таблицы `RULES`):

```
node skill/scripts/scan.mjs --explain <rule-id>
```
