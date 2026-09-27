# stop-ai-slop

[![license](https://img.shields.io/github/license/WhiteBite/stop-ai-slop)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![zero-deps](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

> English abstract: stop-ai-slop is a zero-dependency comment-slop gate. One scanner (`skill/scripts/scan.mjs`, const `RULES`) is the single source of truth for a one-line/why-only comment policy. It is enforced at four points: an OpenCode write-time plugin that blocks `write`/`edit`/`multiedit`, a pre-commit hook installed via `--install`, a cross-agent skill (`skill/SKILL.md`), and a baseline file that grandfathers legacy code. Node >= 18, works on win32.

## Установка из npm

```
npm i -D stop-ai-slop
npx stop-ai-slop --install        # npm scripts + pre-commit hook в текущем репо
```

Write-time плагин OpenCode из установленного пакета: файл `~/.config/opencode/plugins/comment-gate.ts` из одной строки `export { CommentGate } from "<путь к node_modules>/stop-ai-slop/plugin/comment-gate.ts"`.

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

## Конфиг

Необязательный файл `.stop-ai-slop.yaml` в корне репозитория (там же, где baseline: корень git, а вне репо — каталог сканирования). Читается режимами `scan`, `--staged`, `--diff`; write-time плагин OpenCode конфиг не читает и работает с дефолтами. Парсер — zero-dep подмножество YAML: скаляры `ключ: значение`, списки через `- `, секция `rules:` с двухпробельным отступом, `#`-комментарии и пустые строки пропускаются, значения могут быть в кавычках. Неизвестные ключи игнорируются; недопустимое severity — exit 2 с именем файла и номером строки.

| Ключ | Семантика |
| --- | --- |
| `maxCommentLength` | порог длины строки комментария для `long-comment` (по умолчанию 120) |
| `excludePaths` | список относительных путей-префиксов: путь исключается, если равен записи или начинается с `запись/`; работает в полном сканировании и в diff-режимах |
| `rules` | override severity по id правила: `error`, `warning` или `off` (правило отключено) |

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
| `multi-line-comment` | error | комментарий занимает 2+ строки подряд (doc-блоки исключены) |
| `changelog-marker` | error | комментарий пересказывает дифф (было/стало/раньше/вместо/fixes) |
| `long-comment` | error | строка комментария длиннее 120 символов (doc-блоки исключены) |
| `vend/step-numbered` | warning | нумерованный шаг в комментарии (Step N / Шаг N / Schritt N / Étape N / Paso N / N., маркер любого языка) |
| `vend/section-divider` | warning | строка-разделитель из символов -=#* |
| `vend/markdown-in-comment` | warning | markdown-разметка внутри комментария (**, -, \|); строка таблицы требует минимум три пайпа (`\| a \| b \|`), одиночный `\|flag\|` в прозе не флагается |
| `vend/this-function-opener` | warning | комментарий начинается с «This function/class/method/component», «Эта функция/Этот класс», «Diese Funktion», «Cette fonction» или «Esta función» |
| `vend/file-summary-header` | warning | шапка-резюме из 2+ строк комментария в начале файла |
| `vend/generic-todo` | warning | TODO без ссылки на тикет |
| `vend/cjk-noise` | warning | CJK-иероглифы склеены с латиницей или цифрами в code-части строки (артефакт генерации) |
| `vend/zero-width-chars` | error | невидимый символ нулевой ширины (U+200B, U+200C, U+200D, U+2060, U+FEFF или escape-форма) |
| `vend/bidi-controls` | error | BiDi-контролы (U+202A–U+202E, U+2066–U+2069 или escape-форма) переопределяют направление текста |

Error-правила не применяются к doc-блокам (JSDoc `/** … */` и Python-docstring): контрактная документация классов и функций допустима любой длины. Внутри doc-блоков по-прежнему ловятся changelog-маркеры (error) и пересказ сигнатуры «This function…» (warning).

Текстовые правила (`step-numbered`, `markdown-in-comment`, `this-function-opener`) матчатся по тексту после срезания маркера комментария, поэтому работают во всех профилях — `# Шаг 3` в yaml и `-- Step 3` в sql ловятся одинаково. `step-numbered`, `this-function-opener` и `changelog-marker` понимают RU+EN+DE+FR+ES («Шаг N», «Schritt N», «Étape N», «Diese Funktion», «au lieu de», «ya no» и т.п.); прочие естественные языки не покрыты. Структурные правила (multi-line, divider, header, todo) от языка формулировок не зависят. `step-numbered` и `markdown-in-comment` внутри doc-блоков не срабатывают.

Полное обоснование по правилу (Why / Instead of / Write / Ignore it when из той же таблицы `RULES`):

```
node skill/scripts/scan.mjs --explain <rule-id>
```

id правил и служебные лейблы — EN; сообщения и обоснования — RU. Префикс `vend/` = правила, вендоренные из внешних каталогов паттернов.

Детектор видит inline-комментарии после кода (`const x = 1 // было`), блоковые комментарии без маркера на средних строках, doc-блоки любой длины (контрактные JSDoc/docstring), файлы в UTF-16 с BOM; zero-width символы (U+200B–U+200F, U+FEFF) срезаются при матчинге маркеров и одновременно флагаются как находки по сырым строкам вместе с BiDi-контролами (U+202A–U+202E, U+2066–U+2069) — включая escape-формы в исходнике; ZWJ внутри эмодзи-последовательностей и BOM в позиции 0 не флагаются. CJK-смежность с латиницей или цифрами проверяется только в code-части строки: китайские комментарии и i18n-строки без смежности с латиницей легитимны. Не сканируются: языки без профиля (см. таблицу выше; `.m` неоднозначно), бинарные и офисные форматы; `--staged` и `--diff` не видят неотслеживаемые файлы. Warning не блокируют гейт, если не указан `--strict`. Имена файлов с не-ASCII поддерживаются в diff-режимах. Пропускаются каталоги артефактов (`venv`, `build`, `.next`, `target`, `out`, `.gradle`, `Pods`, `__pycache__`, `.idea`, `.codegraph`, `site-packages`, `.dart_tool`). Лицензионные шапки exempt from multi-line rule. Inline-комментарии определяются по маркерам профиля (`//`, `#`, `--`, `%`, `;`, `!`) за исключением py/fs floor division (`//`).

## Сравнение с аналогами

Факты по README конкурентов (aislop, ai-slop-linter, vibecheck-slop-stopper, slop-scan), сентябрь 2026.

| | stop-ai-slop | aislop | ai-slop-linter | vibecheck | slop-scan |
| --- | --- | --- | --- | --- | --- |
| Что сканирует | комментарии в коде, 9 правил | код-слоп: 50+ правил, 10 языков | проза: коммиты, PR, docs, 20 правил | 78 grep-правил всех категорий | JS/TS: error-handling, моки |
| Блокирует в момент правки | да: OpenCode-плагин отклоняет edit/write | хуки claude/cursor/gemini/pi, OpenCode нет | нет | нет: skill просит LLM самому прогнать grep | нет |
| Русский язык | changelog-маркеры ru+en, плюс пакеты маркеров de/fr/es | правила EN | правила EN; их же бенч: em-dash на корректной русской прозе — 24 срабатывания на 1000 слов | EN | EN |
| Зависимости | 0: сканер — один .mjs; плагин OpenCode — .ts | npm-пакет + внешние движки (biome, ruff, oxlint) | npm-пакет | Python + ripgrep | npm-пакет |
| Модель гейта | политика: правило → exit 1 | скор 0–100 и порог failBelow | взвешенный скор на 1000 слов | уровни severity | скор и delta-сравнение |
| Своя политика | таблица RULES в одном файле, `--explain` по правилу | severity на правило, новые правила — только в их репо | ignore/only по файлам | rules.toml | config и плагины |
| Источник фактов | README конкурентов: scanaislop/aislop, Bubblegunn/ai-slop-linter, qinnovates/vibecheck-slop-stopper, modem-dev/slop-scan (сентябрь 2026) | — | — | — | — |

Где мы уже и не претендуем: только политика комментариев. Проглоченные исключения, `as any`, мёртвый код — территория aislop и grain; EN-проза и сообщения коммитов — ai-slop-linter. stop-ai-slop дополняет их в точках, куда они не достают: момент правки в OpenCode и русские changelog-маркеры.
