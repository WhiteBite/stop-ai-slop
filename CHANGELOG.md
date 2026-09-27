# Changelog

## Unreleased

- Новые языковые профили: dash (VHDL, Ada), hashblock (Nix, HCL, Terraform), coffee, adoc, handlebars, gotmpl; 160 расширений и 26 имён файлов
- Переразметка: `.tf`/`.tfvars` → hashblock, `.mod`/`.sum` (go.mod, go.sum) → hash, `.tmpl` → gotmpl
- profileFor: порядок матчинга точное имя файла → расширение → префикс имени; голый `BUILD` маппится в hash, не перехватывая `build.gradle`
- Блоковые комментарии с одинаковым токеном открытия и закрытия (`###`, `////`)
- `step-numbered` и `markdown-in-comment` работают во всех профилях (маркер комментария срезается перед матчингом), в doc-блоках не срабатывают
- Русские формулировки: «Шаг N» в step-numbered, «Эта функция/Этот класс» в this-function-opener
- `.codegraph` добавлен в каталоги артефактов, пропускаемые при сканировании

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
