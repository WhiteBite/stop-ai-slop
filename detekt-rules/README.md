# detekt-rules — stop-ai-slop для Kotlin
Три ERROR-правила из `skill/scripts/scan.mjs`: `StopAiSlopMultiLineComment` (2+ строки комментария подряд, лицензионная шапка освобождена), `StopAiSlopChangelogMarker` (было/стало/раньше/вместо/теперь + EN-маркеры), `StopAiSlopLongComment` (строка > 120 символов, KDoc освобождён).
Тесты: `gradle -p detekt-rules test`. Подключение: `dependencies { detektPlugins(files("путь/к/detekt-rules.jar")) }` (или координаты после публикации).
detekt.yml:
```yaml
stop-ai-slop:
  active: true
  StopAiSlopMultiLineComment: { active: true }
  StopAiSlopChangelogMarker: { active: true }
  StopAiSlopLongComment: { active: true }
```
