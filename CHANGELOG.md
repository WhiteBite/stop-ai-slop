# Changelog

## Unreleased

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
