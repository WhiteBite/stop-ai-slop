# Changelog

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
