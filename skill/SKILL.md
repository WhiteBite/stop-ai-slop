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
| `vend/self-suppression` | warning | Директива в одной правке с кодом, который она глушит, — амнистия без ревизии. | `// stop-ai-slop-ignore-next-line vend/step-numbered -- нумерация из внешнего протокола` | Full-scan: директива уже в репо, подавление легитимно. |
| `vend/cjk-noise` | warning | Переключение модели на китайский посреди идентификатора или строки не читается и не компилируется осмысленно; склейка иероглифов с латиницей — маркер невычищенной генерации, а не осознанной i18n-строки. | `const TAB_LABELS = { features: 'Функции' }` | Легальные китайские комментарии и строки i18n без смежности с латиницей; подавление директивой. |
| `vend/zero-width-chars` | error | Невидимые символы (U+200B–U+200D, U+2060, U+FEFF) — канал инъекций и обфускации (Unicode Instruction Injection, Trojan Source): текст выглядит не так, как исполняется. | `const label = 'test'` | Нет (всегда артефакт или инъекция). |
| `vend/bidi-controls` | error | BiDi-override (U+202A–U+202E, U+2066–U+2069) меняет визуальный порядок кода без изменения логики: ревьюер видит не тот код, что исполняется. | `const url = 'example.com'` | Нет (явные контролы в коде не нужны). |

Error блокирует (exit 1, write-time gate бросает). Warning — учитель: выводится, не блокирует.

## Если гейт заблокировал правку

1) убрать комментарий или сжать до одной строки WHY, 2) перезаписать правку, 3) легитимный случай — критерий ignore-when правила (`--explain <id>`), suppression-директива с причиной или baseline только для легаси; гейт не отключать.

Полное обоснование по правилу: `node <SKILL_DIR>/scripts/scan.mjs --explain <rule-id>` — выводит Why / Instead of / Write / Ignore-it-when из той же таблицы.

## Режимы scan.mjs

- `scan [paths...]` — полное сканирование файлов поддерживаемых профилей (160 расширений и 26 имён файлов, таблица в README; по умолчанию cwd; каталоги артефактов пропускаются). Нулевые зависимости, Node >= 18, работает на win32, linux и macOS.
- `--staged` — только добавленные строки из `git diff --cached -U0`. Вне git-репозитория: exit 0 с пометкой.
- `--baseline-write` — перезаписать `stop-ai-slop.baseline.txt` текущими находками. Baseline — способ закрыть легаси: записи `relpath:line` (строки с `#` — комментарии) вычитаются из вывода обоих режимов.
- `--baseline-prune` — удалить из baseline записи без живых находок; амнистирует удалённое легаси, не трогая новый слоп.
- `--audit [N]` — последние N записей аудит-лога решений write-time плагина (`loaded`/`blocked`/passed с файлом и правилами); путь лога — переменная `STOP_AI_SLOP_LOG`, по умолчанию `~/.config/opencode/logs/comment-gate.jsonl`. Плагин загружается на старте сессии OpenCode: после правок плагина нужен рестарт. Шаг 0 диагностики: если в логе нет новых записей после редактирования — процесс OpenCode не подхватил новую версию плагина.
- `--stdin-path` — читает JSON hook-пейлоад из stdin (`tool_input.file_path`) и сканирует один файл; для PostToolUse-хуков Claude Code/Cursor/Codex (шаблон: `.claude-plugin/stop-ai-slop/hooks/hooks.json`).
- `--self-test` — саботаж-тест на временных фикстурах; exit != 0 при любом расхождении.
- `--install` — в репозитории: добавить npm scripts `stop-ai-slop` / `stop-ai-slop:all` (если есть package.json) и подключить `.git/hooks/pre-commit` с `node .../scan.mjs --staged`. Идемпотентно; существующее тело hook не перезаписывает — дописывает блок с маркером.
- `--install --strict` — то же самое, но hook запускает `--strict`, так что warning тоже блокируют гейт.
- `--diff <ref>` — добавленные строки файлов, отслеживаемых в репо, относительно ref; неотслеживаемые файлы не видны.
- `--strict` — warning тоже блокируют гейт (exit 1).
- `--format <text|json|sarif>` — машиночитаемый вывод вместо текста: json = rdjson (reviewdog), sarif = 2.1.0 (code scanning); exit-коды от формата не зависят, итоговая строка `slop-gate:` печатается только в text.
- Конфиг `.stop-ai-slop.yaml` в корне репо — override severity правил (`off`/`warning`/`error`), `maxCommentLength`, `excludePaths`; читается режимами scan/--staged/--diff, write-time плагин работает с дефолтами.
- `--explain <rule-id>` — полное обоснование правила (Why / Instead of / Write / Ignore it when).
- `--mcp` — MCP-сервер по stdio (JSON-RPC 2.0): три инструмента `slop_scan` / `slop_explain` / `slop_baseline`; согласование версий протокола `2024-11-05` / `2025-11-25` / `2026-07-28`.
- `--pre-tool` — PreToolUse-хук Claude Code: читает stdin JSON `{tool_name, tool_input}`, сканирует предлагаемый дельта-контент (`Write` content или `Edit` new_string минус old_string), при error-находках выводит их в stderr и exit 2 — блокирует запись до исправления.
- `--help` — справка по всем режимам и флагам.

Директивы подавления: `// stop-ai-slop-ignore-next-line [rule-id]`, `// stop-ai-slop-ignore-line [rule-id]`, `// stop-ai-slop-ignore-file` (после `--` — причина). Синтаксис комментариев берётся из профиля языка (160 расширений и 26 имён файлов; см. таблицу профилей в README): `#` — комментарий в py/sh/yaml, но препроцессор в C и атрибут в Rust; детектор видит inline-комментарии после кода, блоковые комментарии без маркера на средних строках, doc-блоки, UTF-16 с BOM; zero-width символы игнорируются при матчинге.

## Вывод

```
<relpath>:<line> <rule-id> [<severity>] <сообщение>
  instead: <что написать вместо>
```

Коды выхода: 0 — чисто; 1 — сработал гейт (error-находки вне baseline; warnings — при `--strict`); 2 — ошибка использования или git (неверный флаг, несуществующий ref).
