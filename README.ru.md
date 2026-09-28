# stop-ai-slop

[English](README.md) | **Русский**

[![npm version](https://img.shields.io/npm/v/stop-ai-slop)](https://www.npmjs.com/package/stop-ai-slop)
[![license](https://img.shields.io/github/license/WhiteBite/stop-ai-slop)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![zero-deps](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

> **stop-ai-slop — линтер и гейт комментариев с нулевыми зависимостями, который блокирует AI-слоп в комментариях до попадания в кодовую базу.** Один сканер (`skill/scripts/scan.mjs`, таблица `RULES`) — единый источник правды для политики «комментарий — одна строка и только why». Гейт применяется в момент записи (плагин OpenCode, PreToolUse-хук Claude Code), на коммите (pre-commit hook, ставится через `--install`) и в CI (GitHub Action, шаблон GitLab CI), а также работает как MCP-сервер. Node >= 18, нулевые npm-зависимости, лицензия MIT, работает на Windows, Linux и macOS.

## Что входит и что ставится автоматически

Один сканер (`skill/scripts/scan.mjs`, таблица `RULES`) представлен восемью точками приложения. Они независимы: включайте нужные, они не конфликтуют и применяют одни и те же правила.

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

### Установка в две команды

```
npm i -D stop-ai-slop
npx stop-ai-slop --install        # вшивает pre-commit hook + npm scripts в текущее репо
```

`--install` — единственная команда, которая меняет ваше репо: дописывает блок с маркером в `.git/hooks/pre-commit` (идемпотентно, не затирает существующий hook) и добавляет npm scripts `stop-ai-slop` / `stop-ai-slop:all`. Hook содержит абсолютный путь к сканеру на момент установки — после переноса или повторного клонирования сканера запустите `--install` заново.

### Ничего не происходит тихо

У `npm i -D stop-ai-slop` нет postinstall-скрипта: пакет просто ложится в `node_modules`. Ни hook, ни конфиги редакторов и агентов не трогаются, пока вы сами не запустите `--install` или не добавите один из сниппетов ниже.

### Какие точки выбрать

- **Только git** — две команды выше; готово.
- **Пользователи OpenCode** — добавьте стаб плагина, чтобы слоп отклонялся в момент записи: файл `~/.config/opencode/plugins/comment-gate.ts` из одной строки `export { default } from "<путь к node_modules>/stop-ai-slop/plugin/comment-gate.ts"`.
- **Пользователи Claude Code** — `/plugin marketplace add WhiteBite/stop-ai-slop`, затем `/plugin install stop-ai-slop`; скилл и оба хука приходят автоматически.
- **Любой MCP-клиент (Cursor, Codex и др.)** — stdio-запись `npx stop-ai-slop --mcp` (см. «MCP-сервер»).
- **CI** — GitHub Action или GitLab include (см. «IDE и CI»).

## Зачем stop-ai-slop

- **Нулевые зависимости.** Сканер — один файл `.mjs`, плагин OpenCode — один файл `.ts`. Не нужно ставить ни biome, ruff, oxlint, ни Python, ни ripgrep.
- **Блокирует в момент правки, а не после.** Плагин OpenCode отклоняет `write`/`edit`/`multiedit`; PreToolUse-хук Claude Code запрещает `Write`/`Edit` до их выполнения. Большинство аналогов сканируют только постфактум или просят модель саму прогнать grep.
- **Мультиязычная детекция естественного языка.** Changelog-маркеры, нумерованные шаги и открывашки «This function…» матчатся на RU + EN + DE + FR + ES. Конкуренты — только английский.
- **Один источник правды.** Все правила живут в одной таблице `RULES`; `--explain <rule-id>` печатает обоснование каждого правила (Why / Instead of / Write / Ignore it when).
- **Машиночитаемый вывод.** `text` (по умолчанию), Reviewdog `rdjson` и SARIF 2.1.0 для GitHub code scanning.
- **Дружелюбен к легаси.** Baseline амнистирует существующие находки, и гейт срабатывает только на новый слоп.
- **Широкая поверхность применения.** OpenCode, Claude Code, Cursor, Codex, GitHub Actions, GitLab CI, MCP, VS Code, IntelliJ IDEA.

## Что и зачем

Политика: комментарий — максимум одна строка и только неочевидное внешнее ограничение, инвариант или воркэраунд. Пересказ диффа живёт в сообщении коммита, why теста — в имени теста. Таблица правил и детектор живут в `skill/scripts/scan.mjs` (const `RULES`) — править правила надо там, всё остальное только применяет их.

Error-правила блокируют (exit 1, write-time gate бросает ошибку). Warning — учитель: выводится, не блокирует.

## Точки приложения

1. **OpenCode write-time плагин** — `plugin/comment-gate.ts` перехватывает `write`/`edit`/`multiedit` и отклоняет правку с error-находками в момент записи. Монтируется в `~/.config/opencode/plugins/` стабом-реэкспортом. Default-экспорт `{ id: "stop-ai-slop", server: CommentGate }` даёт стабильный id плагина; legacy-экспорт `CommentGate` сохраняет работоспособность старых стабов; OpenCode показывает локальные плагины по имени файла стаба — назовите стаб `stop-ai-slop.ts` вместо `comment-gate.ts`, если хотите такую метку.
2. **Pre-commit через `--install`** — одна команда вшивает `node .../scan.mjs --staged` в `.git/hooks/pre-commit` (идемпотентно, дописывает блок с маркером, не затирая существующий hook) и добавляет npm scripts `stop-ai-slop` / `stop-ai-slop:all` в package.json. Hook и npm scripts содержат абсолютный путь к сканеру на момент установки — после переноса или повторного клонирования сканера запустите `--install` заново.
3. **Agent skill** — `skill/SKILL.md` (name: `stop-ai-slop`): политика, таблица правил, режимы запуска. Монтируется в OpenCode и Claude Code.
4. **Baseline для легаси** — 1) `--install`, 2) `--baseline-write` (записывает текущие находки), 3) закоммитить baseline, 4) дальше гейт видит только новое; правки выше baselined-строк сдвигают номера и воскрешают легаси — лечится `--baseline-prune`, который удаляет из baseline записи без живых находок; повторный `--baseline-write` амнистирует и новый слоп — не делать.

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
node skill/scripts/scan.mjs --baseline-write    # записать текущие находки в baseline
node skill/scripts/scan.mjs --baseline-prune    # удалить из baseline записи без живых находок
node skill/scripts/scan.mjs --help              # справка по всем флагам
```

Директивы подавления: `// stop-ai-slop-ignore-next-line [rule-id]` (следующая строка), `// stop-ai-slop-ignore-line [rule-id]` (текущая строка), `// stop-ai-slop-ignore-file` (весь файл); после `--` — причина.

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
| `changelog-marker` | удалить полнострочный комментарий; снять trailing-комментарий со строки кода |
| `vend/step-numbered` | снять префикс «Step N:», остальной текст оставить |
| `vend/zero-width-chars`, `vend/bidi-controls` | вырезать реальные невидимые/BiDi-символы |

