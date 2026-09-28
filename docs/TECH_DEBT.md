# Техдолг и передача смены

Реестр остатка, ограничений и операционных заметок. Точка входа для следующей сессии: сначала этот файл, затем `AGENTS.md`. Состояние на коммит `e005ff7` (main, origin в синке).

## Текущее состояние

- npm `latest` = **0.4.0**. Всё после тега `v0.4.0` ещё не в реестре: baseline v2 (`f598c57`), `--bench`/`--bench-write` + `bench-history.json` (`8cc6223`), RU-зеркала (`e005ff7` и ранее). Следующий релиз — **0.5.0**.
- Проверки перед любым коммитом: `node skill/scripts/scan.mjs --self-test` (exit 0, ~209 PASS), `node skill/scripts/scan.mjs scan .` (exit 0), `gradle -p detekt-rules test` (BUILD SUCCESSFUL), pre-commit гейт срабатывает сам.
- Self-test живёт внутри `scan.mjs` (`cmdSelfTest`), чеки через `check(name, ok, detail)`; RED-фазы новых фич прогоняются тем же бинарником.

## Процедура релиза

1. bump `package.json` version (minor для фич, patch для фиксов).
2. `CHANGELOG.md`: `## Unreleased` → `## X.Y.Z`.
3. Коммит, `git tag vX.Y.Z`, `git push origin main --tags`.
4. `.github/workflows/publish.yml` публикует сам через OIDC trusted publishing; идемпотентен (пропускает, если версия уже в реестре). Провал публикации с E404 = не настроен trusted publisher на npmjs.com (Settings пакета → Trusted publishing → repo `WhiteBite/stop-ai-slop`, workflow `publish.yml`); лечится re-run упавшего run после настройки.
5. Реестр пропагирует несколько минут после success — не считать это провалом.

## Бэклог: отложено до триггера

| Пункт | Триггер | Эскиз решения |
| --- | --- | --- |
| Инкрементальный кеш сканирования | жалоба на скорость ИЛИ замер `scan .` > 3-5 с на монорепо (HDD/сетевой диск) | ключ mtime+size+hash(RULES+конфиг), инвалидация по версии сканера и изменению `.stop-ai-slop.yaml`; сейчас скан линейный по тексту, обычно < 1 с |
| Маркеры прозы ZH/JA | реальный спрос юзеров | иероглифы без границ слов: нужны фразовые словари, высокий FP-риск; текущий лимит языков RU+EN+DE+FR+ES зафиксирован в README/SKILL |
| Синхронизация detekt-порта с основным детектором | решение владельца: порт минимален намеренно ИЛИ синхронизируем | `detekt-rules/src/main/kotlin/whitebite/slop/StopAiSlopChangelogMarker.kt` отстаёт: нет weak-pair семантики (`CHANGELOG_WEAK`, scan.mjs:270), нет de/fr/es маркеров, нет Unicode-правил и generated-эксемпта. Тесты порта зелёные на своей семантике; расхождение — осознанное, не баг |
| Homebrew tap | спрос вне npm-аудитории | формула-обёртка над `npm i -g`; маргинально при npm-базе |
| Бенч-когорта: обновление пинов | плановое (раз в полгода) ИЛИ после смены правил, где хочется свежий срез | править `BENCH_COHORT` (scan.mjs:2870): repo + SHA до 2025-01-01 (GitHub API `commits?until=`), затем `--bench-write`, ревью дельты `bench-history.json` в PR: рост обязан объясняться истинными срабатываниями |

## Бэклог: отклонено с обоснованием

| Пункт | Почему нет |
| --- | --- |
| Docker-образ для CI | zero-dep npm CLI; CI закрыт GitHub Action (`action.yml`), GitLab-шаблоном (`templates/stop-ai-slop.gitlab-ci.yml`) и `npx`; образ = обслуживание base-image и registry ради сред, где нет Node, — у линтера JS-комментариев таких сред практически не бывает. Решено не делать |
| Score-модель 0-100 (как у aislop) | конфликтует с бинарной политикой «правило → exit 1» — это наш дифференциатор |
| LSP-сервер / VS Code-расширение | покрыто problem matcher в README (`tasks.json`); LSP = отдельный пакет и зависимость, против философии |
| Полный YAML-парсер для конфига | хватает zero-dep подмножества (скаляры, списки, секция rules); malformed severity → exit 2 с файлом и строкой |
| Веб-дашборд статистики | CLI-first; статистику отдают reviewdog/SARIF/codequality |
| npm-зависимости вообще | уникальное преимущество перед aislop (biome/ruff/oxlint) |

## Известные ограничения детектора (не баги, решения)

