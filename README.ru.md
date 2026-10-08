# stop-ai-slop

[English](README.md) | **Русский**

[![npm version](https://img.shields.io/npm/v/stop-ai-slop)](https://www.npmjs.com/package/stop-ai-slop)
[![license](https://img.shields.io/github/license/WhiteBite/stop-ai-slop)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![zero-deps](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

> **stop-ai-slop — линтер и гейт комментариев с нулевыми зависимостями, который блокирует AI-слоп в комментариях до попадания в кодовую базу.** Один сканер (`skill/scripts/scan.mjs`, таблица `RULES`) — единый источник правды для политики «комментарий — одна строка и только why». Гейт применяется в момент записи (плагин OpenCode, PreToolUse-хук Claude Code), на коммите (pre-commit hook, ставится через `--install`) и в CI (GitHub Action, шаблон GitLab CI), а также работает как MCP-сервер. Node >= 18, нулевые npm-зависимости, лицензия MIT, работает на Windows, Linux и macOS.

AI-агенты перекомментируют: многострочные нарративы, `// было X, стало Y`, «Step 1 / Step 2», баннеры-разделители, markdown внутри комментариев, `TODO` без тикета, комментарии-пересказы строки под ними, гниющие указатели `file.py:123`, невидимые zero-width и BiDi-символы. stop-ai-slop ловит всё это детерминированно — без LLM, без скоринга, без сети — и блокирует правку или коммит.

## Установка в две команды

```
npm i -D stop-ai-slop
npx stop-ai-slop --install        # пишет pre-commit hook + npm scripts в текущее репо
```

`--install` — единственная команда, которая меняет ваше репо: дописывает блок с маркером в `.git/hooks/pre-commit` (идемпотентно, чужой хук не затирает) и добавляет npm-скрипты `stop-ai-slop` / `stop-ai-slop:all`. Хук вшивает абсолютный путь к сканеру на момент установки — после переноса или ре-клона сканера запустите `--install` снова.

### Homebrew

```
brew tap WhiteBite/stop-ai-slop https://github.com/WhiteBite/stop-ai-slop
brew install WhiteBite/stop-ai-slop/stop-ai-slop
```

Формула оборачивает npm-пакет (этот репозиторий — собственный tap: формула лежит в `Formula/stop-ai-slop.rb`) и подтягивает `node` из Homebrew, который удовлетворяет требованию Node >= 18.

## Кому это нужно

Команды и одиночные разработчики, чей код частично или в основном пишут AI-агенты (OpenCode, Claude Code, Cursor, Codex, Copilot, Gemini CLI), и которым политика комментариев нужна механически — в момент записи, на коммите, в CI, — а не на дисциплине ревью.

## Зачем stop-ai-slop

- **Нулевые зависимости.** Рантайм — один файл-сканер `.mjs` (self-test живёт отдельным модулем `selftest.mjs`, чтобы поставляемый гейт оставался тощим), плагин OpenCode — один файл `.ts`. Не нужно ставить ни biome, ruff, oxlint, ни Python, ни ripgrep.
- **Блокирует в момент правки, а не после.** Плагин OpenCode отклоняет `write`/`edit`/`multiedit`; PreToolUse-хук Claude Code запрещает `Write`/`Edit` до их выполнения. Большинство аналогов сканируют только постфактум или просят модель саму прогнать grep.
- **Мультиязычная детекция естественного языка.** Changelog-маркеры, нумерованные шаги и открывашки «This function…» матчатся на RU + EN + DE + FR + ES. Детерминированные конкуренты — только английский; LLM-основанные читают любой язык, но требуют API-ключ.
- **Один источник правды.** Все правила живут в одной таблице `RULES`; `--explain <rule-id>` печатает обоснование каждого правила (Why / Instead of / Write / Ignore it when).
- **Машиночитаемый вывод.** `text` (по умолчанию), Reviewdog `rdjson` и SARIF 2.1.0 для GitHub code scanning.
- **Дружелюбен к легаси.** Baseline амнистирует существующие находки, и гейт срабатывает только на новый слоп.
- **Широкая поверхность применения.** OpenCode, Claude Code, Cursor, Codex, GitHub Actions, GitLab CI, MCP, VS Code, IntelliJ IDEA.

## Что входит и что ставится автоматически

Один сканер (`skill/scripts/scan.mjs`, таблица `RULES`) представлен одиннадцатью точками приложения. Они независимы: включайте нужные, они не конфликтуют и применяют одни и те же правила.

| Точка | Что делает | Как попадает к вам |
| --- | --- | --- |
| CLI (bin `stop-ai-slop`) | сканирует файлы, staged-изменения или дифф; `--explain`, `--audit`, baseline | автоматически с `npm i -D stop-ai-slop` |
| pre-commit hook + npm scripts | блокирует каждый коммит с новым слопом | автоматически: `npx stop-ai-slop --install` |
| Write-time плагин OpenCode | отклоняет `write`/`edit`/`multiedit` в момент записи | вручную: файл-стаб из одной строки (ниже) |
| Плагин Claude Code | скилл + PreToolUse-хук (блокирует `Write`/`Edit`) + PostToolUse-хук (возвращает находки в сессию) | автоматически: `/plugin marketplace add` + `/plugin install` |
| Agent skill (`skill/SKILL.md`) | даёт политику и команды любому агенту | автоматически с плагином Claude Code; вручную junction/симлинк для OpenCode |
| MCP-сервер (`--mcp`) | pull-mode `slop_scan` / `slop_explain` / `slop_baseline` для любого MCP-клиента | вручную: одна запись в конфиге клиента |
| GitHub Action / GitLab CI-шаблон | блокирует PR/MR-пайплайны на диффе | вручную: сниппет воркфлоу/CI |
| VS Code task / IDEA File Watcher | скан по требованию или при сохранении в IDE | вручную: сниппет/импорт шаблона |
| `--install-hooks` | пишет конфиги хуков агентов (`.codex/hooks.json`, `.github/hooks/stop-ai-slop.json`, `.devin/hooks.v1.json`) + печатает сниппеты настроек для Gemini CLI / Qwen Code; shape-gating для неизвестных имён инструментов | вручную: `npx stop-ai-slop --install-hooks` |
| `--install-rules` | генерирует файлы инструкций агентов из таблицы RULES (`.cursor/rules/stop-ai-slop.mdc`, `.windsurfrules`, `CONVENTIONS.md`, `.clinerules`, `.devin/rules/stop-ai-slop.md`, отмеченный блок в `.github/copilot-instructions.md`) | вручную: `npx stop-ai-slop --install-rules` |
| Конфиг JSON Schema (`schema/stop-ai-slop.schema.json`) | draft-07 схема для `.stop-ai-slop.yaml` с автоподстановкой в IDE и проверкой паритета | поставляется в npm-тарболе; modeline в начале конфига |

### Ничего не происходит тихо

У `npm i -D stop-ai-slop` нет postinstall-скрипта: пакет просто ложится в `node_modules`. Ни hook, ни конфиги редакторов и агентов не трогаются, пока вы сами не запустите `--install` или не добавите один из сниппетов ниже.

### Какие точки выбрать

- **Только git** — две команды выше; готово.
- **Пользователи OpenCode** — добавьте стаб плагина, чтобы слоп отклонялся в момент записи: файл `~/.config/opencode/plugins/comment-gate.ts` из одной строки `export { default } from "<путь к node_modules>/stop-ai-slop/plugin/comment-gate.ts"` (OpenCode 1.18.29+ и 2.x; на более старых 1.x используйте `export { CommentGate } from ...` вместо этого).
- **Пользователи Claude Code** — `/plugin marketplace add WhiteBite/stop-ai-slop`, затем `/plugin install stop-ai-slop`; скилл и оба хука приходят автоматически.
- **Любой MCP-клиент (Cursor, Codex и др.)** — stdio-запись `npx stop-ai-slop --mcp` (см. «MCP-сервер»).
- **CI** — GitHub Action или GitLab include (см. «IDE и CI»).
- **Пользователи Codex CLI / VS Code Copilot / Devin** — `npx stop-ai-slop --install-hooks` пишет `.codex/hooks.json`, `.github/hooks/stop-ai-slop.json`, `.devin/hooks.v1.json`; shape-gating делает безопасным для неизвестных имён инструментов.
- **Пользователи Cursor / Windsurf / Cline / Aider** — `npx stop-ai-slop --install-rules` генерирует файлы инструкций из таблицы RULES; см. «Хук-интеграции с агентами».
- **Gemini CLI / Qwen Code** — `--install-hooks` печатает готовые сниппеты настроек в `.gemini/settings.json` и `.qwen/settings.json`.

## Что и зачем

Политика: комментарий — максимум одна строка и только неочевидное внешнее ограничение, инвариант или воркэраунд. Пересказ диффа живёт в сообщении коммита, why теста — в имени теста. Таблица правил и детектор живут в `skill/scripts/scan.mjs` (const `RULES`) — править правила надо там, всё остальное только применяет их.

Error-правила блокируют (exit 1, write-time gate бросает ошибку). Warning — учитель: выводится, не блокирует.

## Точки приложения

1. **OpenCode write-time плагин** — `plugin/comment-gate.ts` перехватывает `write`/`edit`/`multiedit` и отклоняет правку с error-находками в момент записи, применяя `.stop-ai-slop.yaml` git-корня редактируемого файла (корень берётся из файла, не из `process.cwd()` — cwd хоста OpenCode часто другой репозиторий). Монтируется в `~/.config/opencode/plugins/` стабом-реэкспортом. Default-экспорт `{ id: "stop-ai-slop", server: CommentGate, setup }` обслуживает оба API: OpenCode 1.18.29+ вызывает `server()` (v1-хук `tool.execute.before`), OpenCode 2.x вызывает `setup()` (регистрирует `ctx.tool.hook("execute.before")`, единственный хук V2, которому разрешено падать); legacy-экспорт `CommentGate` сохраняет работоспособность старых стабов на более старых 1.x; OpenCode показывает локальные плагины по имени файла стаба — назовите стаб `stop-ai-slop.ts` вместо `comment-gate.ts`, если хотите такую метку.
2. **Pre-commit через `--install`** — одна команда вшивает `node .../scan.mjs --staged` в `.git/hooks/pre-commit` (идемпотентно, дописывает блок с маркером, не затирая существующий hook) и добавляет npm scripts `stop-ai-slop` / `stop-ai-slop:all` в package.json. Hook и npm scripts содержат абсолютный путь к сканеру на момент установки — после переноса или повторного клонирования сканера запустите `--install` заново.
3. **Agent skill** — `skill/SKILL.md` (name: `stop-ai-slop`): политика, таблица правил, режимы запуска. Монтируется в OpenCode и Claude Code.
4. **Baseline для легаси** — 1) `--install`, 2) `--baseline-write` (записывает текущие находки), 3) закоммитить baseline, 4) дальше гейт видит только новое. Baseline v2 хранит каждую находку парой строк — `relpath:line` плюс `fp:<hash>`, fingerprint — SHA-256-хэш (первые 16 hex-символов) от id правила и обрезанного текста комментария — и матчится по fingerprint, а не по позиции: правки выше baselined-строки больше не воскрешают легаси, а изменённый текст всплывает как новый слоп. Тот же текст, вставленный заново, маскируется только до числа baselined-вхождений — свежая копия легаси-слопа всё равно считается новой. Старые v1-baseline (только `relpath:line`) маскируют по позиции до следующего `--baseline-write`. `--baseline-prune` удаляет записи без живых находок (в v2 пара умирает вместе); повторный `--baseline-write` амнистирует и новый слоп — не делать.

