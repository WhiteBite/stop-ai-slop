# Changelog

## Unreleased

- publish.yml: GitHub Release из тега с нотами из секции CHANGELOG (идемпотентно) + зеркало пакета в GitHub Packages как `@whitebite/stop-ai-slop` (scoped, идемпотентно); триггер `workflow_dispatch` для ручного прогона; релизы v0.2.1…v0.6.0 забэкфиллены

## 0.6.0

- `--pre-tool` понимает инструменты Gemini CLI и Qwen Code (`write_file`/`replace`), `apply_patch` Codex CLI (V4A-патчи, мультифайл) и неизвестные имена по форме payload (VS Code Copilot, Devin CLI); read-only инструменты не гейтятся
- `--install-hooks` — хук-конфиги для Codex CLI, VS Code Copilot (Preview) и Devin CLI + сниппеты для Gemini CLI/Qwen Code; идемпотентен, чужие хуки не затирает
- `--install-rules` — rules-файлы для Cursor, Windsurf, Aider, Cline, Devin и блок в copilot-instructions из таблицы RULES; чужой контент без маркера не затирается
- JSON Schema конфига `schema/stop-ai-slop.schema.json` (draft-07) с modeline для yaml-language-server; parity-гейты в self-test
- self-test: 242 PASS (+31 чек)

## 0.5.0

- plugin OpenCode: dual-поддержка 1.x + 2.x одним default-экспортом `{ id: "stop-ai-slop", server: CommentGate, setup }` — официальный migration-паттерн: 1.18.29+ вызывает `server()`, 2.x вызывает `setup()` с `ctx.tool.hook("execute.before")`; стаб `export { default }` требует >= 1.18.29, для старых 1.x остаётся `export { CommentGate }`; именованные экспорты сохранены
- README (EN+RU): стаб плагина теперь `export { default } from ...`; из примера убран `detectCommentSlop` — legacy-лоадер вызывает каждый функциональный экспорт как плагин
- self-test: чек `release-sync` — сверка версий `package.json` и `.claude-plugin/stop-ai-slop/plugin.json` (skip при отсутствии файлов); рассинхрон 0.3.1/0.4.0 устранён
- self-test: чек `plugin-v2-shape` — симуляция обоих лоадеров OpenCode (v1 server-хуки + v2 tool.hook) с отклонением slop-записи; skip на Node < 22.6
- docs/TECH_DEBT.md: секция OpenCode V2 readiness — V2 выпущен (v2.0.x), write-time хук в V2 существует, статус-кво и watch-триггер по npm latest
- bench-когорта из 8 пин-репозиториев до-2025: `--bench` сравнивает счётчики по правилам с `bench-history.json`, рост = регрессия = exit 1; `--bench-write` пишет эталон
- baseline v2 с fingerprint-ключами (hash правила + текст находки): правки выше baselined-строки больше не воскрешают легаси, изменённый текст флагается как новый слоп
- v1-файлы baseline (`relpath:line`) читаются до следующего `--baseline-write`
- `--baseline-prune` чистит пары ключей: `relpath:line` и её `fp:<hash>` удаляются вместе

## 0.4.0