**Не чинится автоматически** — нужна голова или агент, чтобы написать замену, поэтому `--fix` их оставляет и выводит в отчёт: `long-comment` (сжать смысл), `vend/this-function-opener` (переформулировать как инвариант), `vend/generic-todo` (добавить тикет), `vend/markdown-in-comment` (семантика), `vend/cjk-noise` (переписать идентификатор).

Предохранители: открытие блок-комментария никогда не удаляется в середине блока (уходят только целые раны); реальный невидимый символ вырезается, но его backslash-escape форма в исходнике (литерал BOM-теста) остаётся — это предмет кода, а не слоп; легальная emoji-ZWJ последовательность и ведущий BOM сохраняются; директива `stop-ai-slop-ignore-next-line` удаляется вместе со своим кодом только когда целевая строка сама удалена, чтобы директива не повисла; suppression-директивы и покрытые ими находки не трогаются. Сгенерированные, бинарные и gitignored-файлы пропускаются ровно как при сканировании.

Для массовой семантической чистки (не-механические правила) рекомендуемый поток: сначала `--fix`, чтобы расчистить механическое большинство, затем проход агента по остатку отчёта — или `--baseline-write`, чтобы амнистировать то, что команда решает оставить.

## Конфиг

Необязательный файл `.stop-ai-slop.yaml` в корне репозитория (там же, где baseline: корень git, а вне репо — каталог сканирования). Читается режимами `scan`, `--staged`, `--diff`; write-time плагин OpenCode конфиг не читает и работает с дефолтами. Парсер — zero-dep подмножество YAML: скаляры `ключ: значение`, списки через `- `, секция `rules:` с двухпробельным отступом, `#`-комментарии и пустые строки пропускаются, значения могут быть в кавычках. Неизвестные ключи игнорируются; недопустимое severity — exit 2 с именем файла и номером строки.