## Быстрый старт

```
git clone https://github.com/WhiteBite/stop-ai-slop && cd stop-ai-slop
node skill/scripts/scan.mjs --self-test       # саботаж-тест детектора
node skill/scripts/scan.mjs scan .            # полное сканирование всех поддерживаемых языков (см. «Языковые профили»)
node skill/scripts/scan.mjs --staged          # только добавленные строки из git diff --cached
node skill/scripts/scan.mjs --diff <ref>      # добавленные строки файлов, отслеживаемых в репо, относительно ref; неотслеживаемые файлы не видны
node skill/scripts/scan.mjs --fix --dry-run   # превью механических правок unified-диффом, ничего не меняя
node skill/scripts/scan.mjs --fix             # применить механические правки, затем рескан и отчёт об остатке
node skill/scripts/scan.mjs --strict          # warning тоже блокируют гейт (exit 1)
node skill/scripts/scan.mjs --install         # npm scripts + pre-commit hook в текущем репо
node skill/scripts/scan.mjs --install --strict  # то же самое, но hook запускает --strict
node skill/scripts/scan.mjs --install-hooks     # написать конфиги хуков агентов (Codex CLI, VS Code Copilot local hooks, Devin CLI) + напечатать сниппеты настроек для Gemini CLI / Qwen Code
node skill/scripts/scan.mjs --install-rules     # сгенерировать файлы инструкций агентов из таблицы RULES (.cursor/rules/.windsurfrules/CONVENTIONS.md/.clinerules/.devin/rules/, отмеченный блок в .github/copilot-instructions.md)
node skill/scripts/scan.mjs --baseline-write    # записать текущие находки в baseline
node skill/scripts/scan.mjs --baseline-prune    # удалить из baseline записи без живых находок
node skill/scripts/scan.mjs --doctor            # диагностика окружения: node, git, путь сканера в pre-commit hook, конфиг, baseline
node skill/scripts/scan.mjs --help              # справка по всем флагам
```

Директивы подавления: `// stop-ai-slop-ignore-next-line [rule-id]` (следующая строка), `// stop-ai-slop-ignore-line [rule-id]` (текущая строка), `// stop-ai-slop-ignore-file` (весь файл); после `--` — причина. Директивы чтятся только в реальных сегментах комментария — тот же текст внутри строкового литерала ничего не подавляет.

Exit 1 — есть error-находки вне baseline; иначе 0. Exit 2 — ошибка использования или git (неверный флаг, несуществующий ref).

## Форматы вывода

По умолчанию — человекочитаемый текст с итоговой строкой `slop-gate: …`. Флаг `--format <text|json|sarif>` (режимы `scan`, `--staged`, `--diff`) переключает stdout на машиночитаемый формат: печатается только JSON, итоговая строка не выводится. Коды выхода от формата не зависят — по-прежнему 0/1/2.

`--format json` — Reviewdog RDFormat: один JSON-объект в одну строку (pipe-friendly), `diagnostics` отсортированы по пути и строке, пустой результат — `diagnostics: []`:

```
npx stop-ai-slop --diff origin/main --format json | reviewdog -f=rdjson -reporter=github-pr-review
```

`--format sarif` — SARIF 2.1.0 с отступом в два пробела; массив `rules` перечисляет все правила независимо от находок, `results` — только реальные находки. Загрузка в GitHub code scanning:

```yaml
- run: npx stop-ai-slop --diff origin/${{ github.base_ref }} --format sarif > results.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

## Язык вывода

По умолчанию сообщения русские; `--lang en` переключает на английский находки, `--explain`, `--help`, ошибки, `--fix`, bench и аудит. Без флага язык определяется автоматически: `STOP_AI_SLOP_LANG` > `LC_ALL`/`LANG` (всё, что не начинается с `ru`, выбирает английский; не задано — русский). Id правил и лейбл `instead:` английские в обоих языках. Вывод `--install`/`--install-hooks`/`--install-rules` и текст сгенерированных хуков в этой версии остаётся русским.

## Автофикс (`--fix`)

`--fix` применяет детерминированные механические правки одним проходом по всей области сканирования — без агента, без LLM, без переписывания каждой находки. Сначала превью, затем применение:

```
node skill/scripts/scan.mjs --fix --dry-run   # напечатать unified-дифф всех планируемых правок, ничего не меняя
node skill/scripts/scan.mjs --fix             # записать правки, затем рескан и отчёт об остатке
```

`--dry-run` ничего не пишет: печатает пофайловый unified-дифф (контекст 2) и итог `запланировано N правок в M файлах; не чинится автоматически: K`, exit 0. Режим применения записывает файлы, затем сканирует заново и печатает выжившие находки через обычный текстовый конвейер (exit 1, если error-находка осталась вне baseline, — поэтому `--fix` встраивается в CI). `--strict` дополнительно считает провалом выжившие warning. Фиксер идемпотентен: повторный `--fix` — no-op.

**Чинится механически** (удаление или сжатие на месте — «удалить» всегда приемлемый исход по политике):

| Правило | Фикс |
| --- | --- |
| `multi-line-comment`, `vend/file-summary-header` | удалить весь comment-run |
| `vend/section-divider` | удалить строку-разделитель (или снять её с inline-комментария) |
| `changelog-marker`, `vend/cross-file-ref`, `vend/obvious-comment` | удалить полнострочный комментарий; снять trailing-комментарий со строки кода |
| `vend/step-numbered` | снять префикс «Step N:», остальной текст оставить (полнострочные и trailing inline-комментарии) |
| `vend/zero-width-chars`, `vend/bidi-controls` | вырезать реальные невидимые/BiDi-символы |

**Не чинится автоматически** — нужна голова или агент, чтобы написать замену, поэтому `--fix` их оставляет и выводит в отчёт: `long-comment` (сжать смысл), `vend/this-function-opener` (переформулировать как инвариант), `vend/generic-todo` (добавить тикет), `vend/markdown-in-comment` (семантика), `vend/cjk-noise` (переписать идентификатор).

Предохранители: открытие блок-комментария никогда не удаляется в середине блока (уходят только целые раны); реальный невидимый символ вырезается, но его backslash-escape форма в исходнике (литерал BOM-теста) остаётся — это предмет кода, а не слоп; легальная emoji-ZWJ последовательность и ведущий BOM сохраняются; директива `stop-ai-slop-ignore-next-line` удаляется вместе со своим кодом только когда целевая строка сама удалена, чтобы директива не повисла; suppression-директивы и покрытые ими находки не трогаются. Сгенерированные, бинарные и gitignored-файлы пропускаются ровно как при сканировании.

Для массовой семантической чистки (не-механические правила) рекомендуемый поток: сначала `--fix`, чтобы расчистить механическое большинство, затем проход агента по остатку отчёта — или `--baseline-write`, чтобы амнистировать то, что команда решает оставить.

## Конфиг

Необязательный файл `.stop-ai-slop.yaml` в корне репозитория (там же, где baseline: корень git, а вне репо — каталог сканирования). Читается режимами `scan`, `--staged`, `--diff` и write-time плагином OpenCode, который резолвит его из git-корня редактируемого файла (вне репо — из каталога файла). Парсер — zero-dep подмножество YAML: скаляры `ключ: значение`, списки через `- `, секция `rules:` с двухпробельным отступом, список `overrides:` из записей `{paths, rules}`, `#`-комментарии и пустые строки пропускаются, значения могут быть в кавычках. Неизвестные ключи игнорируются; недопустимое severity — exit 2 с именем файла и номером строки.

| Ключ | Семантика |
| --- | --- |
| `maxCommentLength` | порог длины строки комментария для `long-comment` (по умолчанию 120) |
| `excludePaths` | список относительных путей-префиксов: путь исключается, если равен записи или начинается с `entry/`; работает в полном скане и в diff-режимах |
| `generatedPaths` | список относительных путей-префиксов, считаемых сгенерированными (та же префиксная семантика, что у `excludePaths`); см. [Сгенерированный код](#сгенерированный-код) |
| `scanGenerated` | `true` отключает эксемпт сгенерированных файлов — они линтуются как обычные |
| `rules` | override severity по id правила: `error`, `warning` или `off` (правило отключено) |
| `overrides` | пер-path переопределения severity, запись `{paths: [шаблоны], rules: {rule-id: severity}}`; шаблон без `*` — префикс пути (семантика `excludePaths`), `*` матчит любые символы кроме `/`, `**` — включая `/`; для матчащего файла побеждает последняя матчащая запись, оверрайд бьёт глобальную секцию `rules` |
| `ticketPattern` | regex-источник, включающий `vend/ticket-ref` (например `'\bKRY-\d+\b'`); без ключа правило неактивно — флагается тикет-ссылка в комментарии без TODO, а TODO-строки, ссылки на трекер и CVE-/GHSA- advisory не флагаются |

```yaml
maxCommentLength: 100
excludePaths:
  - generated
  - docs/api.md
rules:
  multi-line-comment: off
  vend/step-numbered: error
overrides:
  - paths:
      - "*.yaml"
      - ".github/**/*.yml"
    rules:
      multi-line-comment: warning
```

Remap severity применяется после детекции и до фильтрации baseline и подсчёта exit-кода; пер-path `overrides` применяются поверх глобальной секции `rules` — для матчащего файла побеждает последняя матчащая запись, `off` снимает находку. Baseline матчится по `rel:line` независимо от severity, поэтому смена severity в конфиге не воскрешает и не маскирует baselined-находки.

### Schema JSON конфигурации

`schema/stop-ai-slop.schema.json` (draft-07, поставляется в npm-тарболе). Modeline в начале `.stop-ai-slop.yaml`:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/WhiteBite/stop-ai-slop/v0.13.0/schema/stop-ai-slop.schema.json
```

(или путь node_modules `./node_modules/stop-ai-slop/schema/stop-ai-slop.schema.json`). Паритет с парсером обеспечивается гейтом self-test (`schema-parity-config` / `schema-parity-rules`).

## MCP-сервер

Флаг `--mcp` запускает stop-ai-slop как MCP-сервер по stdio (JSON-RPC 2.0). Это pull-mode: любой MCP-клиент вызывает сканер сам перед редактированием файла.

```
npx stop-ai-slop --mcp
```

Сервер поддерживает протоколы `2024-11-05`, `2025-11-25`, `2026-07-28` — версия согласуется на `initialize`. stdout несёт только сообщения протокола, логи пишутся в stderr.

Три инструмента:

| Инструмент | Аргументы | Описание |
| --- | --- | --- |
| `slop_scan` | `{ path?: string }` | Полное сканирование директории или файла; возвращает текстовые находки |
| `slop_explain` | `{ ruleId: string }` | Возвращает обоснование правила (Why / Instead of / Write / Ignore it when) |
| `slop_baseline` | `{}` | Выводит записи baseline (`relpath:line` и `fp:<hash>`) |

Настройка клиента:

**Claude Code** (`.mcp.json`):

```json
{
  "mcpServers": {
    "stop-ai-slop": {
      "command": "npx",
      "args": ["stop-ai-slop", "--mcp"]
    }
  }
}
```

**OpenCode / Cursor** (stdio-запись в конфигурации):

```json
{
  "mcpServers": {
    "stop-ai-slop": {
      "command": "npx",
      "args": ["stop-ai-slop", "--mcp"]
    }
  }
}
```

## Блокировка до записи (Claude Code)

Флаг `--pre-tool` читает из stdin JSON-пейлоад PreToolUse (`{ tool_name, tool_input }`), сканирует предлагаемый дельта-контент (содержимое `Write` или разница `Edit` — `new_string` минус `old_string`), и при наличии error-находок выводит их в stderr и завершается с кодом 2 — Claude Code отменяет вызов инструмента и показывает причину модели. Чистый пейлоад завершается с кодом 0 без вывода.

Плагин уже содержит хук (`.claude-plugin/stop-ai-slop/hooks/hooks.json`, matcher `Write|Edit`), так что установка через marketplace получает его автоматически. Для ручной настройки добавьте в `.claude/settings.json`:

```json
{
  "hooks": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "node \"<путь к репо>/skill/scripts/scan.mjs\" --pre-tool"
        }
      ]
    }
  ]
}
```

Альтернативная форма принятия решений через `hookSpecificOutput.permissionDecision` (deny) существует, но данный хук использует exit 2 + stderr для многострочного вывода находок.

Плагин также несёт SessionStart-хук (без matcher — startup, resume и clear), запускающий `scan.mjs --policy`: он заранее печатает в контекст сессии политику однострочного комментария и сводку правил, поэтому большинство правок вообще не задевают гейт.

Для агентского ремонта режимы `scan`, `--staged`, `--diff` и `--stdin-path` принимают `--fix-suggestions`: после обычного вывода сканер печатает одну дополнительную строку `fix-suggestions: <однострочный JSON-массив>` с точными правками, которые применил бы `--fix`, — одна запись `{"file","line","rule","kind","from","to"}` на каждую механически чинимую находку (`kind` — `delete-line`, `replace-line` или `delete-run`; находки, требующие ручной переписки вроде `long-comment`, записи не получают). С `--format json` или `--format sarif` строка уходит в stderr, чтобы stdout оставался машиночитаемым.

```
fix-suggestions: [{"file":"src/a.ts","line":3,"rule":"changelog-marker","kind":"delete-line","from":"// this fixes the cache miss","to":null}]
```

## Хук-интеграции с агентами

### Обобщение `--pre-tool`

Помимо `Write`/`Edit`/`MultiEdit` Claude Code, `--pre-tool` теперь понимает:

- **Gemini CLI / Qwen Code** — инструменты `write_file`{file_path,content} и `replace`{file_path,old_string,new_string}.
- **OpenAI Codex CLI** — `apply_patch`: в `tool_input.command` содержится V4A-патч (`*** Begin Patch` / `*** Add File:` / `*** Update File:` / `*** Move to:` / `*** Delete File:` / `*** End Patch`, `+lines` = добавленный контент); мультифайловые патчи сканируются по файлам.
- **UNKNOWN tool names** — gating по SHAPE: пейлоад с `file_path`+`content`, или `file_path`+`old_string`+`new_string`, или `file_path`+`edits[]`, или текст патча, содержащий `*** Begin Patch`. Это покрывает VS Code Copilot local hooks (Preview feature) и Devin CLI, чьи имена инструментов не являются стабильным API. Имена инструментов только для чтения (содержащие `read`/`view`/`grep`/`search`/`glob`/`list`/`ls`/`bash`/`shell`/`exec`/`run`/`fetch`/`web`/`think`/`todo`/`plan`) никогда не блокируют.

### `--install-hooks`

Пишет конфиги хуков агентов, вызывающие `node <abs>/scan.mjs --pre-tool`:

- **`.codex/hooks.json`** — Codex CLI, конверт в стиле Claude; matcher `Write|Edit|MultiEdit|write_file|replace|apply_patch`; объединяется с существующими записями, никогда не затирает чужие хуки; сломанный JSON пропускается с предупреждением.
- **`.github/hooks/stop-ai-slop.json`** — VS Code Copilot local hooks (Preview feature); свой файл перезаписывается каждый раз; без matcher в этом формате — shape-gating держит безопасность; timeout 30s.
- **`.devin/hooks.v1.json`** — Devin CLI, без matcher → все инструменты → shape-gating. Идемпотентно; обновляет встроенный путь к сканеру на месте.

Печатает готовые для вставки сниппеты для Gemini CLI (`.gemini/settings.json`, `hooks.BeforeTool`, matcher `write_file|replace`, timeout ms) и Qwen Code (`.qwen/settings.json`, `hooks.PreToolUse`) — `settings.json` глобален для пользователя, поэтому автоматически не редактируется.

### `--install-rules`

Генерирует файлы инструкций агентов из таблицы RULES (единый источник правды):

- **`.cursor/rules/stop-ai-slop.mdc`** — Cursor; frontmatter `description`/`globs`/`alwaysApply`.
- **`.windsurfrules`** — Windsurf.
- **`CONVENTIONS.md`** — Aider; пара с `--read CONVENTIONS.md`.
- **`.clinerules`** — Cline.
- **`.devin/rules/stop-ai-slop.md`** — Devin.
- **Отмеченный блок внутри `.github/copilot-instructions.md`** — VS Code Copilot; чужой контент сохраняется, блок заменяется на месте.

Файлы, принадлежащие нам, перезаписываются; файлы с общими именами БЕЗ нашего маркера первой строки никогда не затираются (пропускаются с предупреждением). Сгенерированные файлы проходят наш собственный сканер.

### Сводка покрытия инструментов

| Агент | Интеграция |
| --- | --- |
| Claude Code | PreToolUse exit 2 (см. «Блокировка до записи») |
| Codex CLI | `.codex/hooks.json` (matcher `write_file|replace|apply_patch`) |
| VS Code Copilot | Local hooks (Preview), `.github/hooks/stop-ai-slop.json` |
| Devin CLI | `.devin/hooks.v1.json` (также автоматически читает `.claude/` хуки) |
| Gemini CLI / Qwen Code | Печатные сниппеты настроек (`.gemini/settings.json` / `.qwen/settings.json`) |
| OpenCode | Write-time плагин (см. «Точки приложения») |
| Cursor / Windsurf / Cline / Roo / Aider / Goose / OpenHands / Codex / Copilot | AGENTS.md или их файлы правил → `--install-rules` + наш скилл совместимый с AGENTS.md покрывает их |
| MCP-клиенты (Cursor, Zed, JetBrains AI, Cody, …) | Существующий `--mcp` |

## IDE и CI

### VS Code

Основной путь — расширение из `editors/vscode/`: скопируйте или слинкуйте этот каталог в `~/.vscode/extensions/whitebite.stop-ai-slop-0.1.0/`, перезагрузите окно и задайте `stopAiSlop.command` — вызов сканера (по умолчанию `npx stop-ai-slop`). Находки попадают в панель Problems при сохранении и по командам `stop-ai-slop: Scan the current file` / `Scan the workspace`; подробности в `editors/vscode/README.md`.

Альтернатива без установки — задача `tasks.json` с problem matcher для подсветки находок в панели Problems:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "stop-ai-slop scan",
      "type": "shell",
      "command": "npx stop-ai-slop scan",
      "problemMatcher": {
        "owner": "external",
        "source": "stop-ai-slop",
        "severity": "error",
        "fileLocation": ["relative", "${workspaceFolder}"],
        "pattern": {
          "regexp": "^(.+):(\\d+)\\s+(\\S+)\\s+\\[(error|warning)\\]\\s+(.+)$",
          "file": 1,
          "line": 2,
          "code": 3,
          "severity": 4,
          "message": 5
        }
      },
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    }
  ]
}
```

