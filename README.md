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
node skill/scripts/scan.mjs --strict          # warning тоже блокируют гейт (exit 1)
node skill/scripts/scan.mjs --install         # npm scripts + pre-commit hook в текущем репо
node skill/scripts/scan.mjs --install --strict  # то же самое, но hook запускает --strict
node skill/scripts/scan.mjs --baseline-write    # записать текущие находки в baseline
node skill/scripts/scan.mjs --baseline-prune    # удалить из baseline записи без живых находок
node skill/scripts/scan.mjs --help              # справка по всем флагам
```

Директивы подавления: `// stop-ai-slop-ignore-next-line [rule-id]` (следующая строка), `// stop-ai-slop-ignore-line [rule-id]` (текущая строка), `// stop-ai-slop-ignore-file` (весь файл); после `--` — причина.

Exit 1 — есть error-находки вне baseline; иначе 0. Exit 2 — ошибка использования или git (неверный флаг, несуществующий ref).

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

Action сам подтягивает базовый реф, поэтому стандартного shallow checkout достаточно; `strict: "true"` включает режим warnings-as-errors. На push-событиях action не работает (нет `github.base_ref`) — используйте `pull_request` или передавайте base явно.

## Релизы в npm

Первая публикация нового пакета идёт с 2FA вручную: `npm publish --otp=<код>` или granular-токен с правом publish в `~/.npmrc`. Дальше — OIDC trusted publishing без токенов: после первой публикации на npmjs.com → Settings пакета → Trusted publishers добавить `WhiteBite/stop-ai-slop` и workflow `publish.yml`; воркфлоу `.github/workflows/publish.yml` срабатывает на published-release, сравнивает версию с опубликованной (повтор не пушит) и публикует с provenance (Node 24 даёт npm ≥ 11.5.1, необходимый для OIDC).

## Монтаж на другую машину

```
git clone https://github.com/WhiteBite/stop-ai-slop <path>
New-Item -ItemType Junction -Path "$env:USERPROFILE\.config\opencode\skills\stop-ai-slop" -Target "<path>\skill"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\stop-ai-slop" -Target "<path>\skill"
```

Write-time плагин OpenCode: файл `%USERPROFILE%\.config\opencode\plugins\comment-gate.ts` из одной строки
`export { CommentGate, detectCommentSlop } from "<path>/plugin/comment-gate.ts"`.
Эквивалент для cmd.exe — `mklink /J`; на Linux/macOS — `ln -s`. В любом git-репо без агентов работает `scan.mjs --install`.

## Отладка

### pre-commit framework
```yaml
repos:
  - repo: https://github.com/WhiteBite/stop-ai-slop
    rev: v0.2.0
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

Шаблон `idea/filewatchers/stop-ai-slop.xml` — готовый импорт через Settings → Tools → File Watchers → + → Import. После импорта заменить `<path-to-scan.mjs>` на абсолютный путь к `skill/scripts/scan.mjs` на вашей машине. Поддерживаемые типы: Kotlin, Java, TypeScript, JavaScript, Python, YAML. Запуск по каждому изменению файла; исключения из сканирования — стандартные каталоги артефактов (`venv`, `node_modules`, `.git`, `build`, `target`, `.next`, `out`, `Pods`, `site-packages`, `.dart_tool`, `.gradle`).

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

Синтаксис комментариев берётся из профиля языка, а не из общего списка: `#` — комментарий в `.py/.sh/.yaml`, но препроцессор в `.c` и атрибут в `.rs`. Поддержано 120 расширений и 10 имён файлов: `Dockerfile`, `Containerfile`, `Makefile`, `GNUmakefile`, `Justfile`, `Rakefile`, `Vagrantfile`, `Gemfile`, `CMakeLists.txt`, `Jenkinsfile`; суффиксные варианты (`Dockerfile.dev`, `Makefile.am`) определяются по префиксу.