| Ключ | Семантика |
| --- | --- |
| `maxCommentLength` | порог длины строки комментария для `long-comment` (по умолчанию 120) |
| `excludePaths` | список относительных путей-префиксов: путь исключается, если равен записи или начинается с `запись/`; работает в полном сканировании и в diff-режимах |
| `rules` | override severity по id правила: `error`, `warning` или `off` (правило отключено) |
| `generatedPaths` | список относительных путей-префиксов, считаемых сгенерированными (та же префиксная семантика, что у `excludePaths`) |
| `scanGenerated` | `true` отключает эксемпт сгенерированных файлов — они линтуются как обычные |

```yaml
maxCommentLength: 100
excludePaths:
  - generated
  - docs/api.md
rules:
  multi-line-comment: off
  vend/step-numbered: error
```

Remap severity применяется после детекции и до фильтрации baseline и подсчёта exit-кода; baseline матчится по `rel:line` независимо от severity, поэтому смена severity в конфиге не воскрешает и не маскирует baselined-находки.

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
| `slop_baseline` | `{}` | Выводит записи baseline (формат `relpath:line`) |

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

## IDE и CI

### VS Code

Задача `tasks.json` с problem matcher для подсветки находок в панели Problems:

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

Action сам подтягивает базовый реф, поэтому стандартного shallow checkout достаточно; `strict: "true"` включает режим warnings-as-errors; `format: "json"` или `format: "sarif"` переключает вывод action на машиночитаемый формат (см. «Форматы вывода»). На push-событиях action не работает (нет `github.base_ref`) — используйте `pull_request` или передавайте base явно.

## Релизы в npm

Бутстрап, один раз: первая публикация нового пакета требует интерактивное подтверждение — `npm publish` в терминале: npm либо запросит OTP (если 2FA включена), либо предложит browser-approve («Authenticate your account at …»), которого достаточно без OTP и без 2FA; третий путь — granular-токен с bypass-2FA в `~/.npmrc`. Сразу после неё: npmjs.com → Settings пакета → Trusted publishing → добавить `WhiteBite/stop-ai-slop` и workflow `publish.yml`; если эта форма потребует включить 2FA — это единственное место, где она обязательна для полностью автоматических тегов.

Дальше деплой идёт по тегам: bump версии в `package.json` + запись в CHANGELOG, коммит, `git tag vX.Y.Z && git push origin main --tags`. Воркфлоу `.github/workflows/publish.yml` (триггер `push: tags: v*`) прогоняет self-test, пропускает публикацию, если эта версия уже в реестре (порядок прилёта тегов не важен), и публикует через OIDC с provenance. Node 24 в воркфлоу обязателен: OIDC-публикация требует npm CLI ≥ 11.5.1.

## Монтаж на другую машину

```
git clone https://github.com/WhiteBite/stop-ai-slop <path>
New-Item -ItemType Junction -Path "$env:USERPROFILE\.config\opencode\skills\stop-ai-slop" -Target "<path>\skill"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\stop-ai-slop" -Target "<path>\skill"
```

Write-time плагин OpenCode: файл `%USERPROFILE%\.config\opencode\plugins\comment-gate.ts` из одной строки
`export { default } from "<path>/plugin/comment-gate.ts"`.
Эквивалент для cmd.exe — `mklink /J`; на Linux/macOS — `ln -s`. В любом git-репо без агентов работает `scan.mjs --install`.

## Другие интеграции