- `inlineComment` (scan.mjs:480): quote-parity эвристика ломается на template literals с `${}` и экранированных кавычках — inline-комментарий внутри такой строки может не выделиться. Приемлемо: влияет только на trailing-комментарии в редких строках.
- Вложенные блоковые комментарии OCaml `(* (* *) *)` закрываются на первой `*)` — построчный классификатор, не парсер.
- `multisetDiff` (scan.mjs:617): реордеринг строк не считается добавлением — корректная семантика diff-гейта, не терять при «улучшениях».
- `.m` не сканируется (Objective-C vs MATLAB), `.pp` замаплен на pascal (Puppet-комментарии `#` пропустятся) — неоднозначные расширения, решение зафиксировано в README.
- Не сканируются: COBOL, ассемблер (`.asm`/`.s`), `.ahk`, `.ipynb`, серверные шаблоны движков (`.erb`, `.ejs`, `.jsp`, `.cshtml`, `.razor`, `.twig`, `.blade.php`, `.pug`, `.haml`).
- `--staged`/`--diff` не видят неотслеживаемые файлы (ограничение git diff) — задокументировано.
- Write-time плагин OpenCode (`plugin/comment-gate.ts`) НЕ читает `.stop-ai-slop.yaml` — конфиг действует в CLI/diff/MCP-режимах; задокументировано в README «Configuration».
- PreToolUse-хук Claude Code: зависший хук НЕ блокирует вызов (таймаут command-хука 600 с, по докам Claude) — гейт обязан оставаться быстрым, не добавлять в `--pre-tool` сетевые/тяжёлые операции.
- MCP `tools/list` несёт `resultType: "complete"` (schema 2026-07-28); строго-консервативные клиенты могут ворчать на лишнее поле — принято осознанно, самопроверка live-сессией пройдена.

## Семантики, которые легко сломать невнимательной правкой

- Baseline v2 (`loadBaseline` scan.mjs:967, `fingerprint` :987, `maskBaselined` :999): fp = sha256(rule + "\n" + trimmed-строки находки).slice(0,16); файл = заголовок v2 + пары `rel:line` / `fp:<hash>`. Маскинг **с потреблением**: каждая baselined-вхождение гасит одну находку с тем же fp — вставленный повторно идентичный slop флагается. v1-файлы (только `rel:line`) маскируют по-старому до следующего `--baseline-write`. Не «улучшать» до чистого set-membership: сломается чек «baseline: новый слоп поверх легаси блокирует» (доказано эмпирически при вводе v2).
- Generated-детекция (`isGeneratedFile` scan.mjs:280, `SECURITY_RULES` :278): slop-правила на сгенерированных файлах эксемптся, security-правила (zero-width/bidi/cjk) — НЕТ (отравленный codegen = supply-chain сигнал). Эксепмт пост-детекционный фильтр во всех режимах, включая `--fix`; write-time гейт (`addedFromToolArgs`) игнорирует generated целиком, если не `scanGenerated: true`. Голый `DO NOT EDIT` без слова generat/codegen не эксемптит.
- Weak-pair семантика changelog-marker (scan.mjs:270): одиночный слабый маркер = проза, флагует пара слабых в одном comment-run ИЛИ один сильный. Не возвращаться к монолитному regex — были ложняки на обычной прозе.
- Unicode-правила работают по СЫРЫМ строкам до анти-evasion стрипа; сам `scan.mjs` собирает невидимые символы через `String.fromCodePoint`, чтобы не флагать собственный исходник — сохранять этот приём в фикстурах и regex-константах.

## Расхождения поверхностей (держать в голове)

- `README.md` (EN, основной) и `README.ru.md` (RU) — параллельные документы: каждая правка секций дублируется в оба (два раза уже делали: generated, bench). `llms.txt` ссылается на секции README — проверять якоря при переименованиях.
- `skill/scripts/scan.d.mts` — ручные type-декларации экспортов scan.mjs: менять синхронно с сигнатурами (`addedFromToolArgs` opts, `isGeneratedFile`).
- `.gitignore` vs локальный exclude: агент-каталоги `.omo/`, `.opencode/`, `.playwright-mcp/` лежат в `.git/info/exclude` (локально, по прецеденту `.codegraph`). В новых клонах их нет — если агенты станут нормой для контрибьюторов, перенести в публикуемый `.gitignore`.
- `plugin/comment-gate.ts` импортирует `addedFromToolArgs/detectCommentSlop/profileFor/RULES` из scan.mjs с 2-аргументной сигнатурой — любые изменения этих экспортов держать back-compatible.

## Операционные заметки

- **Параллельные сессии**: в этом репо периодически работает вторая агент-сессия (коммиты `98fea0f`, `d9ee473`, `3471d47` — её). Правила выживания: перед правкой `git status` + `git log --oneline -3`; чужой незакоммиченный WIP не коммитить и не откатывать без явной договорённости; зоны работ объявлять списком «не трогать» (файлы + символы); ломаное промежуточное состояние чужого WIP не чинить на своей ветке.
- QA-рецепты поверхностей (проверено live, повторять при правках соответствующих режимов): MCP — пайп NDJSON-сессии в `node skill/scripts/scan.mjs --mcp` (initialize/tools/list/tools/call/unknown-method), ожидать чистый JSON в stdout и exit 0 по закрытии stdin; PreToolUse — пайп JSON `{tool_name, tool_input}` в `--pre-tool`, slop → exit 2 + stderr, clean/Read → exit 0; конфиг — temp-каталог с `.stop-ai-slop.yaml` и cwd в нём (конфиг читается от git-root, вне репо — от cwd).
- Бенч требует сеть и git; кеш `~/.cache/stop-ai-slop/bench/<owner>--<name>` (override `STOP_AI_SLOP_BENCH_CACHE`). Счётчики когорты включают истинные находки в репо без политики (тысячи multi-line у PowerShell/redis) — смысл имеют только ДЕЛЬТЫ между запусками, не абсолютные числа.
- Комментарии в коде: ноль по умолчанию (гейт `comment-gate` + pre-commit); RU-строки для юзеров, EN-идентификаторы; коммиты — императив EN ≤100 символов, без трейлеров атрибуции.