Однострочный pattern: вложенные `instead:` строки просто не матчатся. Запускать через терминал или привязать к хоткею.

### GitLab CI

Шаблон `templates/stop-ai-slop.gitlab-ci.yml` блокирует MR-пайплайны на диффе (exit code); code quality-репорт не поставляется. Подключить:

```yaml
include:
  - project: 'WhiteBite/stop-ai-slop'
    file: '/templates/stop-ai-slop.gitlab-ci.yml'
    ref: <tag>
```

### Bitbucket Pipelines

```yaml
pipelines:
  pull-requests:
    "**":
      - step:
          image: node:20
          script:
            - npx stop-ai-slop --diff origin/$BITBUCKET_PR_DESTINATION_BRANCH
```

## CI (GitHub Actions)

```yaml
on: pull_request:
  jobs:
    slop:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: WhiteBite/stop-ai-slop@main
          with:
            base: ${{ github.base_ref }}
```

Action сам подтягивает базовый реф, поэтому стандартного shallow checkout достаточно; `strict: "true"` включает режим warnings-as-errors; `format: "json"` или `format: "sarif"` переключает вывод action на машиночитаемый формат (см. «Форматы вывода»). На push-событиях action не работает (нет `github.base_ref`) — используйте `pull_request` или передавайте base явно. Вход `annotations` (по умолчанию `"true"`) добавляет `--annotations` к скану в text-формате: каждая находка дополнительно печатается workflow-командой GitHub Actions (`::error file=<rel>,line=<n>::…` / `::warning …`) и подсвечивается прямо в диффе PR; при `format: "json"` или `"sarif"` флаг ничего не меняет.

## Релизы в npm

Бутстрап, один раз: первая публикация нового пакета требует интерактивное подтверждение — `npm publish` в терминале: npm либо запросит OTP (если 2FA включена), либо предложит browser-approve («Authenticate your account at …»), которого достаточно без OTP и без 2FA; третий путь — granular-токен с bypass-2FA в `~/.npmrc`. Сразу после неё: npmjs.com → Settings пакета → Trusted publishing → добавить `WhiteBite/stop-ai-slop` и workflow `publish.yml`; если эта форма потребует включить 2FA — это единственное место, где она обязательна для полностью автоматических тегов.

Дальше деплой идёт по тегам: bump версии в `package.json` + запись в CHANGELOG, коммит, `git tag vX.Y.Z && git push origin main --tags`. Воркфлоу `.github/workflows/publish.yml` (триггер `push: tags: v*`) прогоняет self-test, пропускает публикацию, если эта версия уже в реестре (порядок прилёта тегов не важен), и публикует через OIDC с provenance. Node 24 в воркфлоу обязателен: OIDC-публикация требует npm CLI ≥ 11.5.1. После релиза обновите `Formula/stop-ai-slop.rb`: `url` на tarball новой версии и пересчитанный `sha256` — хэш tarball меняется с каждой версией.