### pre-commit framework
```yaml
repos:
  - repo: https://github.com/WhiteBite/stop-ai-slop
    rev: v0.3.0
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

Плагин несёт скилл и PostToolUse-хук (`Write|Edit` → `scan.mjs --stdin-path`), который печатает находки по только что записанному файлу обратно в сессию. Cursor и Codex читают ту же схему хуков: скопируйте `.claude-plugin/stop-ai-slop/hooks/hooks.json` в `.cursor/hooks.json` / `.codex/hooks.json` своего репо, поправив путь к `scan.mjs`.

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

Плагин загружается процессом OpenCode на старте сессии: после правок `plugin/comment-gate.ts` перезапустите OpenCode, иначе работает старая версия (аудит-лог это сразу покажет отсутствием новых записей).

## Языковые профили

Синтаксис комментариев берётся из профиля языка, а не из общего списка: `#` — комментарий в `.py/.sh/.yaml`, но препроцессор в `.c` и атрибут в `.rs`. Поддержано 160 расширений и 26 имён файлов: `Dockerfile`, `Containerfile`, `Makefile`, `GNUmakefile`, `Justfile`, `Rakefile`, `Vagrantfile`, `Gemfile`, `CMakeLists.txt`, `Jenkinsfile`, `BUILD`, `BUILD.bazel`, `WORKSPACE`, `WORKSPACE.bazel`, `meson.build`, `SConstruct`, `SConscript`, `Pipfile`, `Procfile`, `.env`, `.gitignore`, `.dockerignore`, `.npmignore`, `.gitattributes`, `.gitmodules`, `.editorconfig`. Матчинг: точное имя файла → расширение → префикс имени, поэтому суффиксные варианты (`Dockerfile.dev`, `Makefile.am`) определяются по префиксу, а `build.gradle` остаётся c-family — голый `BUILD` его не перехватывает.

