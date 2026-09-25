---
name: stop-ai-slop
description: Comment-slop policy and mechanical gate — single source of truth for comment rules. Use when checking comment policy, slop comments, before commit, PR review, deslop, stop-ai-slop, writing code comments, documenting a function, adding TODO — multi-line narrative comments, changelog markers (было/стало/instead/fixes) in code, banner divider lines, step-numbered comments, TODO without ticket, markdown inside comments.
---

# stop-ai-slop — гейт против slop-комментариев

Единый источник правды по политике комментариев: таблица правил и детектор живут в `scripts/scan.mjs` (const `RULES`). OpenCode comment-gate plugin импортирует детекцию отсюда — править правила надо здесь, а не в плагине.

Политика: комментарий — максимум одна строка и только неочевидное внешнее ограничение, инвариант или воркэраунд. Пересказ диффа живёт в коммите, why теста — в имени теста. Исключение: многострочный JSDoc/docstring для публичного контракта класса/функции (ограничения, инварианты, поведение ошибок); пересказ сигнатуры и чейнджлог внутри него запрещены.

## Когда запускать

Перед каждым коммитом. Путь к сканеру — `scripts/scan.mjs` относительно корня скилла; подставьте свой `<SKILL_DIR>` (например, `~/.config/opencode/skills/stop-ai-slop`):

```
node <SKILL_DIR>/scripts/scan.mjs --staged
```

В OpenCode-сессиях write/edit/multiedit дополнительно блокируются на записи плагином comment-gate (error-правила). В Claude Code и вне сессий — через pre-commit hook (`--install` ниже) или вручную.

## Правила

| Правило | Severity | Why | Write | Ignore-when |
| --- | --- | --- | --- | --- |
| `multi-line-comment` | error | Многострочный комментарий — почти всегда пересказ кода или диффа. Через год его никто не перечитает, а рассинхрон с кодом не заметит никто. | `// сбрасываем здесь, т.к. ниже освобождаем слот` | Никогда для нового кода; легаси — через baseline. |
| `changelog-marker` | error | История изменений живёт в гите. «Было/стало» в коде устаревает в момент коммита и дальше только врёт. | `git commit -m 'переводим reindex на полный пересчёт: identity mapping ломается'` | Дословная цитата внешней спеки, где формулировка зафиксирована. |
| `long-comment` | error | Длинная строка — признак простыни. Ограничение, достойное комментария, формулируется коротко. | `// сбрасываем здесь, т.к. ниже освобождаем слот` | Единственная строка с длинной ссылкой на спеку/issue. |
| `vend/step-numbered` | warning | Нумерация дублирует порядок строк кода. После первой правки шаги вставляются между — номера врут. | `const normalized = normalize(payload)` | Протокол из внешнего документа с фиксированной нумерацией шагов. |
| `vend/section-divider` | warning | Баннеры — признак файла-простыни. Навигацию даёт структура кода, а не линейки. | отдельный модуль `user/validation.ts` | Сгенерированный файл. |
| `vend/markdown-in-comment` | warning | Markdown в комментарии — документация, которую никто не читает рядом с кодом; она устаревает. | `// сбрасываем здесь, т.к. ниже освобождаем слот` | Docstring, который реально рендерится генератором доков. |
| `vend/this-function-opener` | warning | «This function does X» пересказывает сигнатуру. Ценность только в неочевидном ограничении. | `// дедупликация по id, т.к. источник шлёт повторы` | Публичный API с обязательным JSDoc по внешнему требованию. |
| `vend/file-summary-header` | warning | Оглавление файла устаревает при первой же правке. Структуру видно по символам файла. | ничего — файл начинается с кода | Лицензионная шапка, требуемая политикой репо. |
| `vend/generic-todo` | warning | TODO без тикета — вечный долг: некому искать и некогда чинить. | `// TODO KRY-482 снять воркэраунд после фикса upstream` | Локальный черновик до первого коммита. |

Error блокирует (exit 1, write-time gate бросает). Warning — учитель: выводится, не блокирует.

## Если гейт заблокировал правку

1) убрать комментарий или сжать до одной строки WHY, 2) перезаписать правку, 3) легитимный случай — критерий ignore-when правила (`--explain <id>`), suppression-директива с причиной или baseline только для легаси; гейт не отключать.

Полное обоснование по правилу: `node <SKILL_DIR>/scripts/scan.mjs --explain <rule-id>` — выводит Why / Instead of / Write / Ignore-it-when из той же таблицы.

## Режимы scan.mjs

- `scan [paths...]` — полное сканирование файлов `.ts .tsx .js .jsx .mjs .cjs .py` (по умолчанию cwd; `node_modules dist coverage .git` пропускаются). Нулевые зависимости, Node >= 18, работает на win32.
- `--staged` — только добавленные строки из `git diff --cached -U0`. Вне git-репозитория: exit 0 с пометкой.
- `--baseline-write` — перезаписать `stop-ai-slop.baseline.txt` текущими находками. Baseline — способ закрыть легаси: записи `relpath:line` (строки с `#` — комментарии) вычитаются из вывода обоих режимов.
- `--baseline-prune` — удалить из baseline записи без живых находок; амнистирует удалённое легаси, не трогая новый слоп.
- `--audit [N]` — последние N записей аудит-лога решений write-time плагина (`loaded`/`blocked`/`passed` с файлом и правилами); путь лога — переменная `STOP_AI_SLOP_LOG`, по умолчанию `~/.config/opencode/logs/comment-gate.jsonl`. Плагин загружается на старте сессии OpenCode: после правок плагина нужен рестарт.
- `--self-test` — саботаж-тест на временных фикстурах; exit != 0 при любом расхождении.
- `--install` — в репозитории: добавить npm scripts `stop-ai-slop` / `stop-ai-slop:all` (если есть package.json) и подключить `.git/hooks/pre-commit` с `node .../scan.mjs --staged`. Идемпотентно; существующее тело hook не перезаписывает — дописывает блок с маркером.
- `--install --strict` — то же самое, но hook запускает `--strict`, так что warning тоже блокируют гейт.
- `--diff <ref>` — добавленные строки файлов, отслеживаемых в репо, относительно ref; неотслеживаемые файлы не видны.
- `--strict` — warning тоже блокируют гейт (exit 1).

Директивы подавления: `// stop-ai-slop-ignore-next-line [rule-id]`, `// stop-ai-slop-ignore-line [rule-id]`, `// stop-ai-slop-ignore-file` (после `--` — причина). Синтаксис комментариев берётся из профиля языка (~90 расширений + Dockerfile/Makefile/Jenkinsfile): `#` — комментарий в py/sh/yaml, но препроцессор в C и атрибут в Rust; детектор видит inline-комментарии после кода, блоковые комментарии без маркера на средних строках, doc-блоки, UTF-16 с BOM; zero-width символы игнорируются при матчинге.

## Вывод

```
<relpath>:<line> <rule-id> [<severity>] <сообщение>
  instead: <что написать вместо>
```

Коды выхода: 0 — чисто; 1 — сработал гейт (error-находки вне baseline; warnings — при `--strict`); 2 — ошибка использования или git (неверный флаг, несуществующий ref).