| Профиль | Линейный комментарий | Блок / doc | Примеры |
| --- | --- | --- | --- |
| c-family | `//` | `/* */`, `/** */`, `{/* */}` | ts, js, kt, java, go, rs, cs, c, cpp, swift, dart, scala |
| css | `//`, `/*` | `/* */` | css, scss, less |
| py | `#` | `"""` / `'''` | py |
| hash | `#` | — | rb, php, sh, yaml, toml, tf, ex, Dockerfile, Makefile |
| powershell | `#` | `<# #>` | ps1, psm1 |
| julia | `#` | `#= =#` | jl |
| nim | `#` | `#[ ]#` | nim |
| sql | `--` | `/* */` | sql |
| lua / haskell | `--` | `--[[ ]]` / `{- -}` | lua, hs |
| lisp | `;` | — | clj, el, scm, rkt |
| percent | `%` | — | tex, bib, erl |
| fortran / vb / batch / vim | `!` / `'` / `::`, `REM` / `"` | — | f90, vb, bat, vim |
| rst | `..` | — | rst |
| markup | `<!--` | `<!-- -->` | html, xml, svg, md, mdx |
| vue | `//`, `/*`, `<!--` | `/* */`, `{/* */}`, `<!-- -->` | vue, svelte, astro |
| ocaml | `(*` | `(* *)` | ml, mli |
| pascal | `//`, `(*` | `(* *)` | pas, fs (F#) |
| ini / properties | `;`, `#` / `#`, `!` | — | ini, properties |

`.m` не сканируется: расширение неоднозначно (Objective-C против MATLAB). Новый язык добавляется одной строкой в таблицу профилей `scan.mjs`.

## Правила

| Правило | Severity | Суть |
| --- | --- | --- |
| `multi-line-comment` | error | комментарий занимает 2+ строки подряд (doc-блоки исключены) |
| `changelog-marker` | error | комментарий пересказывает дифф (было/стало/раньше/вместо/fixes) |
| `long-comment` | error | строка комментария длиннее 120 символов (doc-блоки исключены) |
| `vend/step-numbered` | warning | нумерованный шаг в комментарии (// Step N или // N.) |
| `vend/section-divider` | warning | строка-разделитель из символов -=#* |
| `vend/markdown-in-comment` | warning | markdown-разметка внутри комментария (**, -, \|) |
| `vend/this-function-opener` | warning | комментарий начинается с «This function/class/method/component» |
| `vend/file-summary-header` | warning | шапка-резюме из 2+ строк комментария в начале файла |
| `vend/generic-todo` | warning | TODO без ссылки на тикет |

Error-правила не применяются к doc-блокам (JSDoc `/** … */` и Python-docstring): контрактная документация классов и функций допустима любой длины. Внутри doc-блоков по-прежнему ловятся changelog-маркеры (error) и пересказ сигнатуры «This function…» (warning).

Полное обоснование по правилу (Why / Instead of / Write / Ignore it when из той же таблицы `RULES`):

```
node skill/scripts/scan.mjs --explain <rule-id>
```

id правил и служебные лейблы — EN; сообщения и обоснования — RU. Префикс `vend/` = правила, вендоренные из внешних каталогов паттернов.

Детектор видит inline-комментарии после кода (`const x = 1 // было`), блоковые комментарии без маркера на средних строках, doc-блоки любой длины (контрактные JSDoc/docstring), файлы в UTF-16 с BOM; zero-width символы игнорируются при матчинге. Не сканируются: языки без профиля (см. таблицу выше; `.m` неоднозначно), бинарные и офисные форматы; `--staged` и `--diff` не видят неотслеживаемые файлы. Warning не блокируют гейт, если не указан `--strict`. Имена файлов с не-ASCII поддерживаются в diff-режимах. Пропускаются каталоги артефактов (`venv`, `build`, `.next`, `target`, `out`, `.gradle`, `Pods`, `__pycache__`, `.idea`, `site-packages`, `.dart_tool`). Лицензионные шапки exempt from multi-line rule. Inline-комментарии определяются по маркерам профиля (`//`, `#`, `--`, `%`, `;`, `!`) за исключением py/fs floor division (`//`).

## Сравнение с аналогами

Факты по README конкурентов (aislop, ai-slop-linter, vibecheck-slop-stopper, slop-scan), сентябрь 2026.

| | stop-ai-slop | aislop | ai-slop-linter | vibecheck | slop-scan |
| --- | --- | --- | --- | --- | --- |
| Что сканирует | комментарии в коде, 9 правил | код-слоп: 50+ правил, 10 языков | проза: коммиты, PR, docs, 20 правил | 78 grep-правил всех категорий | JS/TS: error-handling, моки |
| Блокирует в момент правки | да: OpenCode-плагин отклоняет edit/write | хуки claude/cursor/gemini/pi, OpenCode нет | нет | нет: skill просит LLM самому прогнать grep | нет |
| Русский язык | changelog-маркеры ru+en | правила EN | правила EN; их же бенч: em-dash на корректной русской прозе — 24 срабатывания на 1000 слов | EN | EN |
| Зависимости | 0: сканер — один .mjs; плагин OpenCode — .ts | npm-пакет + внешние движки (biome, ruff, oxlint) | npm-пакет | Python + ripgrep | npm-пакет |
| Модель гейта | политика: правило → exit 1 | скор 0–100 и порог failBelow | взвешенный скор на 1000 слов | уровни severity | скор и delta-сравнение |
| Своя политика | таблица RULES в одном файле, `--explain` по правилу | severity на правило, новые правила — только в их репо | ignore/only по файлам | rules.toml | config и плагины |
| Источник фактов | README конкурентов: scanaislop/aislop, Bubblegunn/ai-slop-linter, qinnovates/vibecheck-slop-stopper, modem-dev/slop-scan (сентябрь 2026) | — | — | — | — |

Где мы уже и не претендуем: только политика комментариев. Проглоченные исключения, `as any`, мёртвый код — территория aislop и grain; EN-проза и сообщения коммитов — ai-slop-linter. stop-ai-slop дополняет их в точках, куда они не достают: момент правки в OpenCode и русские changelog-маркеры.