| Профиль | Линейный комментарий | Блок / doc | Примеры |
| --- | --- | --- | --- |
| c-family | `//` | `/* */`, `/** */`, `{/* */}` | ts, js, kt, java, go, rs, cs, c, cpp, swift, dart, scala, mts, cts, sol, v, sv, qml, styl, res |
| css | `//`, `/*` | `/* */` | css, scss, less |
| py | `#` | `"""` / `'''` | py, pyi, vy |
| hash | `#` | — | rb, php, sh, yaml, toml, ex, raku, awk, go.mod, go.sum, Dockerfile, Makefile, .gitignore |
| hashblock | `#`, `/*` | `/* */` | nix, hcl, tf, tfvars |
| powershell | `#` | `<# #>` | ps1, psm1 |
| julia | `#` | `#= =#` | jl |
| nim | `#` | `#[ ]#` | nim |
| sql | `--` | `/* */` | sql, plsql, pks, pkb |
| dash | `--` | — | vhd, vhdl, adb, ads |
| lua / haskell | `--` | `--[[ ]]` / `{- -}` | lua, hs, elm, purs, idr, agda, dhall |
| lisp | `;` | — | clj, el, scm, rkt |
| percent | `%` | — | tex, bib, erl |
| fortran / vb / batch / vim | `!` / `'` / `::`, `REM` / `"` | — | f90, vb, bat, vim |
| rst | `..` | — | rst |
| markup | `<!--` | `<!-- -->` | html, xml, svg, md, mdx, xsl |
| vue | `//`, `/*`, `<!--` | `/* */`, `{/* */}`, `<!-- -->` | vue, svelte, astro |
| ocaml | `(*` | `(* *)` | ml, mli |
| pascal | `//`, `(*` | `(* *)` | pas, pp, fs (F#) |
| coffee | `#` | `### ###` | coffee, litcoffee |
| adoc | `//` | `//// ////` | adoc, asciidoc |
| handlebars | `{{!` | `{{!-- --}}` | hbs |
| gotmpl | `{{/*` | `{{/* */}}` | tpl, gotmpl, gohtml, tmpl |
| ini / properties | `;`, `#` / `#`, `!` | — | ini, properties, .editorconfig |

`.m` не сканируется: расширение неоднозначно (Objective-C против MATLAB). `.pp` тоже неоднозначно (Puppet против Pascal) — отмечен как pascal. Не сканируются: COBOL, ассемблер (`.asm`/`.s`), `.ahk`, `.ipynb`, серверные шаблоны движков (`.erb`, `.ejs`, `.jsp`, `.cshtml`, `.razor`, `.twig`, `.blade.php`, `.pug`, `.haml`). Новый язык добавляется одной строкой в таблицу профилей `scan.mjs`.

## Правила

| Правило | Severity | Суть |
| --- | --- | --- |
| `multi-line-comment` | error | комментарий занимает 2+ строки подряд (doc-блоки и `///` doc-раны исключены) |
| `changelog-marker` | error | комментарий пересказывает дифф: пара слабых маркеров (было/стало, вместо/теперь, previously/instead of, …) в одном comment-run или сильный маркер (`this fixes`, `must take over`, `was X, now Y`, `broke, so`) сам по себе; одиночный слабый маркер — обычная проза и не флагует |
| `long-comment` | error | строка комментария длиннее 120 символов (doc-блоки исключены) |
| `vend/step-numbered` | warning | нумерованный шаг в комментарии (Step N / Шаг N / Schritt N / Étape N / Paso N / N., маркер любого языка) |
| `vend/section-divider` | warning | строка-разделитель из символов -=#* |
| `vend/markdown-in-comment` | warning | markdown-разметка внутри комментария (**, -, \|); строка таблицы требует минимум три пайпа (`\| a \| b \|`), одиночный `\|flag\|` в прозе не флагается |
| `vend/this-function-opener` | warning | комментарий начинается с «This function/class/method/component», «Эта функция/Этот класс», «Diese Funktion», «Cette fonction» или «Esta función» |
| `vend/file-summary-header` | warning | шапка-резюме из 2+ строк комментария в начале файла |
| `vend/generic-todo` | warning | TODO без ссылки на тикет |
| `vend/self-suppression` | warning | директива подавления без списка правил пришла вместе с подавляемым кодом |
| `vend/cjk-noise` | warning | CJK-иероглифы склеены с латиницей или цифрами в code-части строки (артефакт генерации) |
| `vend/zero-width-chars` | error | невидимый символ нулевой ширины (U+200B, U+200C, U+200D, U+2060, U+FEFF или escape-форма) |
| `vend/bidi-controls` | error | BiDi-контролы (U+202A–U+202E, U+2066–U+2069 или escape-форма) переопределяют направление текста |

Error-правила не применяются к doc-блокам (JSDoc `/** … */`, Python-docstring и `///` doc-строки — dartdoc, rustdoc, C# XML doc): контрактная документация классов и функций допустима любой длины. Внутри doc-блоков по-прежнему ловятся changelog-маркеры (error) и пересказ сигнатуры «This function…» (warning).

Текстовые правила (`step-numbered`, `markdown-in-comment`, `this-function-opener`) матчатся по тексту после срезания маркера комментария, поэтому работают во всех профилях — `# Шаг 3` в yaml и `-- Step 3` в sql ловятся одинаково. `step-numbered`, `this-function-opener` и `changelog-marker` понимают RU+EN+DE+FR+ES («Шаг N», «Schritt N», «Étape N», «Diese Funktion», «au lieu de», «ya no» и т.п.); прочие естественные языки не покрыты. Структурные правила (multi-line, divider, header, todo) от языка формулировок не зависят. `step-numbered` и `markdown-in-comment` внутри doc-блоков не срабатывают.

Полное обоснование по правилу (Why / Instead of / Write / Ignore it when из той же таблицы `RULES`):

```
node skill/scripts/scan.mjs --explain <rule-id>
```

id правил и служебные лейблы — EN; сообщения и обоснования — RU. Префикс `vend/` = правила, вендоренные из внешних каталогов паттернов.

Детектор видит inline-комментарии после кода (`const x = 1 // было`), блоковые комментарии без маркера на средних строках, doc-блоки любой длины (контрактные JSDoc/docstring), файлы в UTF-16 с BOM; zero-width символы (U+200B–U+200F, U+FEFF) срезаются при матчинге маркеров и одновременно флагаются как находки по сырым строкам вместе с BiDi-контролами (U+202A–U+202E, U+2066–U+2069) — включая escape-формы в исходнике; ZWJ внутри эмодзи-последовательностей и BOM в позиции 0 не флагаются. CJK-смежность с латиницей или цифрами проверяется только в code-части строки: китайские комментарии и i18n-строки без смежности с латиницей легитимны. В prose-форматах (`.md`/`.mdx`/`.html`/`.xml`/`.rst`/`.adoc`) CJK-смежность не проверяется вовсе: смешанная JP/CN-проза с латинскими брендами там норма. Не сканируются: языки без профиля (см. таблицу выше; `.m` неоднозначно), бинарные и офисные форматы; `--staged` и `--diff` не видят неотслеживаемые файлы. Warning не блокируют гейт, если не указан `--strict`. Имена файлов с не-ASCII поддерживаются в diff-режимах. Пропускаются каталоги артефактов (`venv`, `build`, `.next`, `target`, `out`, `.gradle`, `Pods`, `__pycache__`, `.idea`, `.codegraph`, `site-packages`, `.dart_tool`). Лицензионные шапки исключены из правила multi-line. Inline-комментарии определяются по маркерам профиля (`//`, `#`, `--`, `%`, `;`, `!`) за исключением py/fs floor division (`//`).

**Что обходит полный скан.** Внутри git-репозитория `scan` перечисляет файлы через `git ls-files --cached --others --exclude-standard`, поэтому всё gitignored невидимо: `__pycache__`, `.venv`, вывод сборки, вендорные деревья, загруженные тулчейны, упакованные рантаймы, минифицированные бандлы, скомпилированный `.dart.js`. Вне репо — прежний обход каталогов. YAML block scalars (`key: |`, `- >`) — строковый контент, а не комментарий: их строки никогда не флагуются.

**Сгенерированные файлы эксемптся от slop-правил** во всех режимах (полный скан, diff, write-time гейт) — слои детекции, пользовательские сигналы и рубильники описаны в разделе [Сгенерированный код](#сгенерированный-код). Файл, у которого в первых 8 КБ есть NUL-байт, считается бинарным и пропускается (UTF-16 с BOM декодируется раньше, поэтому бинарным не считается).

## Сгенерированный код

Сгенерированные файлы эксемптся от slop-правил во всех режимах (полный скан, diff, write-time гейт). Три слоя детекции, достаточно любого:

1. **Уникальные суффиксы имён**, которые никто не пишет руками: build_runner (`*.g.dart`, `*.freezed.dart`, `*.gr.dart`, `*.chopper.dart`, `*.pb*.dart`), protoc (`*_pb2.py`, `*_pb2.pyi`, `*_pb.go`, `*_grpc.pb.go`, `*.pb.cc/h/hpp/cpp`, `*.pb.mojom.*`), Kubernetes `zz_generated.*`, stringer `*_string.go`, sqlc (`*.sql.go`, `*.querier.go`), .NET (`*.Designer.cs`, `*.g.i.cs`, `*AssemblyAttributes.cs`, `GlobalUsings.g.cs`), бандлы (`*.min.js`, `*.min.css`, `*.bundle.js`). Неоднозначные имена (`*.gen.go`, `*.generated.ts`, `*_Factory.java`, `*.g.cs`, `mock_*.go`, `*.d.ts`) намеренно **не** эксемптся по имени — слишком много ложных срабатываний; они эксемптся только через заголовок ниже.
2. **Tool-named заголовки** в первых 10 строках: `@generated`, `Code generated by … DO NOT EDIT`, `generated code - do not modify by hand`, `<auto-generated`, `automatically generated by rust-bindgen`, `@generated by prost-build`, `@javax.annotation.Generated(`, `generated by openapi-generator`, `code generated by sqlc`.
3. **Ад-хок генераторы**: в первых 10 строках одновременно слово о генерации (`generat…`/`codegen`) и запрет правки (`do not edit/modify`). Голый `DO NOT EDIT` без слова о генерации не эксемптит — рукописные policy-файлы продолжают линтоваться.

Поверх слоёв — два пользовательских сигнала: строка `.gitattributes` с `linguist-generated` (конвенция GitHub linguist) и список `generatedPaths` в `.stop-ai-slop.yaml` (та же префиксная семантика, что у `excludePaths`).

Семантика: на сгенерированном файле slop-правила эксемптся, но security-правила `vend/zero-width-chars`, `vend/bidi-controls` и `vend/cjk-noise` продолжают флагать — отравленный codegen это supply-chain сигнал, а не вопрос стиля. Write-time гейт игнорирует сгенерированные файлы целиком (машинный вывод — не момент учить стилю). `scanGenerated: true` в `.stop-ai-slop.yaml` линтует сгенерированный код как обычный.

## Бенч (FP-регрессионная когорта)

`--bench` пинит когорту из 8 зрелых OSS-репозиториев (все SHA датированы до 2025-01-01 — таблица `BENCH_COHORT` в `skill/scripts/scan.mjs`), сканирует каждый сырым пайплайном правил (без конфига и baseline) и считает находки по id правил. Сравнение счётчиков с закоммиченным `bench-history.json` ловит регрессии ложных срабатываний: рост счётчика любого правила на пин-дереве значит, что правка правила принесла новые ложняки. Только счётчики, без скоринга.

```
node skill/scripts/scan.mjs --bench         # счётчики по репо и правилам + дельта против bench-history.json
node skill/scripts/scan.mjs --bench-write   # перезаписать bench-history.json текущими счётчиками
```

Семантика: рост счётчика любого правила в любом репо — регрессия: `--bench` печатает дельту и выходит с кодом 1. Падения и равенства — норма (exit 0). Отсутствие `bench-history.json` трактуется как пустая история (всё считается ростом) с подсказкой запустить `--bench-write`. Файл истории закоммичен в репозиторий — это пин-эталон ложных срабатываний.

Первый запуск требует сеть и git: каждый репозиторий клонируется один раз (`git init` + `fetch --depth 1 <sha>`) в `~/.cache/stop-ai-slop/bench/<owner>--<name>` (переопределяется `STOP_AI_SLOP_BENCH_CACHE`). Последующие запуски переиспользуют кэш; кэш на чужом SHA перекачивается. Ошибка fetch — exit 2.

Обновление когорты: правите `BENCH_COHORT` (репо + пин SHA), перезапускаете `--bench-write`, ревьюите дельту `bench-history.json` в PR — рост счётчика обязан объясняться истинными срабатываниями, иначе правка правила это регрессия ложняков.

## Сравнение с аналогами

Факты по README конкурентов (aislop, ai-slop-linter, vibecheck-slop-stopper, slop-scan, windbag), сентябрь 2026 (перепроверено 2026-09-28).

| | stop-ai-slop | aislop | ai-slop-linter | vibecheck | slop-scan | windbag |
| --- | --- | --- | --- | --- | --- | --- |
| Что сканирует | комментарии в коде, 13 правил | код-слоп: 50+ правил, 10 языков | проза: коммиты, PR, docs, 21 правило | 78 grep-правил всех категорий | JS/TS: error-handling, моки | комментарии-пересказы изменений, 5 правил (HISTORY_NARRATION, HEDGE_LANGUAGE, TICKET_ID, VERBOSE_COMMENT, OBVIOUS_COMMENT), 10 языков |
| Блокирует в момент правки | да: OpenCode-плагин отклоняет edit/write | хуки claude/cursor/gemini/pi, OpenCode нет | нет | нет: skill просит LLM самому прогнать grep | нет | да в Claude Code (PostToolUse-хук блокирует), в OpenCode нет |
| Русский язык | changelog-маркеры ru+en, плюс пакеты маркеров de/fr/es | правила EN | правила EN; их же бенч: em-dash на корректной русской прозе — 24 срабатывания на 1000 слов | EN | EN | только EN |
| Зависимости | 0: сканер — один .mjs; плагин OpenCode — .ts | npm-пакет + внешние движки (biome, ruff, oxlint) | 0 (npm-пакет, нулевые runtime-зависимости) | Python + ripgrep | npm-пакет | Rust-бинарь в виде PyPI wheel |
| Модель гейта | политика: правило → exit 1 | скор 0–100 и порог failBelow | взвешенный скор на 1000 слов | уровни severity | скор и delta-сравнение | нарушения по строкам, блокирует хук |
| Своя политика | таблица RULES в одном файле, `--explain` по правилу | severity на правило, новые правила — только в их репо | ignore/only по файлам | rules.toml | config и плагины | не документирована |
| Источник фактов | README конкурентов: scanaislop/aislop, Bubblegunn/ai-slop-linter, qinnovates/vibecheck-slop-stopper, modem-dev/slop-scan, scale-venture-partners/windbag (сентябрь 2026, перепроверено 2026-09-28) | — | — | — | — | — |

Где мы уже и не претендуем: только политика комментариев. Проглоченные исключения, `as any`, мёртвый код — территория aislop и grain; EN-проза и сообщения коммитов — ai-slop-linter. stop-ai-slop дополняет их в точках, куда они не достают: момент правки в OpenCode и русские changelog-маркеры.

## Лицензия

MIT — см. [LICENSE](LICENSE).
