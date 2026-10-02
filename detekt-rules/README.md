# detekt-rules — stop-ai-slop для Kotlin

Правила detekt, повторяющие таблицу `RULES` из `skill/scripts/scan.mjs`. Область — только `.kt` (профиль `cfamily`): таблица языковых профилей сюда не портирована, классификация комментариев идёт по PSI (EOL_COMMENT → строка, BLOCK_COMMENT → блок, KDoc и `///` → doc).

## Правила

| id | класс detekt | severity |
| --- | --- | --- |
| `multi-line-comment` | `StopAiSlopMultiLineComment` | Defect (error) |
| `changelog-marker` | `StopAiSlopChangelogMarker` | Defect (error) |
| `long-comment` | `StopAiSlopLongComment` | Defect (error) |
| `vend/step-numbered` | `StopAiSlopStepNumbered` | Style (warning) |
| `vend/section-divider` | `StopAiSlopSectionDivider` | Style (warning) |
| `vend/markdown-in-comment` | `StopAiSlopMarkdownInComment` | Style (warning) |
| `vend/this-function-opener` | `StopAiSlopThisFunctionOpener` | Style (warning) |
| `vend/file-summary-header` | `StopAiSlopFileSummaryHeader` | Style (warning) |
| `vend/generic-todo` | `StopAiSlopGenericTodo` | Style (warning) |
| `vend/cross-file-ref` | `StopAiSlopCrossFileRef` | Style (warning) |
| `vend/obvious-comment` | `StopAiSlopObviousComment` | Style (warning) |
| `vend/ai-plan-narration` | `StopAiSlopAiPlanNarration` | Style (warning) |
| `vend/ai-vocab-density` | `StopAiSlopAiVocabDensity` | Style (warning) |
| `vend/research-citation` | `StopAiSlopResearchCitation` | Style (warning) |
| `vend/cjk-noise` | `StopAiSlopCjkNoise` | Style (warning) |
| `vend/zero-width-chars` | `StopAiSlopZeroWidthChars` | Defect (error) |
| `vend/bidi-controls` | `StopAiSlopBidiControls` | Defect (error) |

`error` проецируется на `Severity.Defect`, `warning` — на `Severity.Style`. Тексты `Issue` берутся из `message` таблицы `RULES`, чтобы обе поверхности говорили одним голосом.

## Исключение

`vend/self-suppression` не портирован: правило живёт только в diff-режиме — ему нужен дифф добавленных строк (директива пришла в одной правке с кодом, который глушит), а в whole-file PSI-правиле это бессмысленно. Запись об исключении лежит в `rule-catalog.json`.

`vend/ticket-ref` не портирован: правило затворено конфигом — ему нужен `ticketPattern` в `.stop-ai-slop.yaml`, а у detekt-порта нет per-repo конфигурации. Запись об исключении лежит в `rule-catalog.json`.

## Сквозная семантика

- Директивы подавления `stop-ai-slop-ignore-next-line [ids]`, `-ignore-line [ids]`, `-ignore-file [ids]`, хвост `-- reason`. Пустой список правил глушит всё на цели.
- Лицензионная шапка (`isLicenseRun`) освобождает `multi-line-comment` и `vend/file-summary-header`.
- Doc-блоки: `changelog-marker`, `vend/this-function-opener` и `vend/ai-plan-narration` срабатывают и внутри; `step-numbered`, `markdown-in-comment`, `long-comment`, `cross-file-ref`, `obvious-comment` — нет; `multi-line-comment` doc-блоки не видит вовсе.
- Сгенерированные файлы (`GEN_NAME_SAFE`, `GEN_HEADER_STRICT`, пара `GEN_HEADER_LAX`) освобождены от slop-правил, но три security-правила (`vend/zero-width-chars`, `vend/bidi-controls`, `vend/cjk-noise`) срабатывают и там: отравленный codegen — supply-chain сигнал.
- Невидимые символы вырезаются из текста перед матчингом маркеров, а Unicode-правила работают по сырой строке.

## Каталог правил

`skill/scripts/gen-catalog.mjs` генерирует `rule-catalog.json` из `RULES`, чтобы порт не разъезжался с источником правды.

```
node skill/scripts/gen-catalog.mjs --write   # перезаписать каталог
node skill/scripts/gen-catalog.mjs --check   # exit 1 с читаемым дельта-выводом при расхождении
```

`--check` печатает `catalog: in sync` и выходит с кодом 0, когда каталог совпадает с `RULES`. Новое правило в `RULES` без `kotlinRule` или исключения — ошибка генерации (exit 2), а не тихий пропуск.

Дрейф порта от источника правды загейчен с двух сторон. `RuleCatalogParityTest` инстанцирует `StopAiSlopProvider` через публичный API и сверяет реально зарегистрированный набор с каталогом: имена классов в обе стороны, количество, id правил (исключённые id обязаны отсутствовать в порте) и маппинг severity (`error` → `Severity.Defect`, `warning` → `Severity.Style`). CI (`.github/workflows/detekt.yml`) запускает `gen-catalog.mjs --check` до gradle-шага, поэтому каталог не может протухнуть относительно `RULES`. Тексты `Issue` гейтом не сверяются: при изменении `message` в `RULES` описание правила в порте обновляется вручную.

## Тесты и подключение

```
gradle -p detekt-rules test
```

Подключение: `dependencies { detektPlugins(files("путь/к/detekt-rules.jar")) }` (или координаты после публикации).

```yaml
stop-ai-slop:
  active: true
  StopAiSlopMultiLineComment: { active: true }
  StopAiSlopChangelogMarker: { active: true }
  StopAiSlopLongComment: { active: true }
```