Тот же воркфлоу создаёт GitHub Release для тега (ноты берутся из соответствующей секции `CHANGELOG.md`, пропускается, если release уже существует) и зеркалирует пакет в GitHub Packages как `@whitebite/stop-ai-slop` (npm-реестр GitHub принимает только scoped-имена; зеркало пропускается, если эта версия уже там). Потребители зеркала настраивают реестр по скоупу:

```
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
@whitebite:registry=https://npm.pkg.github.com
```

## Монтаж на другую машину

```
git clone https://github.com/WhiteBite/stop-ai-slop <path>
New-Item -ItemType Junction -Path "$env:USERPROFILE\.config\opencode\skills\stop-ai-slop" -Target "<path>\skill"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\stop-ai-slop" -Target "<path>\skill"
```

Write-time плагин OpenCode: файл `%USERPROFILE%\.config\opencode\plugins\comment-gate.ts` из одной строки
`export { default } from "<path>/plugin/comment-gate.ts"`. Стаб с default-экспортом требует OpenCode 1.18.29 или новее (включая 2.x); на более старых релизах 1.x используйте legacy-стаб из одной строки `export { CommentGate } from "<path>/plugin/comment-gate.ts"`.
Эквивалент для cmd.exe — `mklink /J`; на Linux/macOS — `ln -s`. В любом git-репо без агентов работает `scan.mjs --install`.

## Другие интеграции

### pre-commit framework
```yaml
repos:
  - repo: https://github.com/WhiteBite/stop-ai-slop
    rev: v0.13.0
    hooks:
      - id: stop-ai-slop
```

Хук запускает `--staged` при каждом коммите.

### Claude Code / Cursor / Codex

Репозиторий — готовый marketplace плагинов Claude Code:

```
/plugin marketplace add WhiteBite/stop-ai-slop
/plugin install stop-ai-slop
```

Плагин несёт скилл и PostToolUse-хук (`Write|Edit` → `scan.mjs --stdin-path`), который печатает находки по только что записанному файлу обратно в сессию. Для Codex CLI запустите `npx stop-ai-slop --install-hooks`, чтобы записать `.codex/hooks.json` (см. «Хук-интеграции с агентами»), вместо ручного копирования хука Claude. У Cursor пока нет публичной поверхности write-time хуков — используйте `npx stop-ai-slop --install-rules`, чтобы добавить политику в `.cursor/rules/`.

## IntelliJ IDEA

### File Watchers (Ultimate)

Шаблон `idea/filewatchers/stop-ai-slop.xml` — готовый импорт через Settings → Tools → File Watchers → + → Import. После импорта заменить `<path-to-scan.mjs>` на абсолютный путь к `skill/scripts/scan.mjs` на вашей машине. Шаблон настроен на частые типы (Kotlin, Java, TypeScript, JavaScript, Python, YAML); остальные профили сканера покрываются External Tools или CLI `scan`. Запуск по каждому изменению файла; исключения из сканирования — стандартные каталоги артефактов (`venv`, `node_modules`, `.git`, `build`, `target`, `.next`, `out`, `Pods`, `site-packages`, `.dart_tool`, `.gradle`).

Находки появляются в окне Run с кликабельными путями, потому что формат вывода сканера — `file:line`.

### Actions on Save (все редакции IDEA 2024+)

Встроенная поддержка внешних команд отсутствует. Два рабочих варианта:

1. **External Tools** (Settings → Tools → External Tools → +): program = `node`, arguments = `<path>/scan.mjs scan $FilePath$`, working directory = `$FileDir$`. Триггер — вручную или через плагин [Save Actions](https://plugins.jetbrains.com/plugin/7668-save-actions).
2. **File Watcher** (см. выше) — единственный вариант on-save без сторонних плагинов; доступен только в Ultimate.

## Отладка

Плагин OpenCode пишет каждое решение гейта в JSONL-лог (`~/.config/opencode/logs/comment-gate.jsonl`, путь переопределяется переменной `STOP_AI_SLOP_LOG`): события `loaded`, `blocked` и `passed` с инструментом, файлом и правилами. Смотреть:

```
node skill/scripts/scan.mjs --audit        # счётчики + последние 20 записей
node skill/scripts/scan.mjs --audit 50     # последние 50
```

`node skill/scripts/scan.mjs --doctor` проверяет окружение одним проходом — версию node, git в PATH, pre-commit hook и зашитый в него путь сканера (кейс переноса сканера выше), npm scripts, валидность `.stop-ai-slop.yaml`, baseline и стаб плагина OpenCode — и выходит с 1, называя сломанное; строки с `!` информационные и никогда не роняют гейт.

Плагин загружается процессом OpenCode на старте сессии: после правок `plugin/comment-gate.ts` перезапустите OpenCode, иначе работает старая версия (аудит-лог это сразу покажет отсутствием новых записей).

## Языковые профили

Синтаксис комментариев берётся из профиля языка, а не из общего списка: `#` — комментарий в `.py/.sh/.yaml`, но препроцессор в `.c` и атрибут в `.rs`. Поддержано 160 расширений и 26 имён файлов: `Dockerfile`, `Containerfile`, `Makefile`, `GNUmakefile`, `Justfile`, `Rakefile`, `Vagrantfile`, `Gemfile`, `CMakeLists.txt`, `Jenkinsfile`, `BUILD`, `BUILD.bazel`, `WORKSPACE`, `WORKSPACE.bazel`, `meson.build`, `SConstruct`, `SConscript`, `Pipfile`, `Procfile`, `.env`, `.gitignore`, `.dockerignore`, `.npmignore`, `.gitattributes`, `.gitmodules`, `.editorconfig`. Матчинг: точное имя файла → расширение → префикс имени, поэтому суффиксные варианты (`Dockerfile.dev`, `Makefile.am`) определяются по префиксу, а `build.gradle` остаётся c-family — голый `BUILD` его не перехватывает.

| Профиль | Линейный комментарий | Блок / doc | Примеры |
| --- | --- | --- | --- |
| c-family | `//` | `/* */`, `/** */`, `{/* */}` | ts, js, kt, java, rs, cs, c, cpp, swift, dart, scala, mts, cts, sol, v, sv, qml, styl, res |
| go | `//` | `/* */`, `/** */`, `{/* */}` | go (конвенция doc-комментариев: `//`-ран над объявлением, первое слово которого называет его, эксемптен от multi-line/header) |
| css | `//`, `/*` | `/* */` | css, scss, less |
| py | `#` | `"""` / `'''` | py, pyi, vy |
| hash | `#` | — | rb, sh, yaml, toml, ex, raku, awk, go.mod, go.sum, Dockerfile, Makefile, .gitignore |
| gherkin | `#` | — | feature (Gherkin: multi-line выключен, остальные slop-правила остаются) |
| hashblock | `#`, `/*` | `/* */` | nix, hcl, tf, tfvars |
| powershell | `#` | `<# #>` | ps1, psm1 |
| julia | `#` | `#= =#` | jl |
| nim | `#` | `#[ ]#` | nim |
| sql | `--`, `#` | `/* */` | sql, plsql, pks, pkb |
| dash | `--` | — | vhd, vhdl, adb, ads |
| lua / haskell | `--` | `--[[ ]]` / `{- -}` | lua, hs, elm, purs, idr, agda, dhall |
| lisp | `;` | — | clj, el, scm, rkt |
| percent | `%` | — | tex, bib, erl |
| fortran / vb / batch / vim | `!` / `'`, `REM` / `::`, `REM` / `"` | — | f90, vb, bat, vim |
| rst | `..` | — | rst |
| markup | `<!--` | `<!-- -->` | html, xml, svg, md, xsl |
| mdx | `<!--` | `<!-- -->`, `{/* */}` | mdx |
| vue | `//`, `/*`, `<!--` | `/* */`, `{/* */}`, `<!-- -->` | vue, svelte, astro |
| ocaml | `(*` | `(* *)` | ml, mli |
| php | `//`, `#` | `/* */`, `/** */` | php |
| pascal | `//`, `(*` | `(* *)`, `///` doc | pas, pp, fs (F#) |
| coffee | `#` | `### ###` | coffee, litcoffee |
| adoc | `//` | `//// ////` | adoc, asciidoc |
| handlebars | `{{!`, `<!--` | `{{!-- --}}`, `<!-- -->` | hbs |
| gotmpl | `{{/*` | `{{/* */}}` | tpl, gotmpl, gohtml, tmpl |
| ini / properties | `;`, `#` / `#`, `!` | — | ini, properties, .editorconfig |

`.m` не сканируется: расширение неоднозначно (Objective-C против MATLAB). `.pp` тоже неоднозначно (Puppet против Pascal) — отмечен как pascal. Не сканируются: COBOL, ассемблер (`.asm`/`.s`), `.ahk`, `.ipynb`, серверные шаблоны движков (`.erb`, `.ejs`, `.jsp`, `.cshtml`, `.razor`, `.twig`, `.blade.php`, `.pug`, `.haml`). Новый язык добавляется одной строкой в таблицу профилей `scan.mjs`.

## Правила

<!-- stop-ai-slop:rules:start -->
| Правило | Severity | Суть |
| --- | --- | --- |
| `multi-line-comment` | error | комментарий занимает 2+ строки подряд |
| `changelog-marker` | error | комментарий пересказывает дифф (пара changelog-маркеров или сильный маркер, ru/en/de/fr/es) |
| `long-comment` | error | строка комментария длиннее 120 символов |
| `vend/step-numbered` | warning | нумерованный шаг в комментарии (Step N / Шаг N / N., маркер любого языка) |
| `vend/section-divider` | warning | строка-разделитель из символов -=#* |
| `vend/markdown-in-comment` | warning | markdown-разметка внутри комментария (**, -, \|) |
| `vend/this-function-opener` | warning | комментарий начинается с «This function/…», «Эта функция/…», «Diese Funktion…», «Cette fonction…» или «Esta función…» |
| `vend/file-summary-header` | warning | шапка-резюме из 2+ строк комментария в начале файла |
| `vend/generic-todo` | warning | TODO/FIXME/XXX без ссылки на тикет |
| `vend/ticket-ref` | warning | тикет-ссылка в комментарии без TODO — контекст правки живёт в коммите/PR, не в коде |
| `vend/cross-file-ref` | warning | указатель на другой файл/строку в комментарии (handler.py:147) |
| `vend/obvious-comment` | warning | комментарий пересказывает строку кода под ним |
| `vend/ai-plan-narration` | warning | комментарий пересказывает рабочий процесс агента (ссылки на план/спеку/задачу, подтверждение инструкций) |
| `vend/ai-vocab-density` | warning | 3+ разных слов из ИИ-канона (delve, pivotal, tapestry...) в комментариях файла |
| `vend/research-citation` | warning | научная ссылка в комментарии — код не место для библиографии |
| `vend/self-suppression` | warning | директива подавления без списка правил пришла вместе с подавляемым кодом |
| `vend/cjk-noise` | warning | CJK-иероглифы склеены с латиницей или цифрами в коде (артефакт генерации) |
| `vend/zero-width-chars` | error | невидимый символ нулевой ширины (U+200B, U+200C, U+200D, U+2060, U+FEFF или escape-форма) |
| `vend/bidi-controls` | error | BiDi-контролы (U+202A-U+202E, U+2066-U+2069) в любой строке и направленные марки (U+200E, U+200F) в коде |
<!-- stop-ai-slop:rules:end -->

Error-правила не применяются к doc-блокам (JSDoc `/** … */`, Python-docstring и `///` doc-строки — dartdoc, rustdoc, C# XML doc): контрактная документация классов и функций допустима любой длины. Внутри doc-блоков по-прежнему ловятся changelog-маркеры (error) и пересказ сигнатуры «This function…» (warning). Строка `long-comment` с why-маркером в тексте (`because`, `since`, `otherwise`, `workaround`, `to avoid`, `by design`, `trade-off`, `e.g.` — плюс эквиваленты RU/DE/FR/ES) не флагается: длинный однострочный why-комментарий легитимен, многострочная наррация — нет. Тот же why-маркер эксемптит 2-строчный ран (перенесённый why, влезающий в одну строку); 3+ строки по-прежнему флагаются. Gherkin-спеки `.feature` полностью эксемптят `multi-line-comment` — наррация сценариев там нормальная форма — остальные slop-правила (`changelog-marker`, `step-numbered`, `markdown-in-comment`) продолжают работать.

Текстовые правила (`step-numbered`, `markdown-in-comment`, `this-function-opener`, `cross-file-ref`) матчатся по тексту после срезания маркера комментария, поэтому работают во всех профилях — `# Шаг 3` в yaml и `-- Step 3` в sql ловятся одинаково. `step-numbered`, `this-function-opener` и `changelog-marker` понимают RU+EN+DE+FR+ES («Шаг N», «Schritt N», «Étape N», «Diese Funktion», «au lieu de», «ya no» и т.п.); прочие естественные языки не покрыты. Структурные правила (multi-line, divider, header, todo) от языка формулировок не зависят. `step-numbered` и `markdown-in-comment` внутри doc-блоков не срабатывают. `vend/obvious-comment` дополнительно гейтится плотностью по файлу: находки obvious-comment снимаются, если их меньше 2% от непустых некомментарных строк файла — рукописные файлы несут несколько коротких комментариев, сгенерированные нарративируют каждые несколько строк.

Полное обоснование по правилу (Why / Instead of / Write / Ignore it when из той же таблицы `RULES`):

```
node skill/scripts/scan.mjs --explain <rule-id>
```

id правил и служебные лейблы — EN; сообщения и обоснования — RU. Префикс `vend/` = правила, вендоренные из внешних каталогов паттернов.

Детектор видит inline-комментарии после кода (`const x = 1 // было`), блоковые комментарии без маркера на средних строках, doc-блоки любой длины (контрактные JSDoc/docstring), файлы в UTF-16 с BOM; zero-width символы (U+200B–U+200F, U+FEFF) срезаются при матчинге маркеров; `vend/zero-width-chars` флагает U+200B, U+200C, U+2060, U+FEFF и не-эмодзи U+200D по сырым строкам, а `vend/bidi-controls` флагает BiDi-override и isolate (U+202A–U+202E, U+2066–U+2069) по сырым строкам, включая комментарии; направленные марки U+200E/U+200F флагаются только в кодовой части строки — в комментариях и прозе это легальная RTL-типографика. Escape-формы в исходнике тоже флагаются; ZWJ внутри эмодзи-последовательностей и BOM в позиции 0 не флагаются. CJK-смежность с латиницей или цифрами проверяется только в code-части строки: китайские комментарии и i18n-строки без смежности с латиницей легитимны. В prose-форматах (`.md`/`.mdx`/`.html`/`.xml`/`.rst`/`.adoc`) CJK-смежность не проверяется вовсе: смешанная JP/CN-проза с латинскими брендами там норма. Не сканируются: языки без профиля (см. таблицу выше; `.m` неоднозначно), бинарные и офисные форматы; `--staged` и `--diff` не видят неотслеживаемые файлы. Warning не блокируют гейт, если не указан `--strict`. Имена файлов с не-ASCII поддерживаются в diff-режимах. Пропускаются каталоги артефактов (`venv`, `build`, `.next`, `target`, `out`, `.gradle`, `Pods`, `__pycache__`, `.idea`, `.codegraph`, `site-packages`, `.dart_tool`). Лицензионные шапки исключены из правила multi-line, а строка-шебанг никогда не склеивается со следующим за ней комментарием. В `.go`-файлах ран из 2+ `//`-строк прямо над объявлением `func`/`type`/`const`/`var` (включая методы), первое слово которого называет объявленный идентификатор, — это Go doc-комментарий: эксемпт от `multi-line-comment` и `vend/file-summary-header` как doc-блок; остальные правила применяются. Inline-комментарии определяются по маркерам профиля (`//`, `#`, `--`, `%`, `;`, `!`) за исключением py/fs floor division (`//`). Каталог-аргумент вне текущего репозитория обходится напрямую (git-листинг покрывает только само репо).

**Что обходит полный скан.** Внутри git-репозитория `scan` перечисляет файлы через `git ls-files --cached --others --exclude-standard`, поэтому всё gitignored невидимо: `__pycache__`, `.venv`, вывод сборки, вендорные деревья, загруженные тулчейны, упакованные рантаймы, минифицированные бандлы, скомпилированный `.dart.js`. Вне репо — прежний обход каталогов. YAML block scalars (`key: |`, `- >`) — строковый контент, а не комментарий: их строки никогда не флагуются.

**Сгенерированные файлы эксемптся от slop-правил** во всех режимах (полный скан, diff, write-time гейт) — слои детекции, пользовательские сигналы и рубильники описаны в разделе [Сгенерированный код](#сгенерированный-код). Файл, у которого в первых 8 КБ есть NUL-байт, считается бинарным и пропускается (UTF-16 с BOM декодируется раньше, поэтому бинарным не считается).

## Сгенерированный код

Сгенерированные файлы эксемптся от slop-правил во всех режимах (полный скан, diff, write-time гейт). Три слоя детекции, достаточно любого:

1. **Уникальные суффиксы имён**, которые никто не пишет руками: build_runner (`*.g.dart`, `*.freezed.dart`, `*.gr.dart`, `*.chopper.dart`, `*.pb*.dart`), protoc (`*_pb2.py`, `*_pb2.pyi`, `*_pb.go`, `*_grpc.pb.go`, `*.pb.cc/h/hpp/cpp`, `*.pb.mojom.*`), Kubernetes `zz_generated.*`, stringer `*_string.go`, sqlc (`*.sql.go`, `*.querier.go`), .NET (`*.Designer.cs`, `*.g.i.cs`, `*AssemblyAttributes.cs`, `GlobalUsings.g.cs`), бандлы (`*.min.js`, `*.min.css`, `*.bundle.js`). Неоднозначные имена (`*.gen.go`, `*.generated.ts`, `*_Factory.java`, `*.g.cs`, `mock_*.go`, `*.d.ts`) намеренно **не** эксемптся по имени — слишком много ложных срабатываний; они эксемптся только через заголовок ниже.
2. **Tool-named заголовки** в первых 10 строках: `@generated`, `Code generated by … DO NOT EDIT`, `generated code - do not modify by hand`, `<auto-generated`, `automatically generated by rust-bindgen`, `@generated by prost-build`, `@javax.annotation.Generated(`, `generated by openapi-generator`, `code generated by sqlc`.
3. **Ад-хок генераторы**: в первых 10 строках одновременно слово о генерации (`generat…`/`codegen`) и запрет правки (`do not edit/modify`). Голый `DO NOT EDIT` без слова о генерации не эксемптит — рукописные policy-файлы продолжают линтоваться.

Поверх слоёв — два пользовательских сигнала: строка `.gitattributes` с `linguist-generated` (конвенция GitHub linguist) и список `generatedPaths` в `.stop-ai-slop.yaml` (та же префиксная семантика, что у `excludePaths`).

Семантика: на сгенерированном файле slop-правила эксемптся, но security-правила `vend/zero-width-chars`, `vend/bidi-controls` и `vend/cjk-noise` продолжают флагать — отравленный codegen это supply-chain сигнал, а не вопрос стиля. Write-time гейт следует тому же правилу: сгенерированные файлы эксемптся от slop-правил, но security-правила на них срабатывают. `scanGenerated: true` в `.stop-ai-slop.yaml` линтует сгенерированный код как обычный.

## Бенч (FP-регрессионная когорта)

`--bench` пинит когорту из 8 зрелых OSS-репозиториев (все SHA датированы до 2025-01-01 — таблица `BENCH_COHORT` в `skill/scripts/scan.mjs`), сканирует каждый сырым пайплайном правил (без конфига и baseline) и считает находки по id правил. Сравнение счётчиков с закоммиченным `bench-history.json` ловит регрессии ложных срабатываний: рост счётчика любого правила на пин-дереве значит, что правка правила принесла новые ложняки. Только счётчики, без скоринга.

```
node skill/scripts/scan.mjs --bench         # счётчики по репо и правилам + дельта против bench-history.json
node skill/scripts/scan.mjs --bench-write   # перезаписать bench-history.json текущими счётчиками
```

Семантика: рост счётчика любого правила в любом репо — регрессия: `--bench` печатает дельту и выходит с кодом 1. Падения и равенства — норма (exit 0). Отсутствие `bench-history.json` трактуется как пустая история (всё считается ростом) с подсказкой запустить `--bench-write`. Файл истории закоммичен в репозиторий — это пин-эталон ложных срабатываний.

Первый запуск требует сеть и git: каждый репозиторий клонируется один раз (`git init` + `fetch --depth 1 <sha>`) в `~/.cache/stop-ai-slop/bench/<owner>--<name>` (переопределяется `STOP_AI_SLOP_BENCH_CACHE`). Последующие запуски переиспользуют кэш; кэш на чужом SHA перекачивается. Ошибка fetch — exit 2.

Обновление когорты: правите `BENCH_COHORT` (репо + пин SHA), перезапускаете `--bench-write`, ревьюите дельту `bench-history.json` в PR — рост счётчика обязан объясняться истинными срабатываниями, иначе правка правила это регрессия ложняков.

## Playground

Статическая страница без бэкенда, которая запускает настоящий детектор (`skill/scripts/src/detect.mjs`) в браузере: Vite собирает реальные модули, ничего не копируется. Собранная страница закоммичена как `playground/dist/index.html` и работает офлайн, в том числе при открытии прямо с диска (`file://`).

```
cd playground && npm install && npm run build
```

Затем откройте `playground/dist/index.html`. Песочница изолирована в devDependencies и не входит в npm-пакет (`playground/` отсутствует в списке `files`). Деплой на GitHub Pages — следующий шаг.

## Сравнение с аналогами

Факты из README конкурентов, метаданных GitHub и счётчиков загрузок npm, проверено 2026-09-29. Трекшн = звёзды GitHub и загрузки npm за месяц на дату проверки.

### Специализированные slop-линтеры

| Инструмент | Что сканирует | Языки / естественные языки | Блокирует в момент правки | Модель гейта | Свои правила | Рантайм | Трекшн |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **stop-ai-slop** | комментарии в коде, 16 правил | 160 расширений, 26 имён, 34 профиля / RU, EN, DE, FR, ES; сообщения RU или EN (`--lang`) | да — плагин OpenCode, хуки Claude Code, Codex, Gemini, Qwen, Devin | политика: правило → exit 1; error/warning | таблица RULES в одном файле; remap severity; `--explain` | Node >= 18, ноль зависимостей, один .mjs-сканер | 449 загр/мес |
| [windbag](https://github.com/scale-venture-partners/windbag) | комментарии-пересказы изменений, 6 правил (HISTORY_NARRATION, HEDGE_LANGUAGE, TICKET_ID, CROSS_FILE_REF, VERBOSE_COMMENT, OBVIOUS_COMMENT) | Python, JS/TS, Terraform, Rust, Go, Java, SQL (dbt/SQLMesh), YAML/HTML/MD / EN | PostToolUse-хук Claude Code; pre-commit; OpenCode нет | error-правила валят чек, warn — отчёт | не документированы | Rust-бинарь в виде PyPI wheel | 25★ |
| [aislop](https://github.com/scanaislop/aislop) | код-слоп: 50+ правил — нарративные комментарии, проглоченные исключения, `as any`, мёртвый код, галлюцинированные импорты | 10 таргетов (TS, JS, Expo/RN, Python, Go, Rust, Ruby, PHP, C#, C/C++) / EN | хуки для 10 агентов (Claude, Cursor, Gemini, Pi, Codex, Windsurf, Cline, Kilocode, Antigravity, Copilot); OpenCode нет | скор 0–100, failBelow; CI-режим; SARIF; MCP-сервер | severity на правило; новые правила — только в их репо | npm + опциональные движки (biome, ruff, oxlint); PyPI; Homebrew | 655★, 47k загр/мес |
| [slop-scan](https://github.com/modem-dev/slop-scan) | AI-паттерны в коде; хотспоты; сравнение репозиториев | JS/TS / EN | нет | скор + нормализованные метрики (на KLOC, на функцию) | конфиг и плагины | npm | 319★, 35k загр/мес |
| [anti-slop](https://github.com/dmmulroy/anti-slop) | low-evidence-паттерны в коде, набор правил Oxlint под вендоринг | TS/JS / EN | нет | правило → error (Oxlint) | вендорится by design — правьте свою копию | плагин Oxlint; npm-пакета нет | 5.0k★ |
| [AI-SLOP-Detector](https://github.com/flamehaven01/AI-SLOP-Detector) | «fake-done»-код: 27 проверок — пустые заглушки, неразрешимые импорты, мёртвые пайплайны, раздутые буллеты в доках | Python в первую очередь; JS/TS и Go экстра / EN | нет | скор риска 0–100 на файл; soft/hard/quarantine CI-гейты; MCP | пресеты доменов; локальная калибровка | Python (PyPI), офлайн, детерминированный; расширение VS Code | 96★ |
| [gptlint](https://github.com/gptlint/gptlint) | нарушения best practices, оценивает LLM; правила пишутся в markdown | JS/TS (MVP) / любой язык, который читает LLM | нет | вердикт LLM; CLI и конфиг в стиле eslint | свои правила — first-class (markdown) | npm + API-ключ LLM или локальная модель; кеширование | 297★, 138 загр/мес |
| [dotnet-slopwatch](https://github.com/Aaronontheweb/dotnet-slopwatch) | reward hacking LLM: отключённые тесты, подавленные ворнинги, проглоченные исключения, маскирующие задержки | .NET / EN | хук Claude Code; CI | правило → блок | — | .NET-тул (NuGet) | 110★ |
| [grain](https://github.com/mmartoccia/grain) | AI-паттерны в коде как очередь агентного ремонта (JSON-нарушения, worklog между сессиями) | Python / EN | нет | правило → error; флаг fixable у нарушения | — | Python | 34★, молчит с 2026-04 |
| [sloppylint](https://github.com/rsionnach/sloppylint) | over-engineering, галлюцинации, мёртвый код | Python / EN | нет | отчёт о находках | — | Python | 90★, молчит с 2025-12 |
| [ai-slop-linter](https://github.com/Bubblegunn/ai-slop-linter) | проза: сообщения коммитов, описания PR, доки; 21 маркер | любой текст / EN-маркеры; их же бенч: em-dash на корректной русской прозе — 24 срабатывания на 1000 слов | нет — commit-msg-хук и правило commitlint гейтят сообщение в момент коммита | взвешенный скор на 1000 слов; SARIF | ignore/only по файлам | npm, ноль runtime-зависимостей | 1.6k загр/мес |
| [vibecheck-slop-stopper](https://github.com/qinnovates/vibecheck-slop-stopper) | 78 grep-правил всех категорий слопа | 9 стеков / EN | нет — GitHub Action, CLI; скилл Claude Code просит LLM прогнать паттерны через его Grep-тул | уровни severity | rules.toml | Python + ripgrep (сам скилл: без зависимостей) | 0★, молчит с 2026-04 |

### Меньшие и более новые инструменты

Проверены той же датой, по одной строке: [dannote/sloplint](https://github.com/dannote/sloplint) (AST-based, мультиязычный; молчит с 2026-02), [bibekmhj/sloplint](https://github.com/bibekmhj/sloplint) (первый JVM AI-slop-линтер), [rbaumier/comply](https://github.com/rbaumier/comply), [thrash-d/slop-linter](https://github.com/thrash-d/slop-linter) (правила Vale + хук Claude Code для прозы и комментариев в коде), [almcc/slop-linter](https://github.com/almcc/slop-linter) (LLM-классификатор Jev), [Aaryan-9/ai-slop-remover](https://github.com/Aaryan-9/ai-slop-remover) (комментарийный шум среди детекторов), [agiwhitelist/auteur](https://github.com/agiwhitelist/auteur) (1035★ — скилл-«режиссёр» сайтов, чей ship-гейт включает anti-slop-линтер; домен — дизайн), [mattpocock/slopwatch](https://github.com/mattpocock/slopwatch) (51★, без документации), [LanNguyenSi/agent-dx](https://github.com/LanNguyenSi/agent-dx) (тулкит-монорепо, чей slop-detector линтит PR).

### Смежные подходы

SaaS-ревью-боты: [CodeRabbit](https://coderabbit.ai) имеет именованную «Slop Detection» — триаж AI-спама на уровне PR: early access, не блокирует мердж, амнистирует своих участников, от $24/разраб/мес. У Greptile, Graphite Diamond и Qodo фичи слопа нет — политика комментариев может ехать только в их кастомных LLM-правилах. Codacy и SonarQube оборачивают коммьюнити-линтеры: закомментированный код (S125) и TODO-теги (S1135), без детекции нарративов. Классические линтеры (ESLint `no-warning-comments` и родня, Biome, Checkstyle, ktlint, detekt, godot/revive) следят за стилем комментариев — позиция, регистр, пунктуация, словарь TODO — и никто не ловит changelog-нарративы или нумерацию шагов; ближайшие — eslint-plugin-write-good-comments (качество прозы внутри комментариев) и [Vale](https://vale.sh) (tree-sitter-извлечение комментариев в 28 языках со style-пакетами — без структурных slop-правил). Коммьюнити-скиллы агентов (dashed/claude-marketplace comment-slop, kubosho/anti-slop-comment, manutej/craft) кодируют ту же таксономию как advisory LLM-инструкции — механического гейта нигде нет.

### Где stop-ai-slop хуже

- **Только комментарии.** Кодовый слоп — проглоченные исключения, `as any`, мёртвый код, галлюцинированные импорты, reward-hacked-тесты — вне охвата: его закрывают aislop (50+ правил, 10 таргетов), dmmulroy/anti-slop, AI-SLOP-Detector, grain и dotnet-slopwatch.
- **Не сканирует прозу.** Сообщения коммитов, описания PR и доки — территория ai-slop-linter (его правило commitlint и commit-msg-хук гейтят их в момент коммита).
- **Построчное извлечение, не грамматики.** windbag читает комментарии через настоящие грамматики: `#` внутри кавычного YAML-скаляра остаётся данными, `.sql` парсится как Jinja-шаблоны (dbt/SQLMesh), fenced-блоки в Markdown пропускаются. Наш inline-детектор отслеживает template literals с `${}`-интерполяцией в JS/TS-профилях, но остаётся построчным: строка, начинающаяся внутри незакрытого многострочного template literal, не отслеживается без состояния файла — задокументированное ограничение.
- **Длина комментария — абсолютный лимит.** Наш `long-comment` — 120 символов; VERBOSE_COMMENT у windbag меряет комментарий относительно кода под ним. (После сравнения 2026-09-29 мы переняли два правила windbag как `vend/cross-file-ref` и `vend/obvious-comment`; правило относительной длины остаётся их козырем.)
- **Нет семантического матчинга.** gptlint (LLM) и almcc/slop-linter (модель Jev) оценивают смысл и ловят перефразированный слоп; наши маркеры — словари на RU+EN+DE+FR+ES, фразовых словарей ZH/JA нет.
- **Нет IDE-расширения.** AI-SLOP-Detector поставляет расширение VS Code с инлайн-находками и скором в статус-баре; наш IDE-сюжет — problem matcher в tasks.json плюс шаблон File Watcher для IDEA.
- **Проникновение и дистрибуция.** aislop: 655 звёзд, 47k загрузок/мес, npm + PyPI + Homebrew, скор-бейджи, ремонтные сессии `aislop agent`, рулящие Codex/Claude/OpenCode. slop-scan: 35k загрузок/мес. stop-ai-slop: 449 загрузок/мес, npm + зеркало GitHub Packages + формула Homebrew (этот репозиторий как собственный tap).

### Что есть только у stop-ai-slop

- write-time-гейт в OpenCode — ни один конкурент не блокирует запись внутри OpenCode: хук-лист aislop покрывает десять агентов без OpenCode, windbag блокирует только в Claude Code;
- ноль зависимостей и один файл сканера — aislop гоняет внешние линтер-движки, windbag поставляет Rust-бинарь, vibecheck требует Python + ripgrep;
- маркеры русского, немецкого, французского и испанского языков;
- правила невидимых символов с учётом escape-форм: zero-width и BiDi-контролы, CJK, приклеенный к латинице в коде, — сигнал отравленного codegen;
- fingerprint- baseline (id правила + текст комментария), переживающий сдвиги строк и всё равно флагающий заново вставленный легаси-слоп.

stop-ai-slop сознательно уже: только политика комментариев. Проглоченные исключения, `as any`, мёртвый код — территория aislop, dmmulroy/anti-slop, grain и dotnet-slopwatch; EN-проза и сообщения коммитов — ai-slop-linter. Мы дополняем их ровно там, куда они не достают: в момент правки в OpenCode и в русских changelog-маркерах.

## Лицензия

MIT — см. [LICENSE](LICENSE).