- README переведён на английский (основной для поисковиков и ИИ-агентов), русский перенесён в README.ru.md; переключатель языков в обоих
- README: секция установки перестроена в «What you get, and what installs automatically» — таблица восьми точек приложения и явное «автоматически vs вручную» (EN + RU)
- `llms.txt` по спеке llmstxt.org v2 — индекс проекта для ИИ-агентов
- package.json: SEO-описание (~150 симв., keyword-first), 16 keywords, homepage/bugs/author, `test`-скрипт; версия plugin.json синхронизирована
- Репозиторная гигиена: AGENTS.md, CONTRIBUTING.md, issue-формы и PR-шаблон в .github/
- publish.yml: возвращён `--provenance` в `npm publish` — без него OIDC trusted publishing не происходит и публикация падала с E404 (v0.2.1, v0.3.0)
- scan несуществующего пути — exit 2 вместо молчаливого «чисто»; --pre-tool маппит edits у MultiEdit; rule-id верхним ключом конфига — exit 2 с подсказкой про отступ
- changelog-marker: EN-пара «was …, now …»; inline-комментарий после case-label ловится (colon-guard сужен до ://)
- hook-шаблон --install печатает причину и exit 2, если сканер перенесён; --help документирует --stdin-path
- rdjson: ruleId в code.value, top-level severity по максимуму находок; SARIF: driver.version
- Таблица сравнения: колонка windbag, у ai-slop-linter 0 зависимостей и 21 правило; RU README приведён к паритету с EN
- `--fix` — детерминированный autofix одним проходом по всей области скана (без агента/LLM): удаляет multi-line-ран, шапку-резюме, разделитель, чейнджлог-комментарий, снимает префикс «Step N:», вырезает реальные невидимые и BiDi-символы; затем рескан и отчёт, что чинится только головой. Идемпотентен
- `--fix --dry-run` — превью: unified-diff (контекст 2) всех планируемых правок по файлам и итог «запланировано N правок в M файлах; не чинится автоматически: K», ничего не записывая, exit 0
- Autofix-предохранители: escape-форма невидимых символов (предмет кода, BOM-тест) и легальный emoji-ZWJ не трогаются; suppression-директива `ignore-next-line` удаляется вместе со своей целью, чтобы не повиснуть; сгенерированные/бинарные файлы пропускаются
- changelog-marker: одиночный слабый маркер («вместо», «было», «instead of», «previously») — обычная проза и больше не error; флагует только пара слабых маркеров в одном comment-run или сильный маркер (this fixes, must take over, was X now Y, broke so)
- scan в git-репозитории обходит файлы через `git ls-files --cached --others --exclude-standard`: gitignored-мусор (кэши, venv, вендор, бандлы, артефакты сборки) невидим; вне репо — прежний обход каталогов
- Бинарные файлы (NUL в первых 8 КБ после декодирования UTF-16) пропускаются; `.pyc` и прочее больше не сканируется как текст
- `///` doc-комментарии — doc-блок в c-family профиле (dartdoc, rustdoc, C# XML doc): exempt от multi-line / long-comment / markdown-in-comment, как JSDoc
- YAML block scalars (`key: |`, `- >`) — строковый контент, а не комментарий: их строки не флагуются
- `vend/cjk-noise` не проверяется в prose-профилях (`.md`/`.mdx`/`.html`/`.xml`/`.rst`/`.adoc`): смешанная JP/CN-проза с латинскими брендами там норма
- generated-детекция по экосистемным конвенциям: суффиксы имён 8 стеков (build_runner, protoc py/go/c++/mojom, k8s `zz_generated`, stringer, sqlc, .NET, min/bundle), tool-named заголовки первых 10 строк, lax-пара «generat/codegen + do not edit», `.gitattributes` `linguist-generated`, `generatedPaths` в конфиге; голый «DO NOT EDIT» и шапка pg_dump больше не эксемптят, неоднозначные имена (`*.gen.go`, `*.generated.ts`, `*.g.cs`, `mock_*.go`, `*.d.ts`) эксемптятся только по заголовку
- slop-правила на сгенерированных файлах эксемптся, security-правила (`vend/zero-width-chars`, `vend/bidi-controls`, `vend/cjk-noise`) продолжают флагать — отравленный codegen это supply-chain сигнал; `scanGenerated: true` в конфиге снимает эксемпт; write-time гейт читает `scanGenerated` в режиме `--pre-tool`

## 0.3.0

- Новые языковые профили: dash (VHDL, Ada), hashblock (Nix, HCL, Terraform), coffee, adoc, handlebars, gotmpl; 160 расширений и 26 имён файлов
- Переразметка: `.tf`/`.tfvars` → hashblock, `.mod`/`.sum` (go.mod, go.sum) → hash, `.tmpl` → gotmpl
- profileFor: порядок матчинга точное имя файла → расширение → префикс имени; голый `BUILD` маппится в hash, не перехватывая `build.gradle`
- Блоковые комментарии с одинаковым токеном открытия и закрытия (`###`, `////`)
- `step-numbered` и `markdown-in-comment` работают во всех профилях (маркер комментария срезается перед матчингом), в doc-блоках не срабатывают
- Русские формулировки: «Шаг N» в step-numbered, «Эта функция/Этот класс» в this-function-opener
- `.codegraph` добавлен в каталоги артефактов, пропускаемые при сканировании
- `markdown-in-comment`: строка таблицы требует минимум три пайпа (`| a | b |`) — фикс ложного срабатывания на прозу вида `// |flag| значение`
- Маркеры changelog-marker / step-numbered / this-function-opener для de, fr, es: stattdessen, au lieu de, en lugar de; Schritt/Étape/Paso N; Diese/Cette/Esta Funktion
- Guard-фикстуры self-test на одиночные темпоральные слова (vorher, avant, antes, frühere) — не матчатся
- Три Unicode-правила по сырым строкам, включая escape-формы в исходнике: `vend/cjk-noise` (warning) — CJK-иероглифы, склеенные с латиницей или цифрами; `vend/zero-width-chars` (error) — невидимые символы U+200B–U+200D, U+2060, U+FEFF; `vend/bidi-controls` (error) — BiDi-контролы U+202A–U+202E, U+2066–U+2069
- ZWJ (U+200D) внутри эмодзи-последовательностей и BOM в позиции 0 исключены из находок
- CJK-смежность проверяется только в code-части строки: китайские комментарии и i18n-строки без смежности с латиницей легитимны
- `--format json` (rdjson для reviewdog) и `--format sarif` (2.1.0) в режимах scan/--staged/--diff; exit-коды не зависят от формата
- Конфиг `.stop-ai-slop.yaml`: override severity правил вплоть до off, maxCommentLength, excludePaths; zero-dep парсер подмножества YAML; write-time плагин конфиг не читает
- MCP-сервер `--mcp` (JSON-RPC 2.0 по stdio): три инструмента `slop_scan` / `slop_explain` / `slop_baseline`, согласование версий протокола `2024-11-05` / `2025-11-25` / `2026-07-28`; stdout несёт только protocol messages, логи в stderr
- `--pre-tool` и PreToolUse-хук в плагине Claude Code: блокировка Write/Edit до записи, exit 2 + stderr для многострочных находок; хук уже в `hooks.json` (matcher `Write|Edit`)
- GitLab CI-шаблон `templates/stop-ai-slop.gitlab-ci.yml`: stage test, image node:24-alpine, rules на merge_request_event, скрипт `--diff "$CI_MERGE_REQUEST_DIFF_BASE_SHA" --strict`
- VS Code problem matcher в README: однострочный pattern с fileLocation relative, owner external, source stop-ai-slop

## 0.2.1

- Пакет опубликован в npm как `stop-ai-slop`; строки установки и подключение плагина из node_modules в README.
- Сама версия 0.2.1 в реестр npm не попала: publish вернул E404 до настройки OIDC trusted publishing; содержимое вошло в публикацию 0.3.0.
- bin без `./`-префикса: npm publish больше не печатает normalize-ворнинг.
- Публикация по тегам `v*` через OIDC trusted publishing (воркфлоу `publish.yml`), без долгоживущих токенов.

## 0.2.0

- Языковые профили: ~110 расширений, 24 профиля; имена файлов с суффиксами (Containerfile, Jenkinsfile и т.д.)
- Inline-комментарии по профилям; doc-блоки исключены из multi-line / long-comment
- Лицензионные шапки исключены из multi-line правила
- Suppression-директивы (`stop-ai-slop-ignore-next-line`, `ignore-line`, `ignore-file`)
- Baseline из корня git + `--baseline-prune` для удаления записей без живых находок
- Аудит-лог решений плагина + `--audit` viewer
- `--diff`, `--strict`, `--help`, exit 2 для ошибок использования
- CRLF, quotepath, exec-bit хука, артект-директории, границы кириллицы
- CI dogfooding, pre-commit manifest, относительные пути скриптов, windows-latest раннер

Migration note: репо на Kotlin/JVM/Go/Rust/C-family впервые гейтятся с 0.2.0 — прогоните `scan .` и при необходимости `--baseline-write` для легаси.

## 0.1.0

- Initial: 9 правил, сканер, OpenCode write-time плагин, pre-commit через `--install`, skill
