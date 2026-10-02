# Changelog

## 0.13.0

- новые правила: `vend/ticket-ref` (warning, конфиг-гейт: правило инертно, пока в `.stop-ai-slop.yaml` не задан `ticketPattern` — реальность паттерна типа `\bKRY-\d+\b` вместо generic `[A-Z]+-\d+`, который ловит RFC-3330/UTF-8/SHA-256; гварды TODO/ISSUE_LINK/CVE/GHSA, doc-блоки исключены) и `vend/research-citation` (warning: `(Cormen et al., 2009)`, `«(Иванов и др., 2023)»`, `arXiv:2407.12241`; bench: 3 допустимых warning на redis — провенанс HLL-математики)
- отвергнуто по bench-эвиденции (TECH_DEBT, секция 2026-10-02): `vend/commented-out-code` (268 находок при лимите 25 — зрелые репо несут слишком много реального S125) и `vend/assertion-without-invariant` (91 при лимите 8, vue 90: import-alias интерьеры + строковый контент)
- детектор: template-literal state machine для c-family профилей — `//` внутри бэктиков и `${}`-интерполяций больше не коммент (bench −2 реальных FP на PowerShell; попутно починен FN на экранированных кавычках); purity-сплит — `node:fs` вынесен в `src/diskio.mjs`, ядро детектора браузерно-чистое
- конфиг: `overrides` (per-path severity: список `{paths, rules}`, mini-glob `*`/`**`, без wildcard = prefix как excludePaths; порядок — позже-победит, override бьёт глобальный remap) + `ticketPattern` (regex-source, валидация при загрузке); `applyRuleConfig` матчит по `rel`-пути нахождения
- CLI: `--policy` (политика + таблица правил одной простынёй — кормит новый SessionStart-хук Claude-плагина: правила входят в контекст сессии до первой правки) и `--fix-suggestions` (строка `fix-suggestions: [{file,line,rule,kind,from,to}]` — JSON-действия из механических планов `--fix`, в text-режиме на stdout, в json/sarif на stderr)
- Kotlin-порт: `StopAiSlopAiVocabDensity` + `StopAiSlopResearchCitation` (19 сьют / 150 тестов, паритет каталога 4/4); excluded-записи каталога сжались до self-suppression и ticket-ref (config-gated)
- дистрибуция: Homebrew — `Formula/stop-ai-slop.rb` (npm-tarball + sha256, репо как собственный тап) с macOS-CI `brew.yml` (brew install + brew test на каждый чих формулы); VS Code extension `editors/vscode/` (zero-build CommonJS: scan-on-save → Problems, команды scanFile/scanWorkspace, настройка `stopAiSlop.command`, headless-тесты парсинга); playground `playground/` (Vite single-file 48 КБ: настоящий детектор в браузере, RU/EN, профиль-селектор, сэмплы; `dist/index.html` закоммичен — скачал и работает)
- self-test: 640 PASS (overrides 9, ticket-ref 13, template-literal 6, research-citation 9, policy 2, fix-suggestions 5, vscode 4, playground 5 + cli-smoke policy)

## 0.12.0

- новое правило `vend/ai-vocab-density` (warning): 3+ разных слов из ИИ-канона (delve, pivotal, tapestry, intricate… — 19 токенов, Wikipedia "Signs of AI writing" §3.1 минус код-литеральные существительные) в комментариях файла; порог плотности вместо одиночных срабатываний — ко-встречаемость статистически документирована (Juzek & Ward 2025, ACL Findings); bench: 0 находок на когорте из 8 репо; эксперимент — Kotlin-порт отложен (excluded-запись в каталоге)
- `vend/generic-todo` расширен: TODO_WORD ловит FIXME и XXX (HACK не включён — workaround-лейбл, а не debt-маркер, конфликтует с why-политикой); экземция по тикету наследуется; bench +28, все TP (PowerShell +12, redis +5, rack +4, vue +4, tokio +3); detekt-порт синхронизирован (тесты + паритет)
- новый режим `--doctor`: диагностика окружения — node >= 18, git, git-root, pre-commit хук (блок slop-gate + валидность вшитого пути сканера), npm scripts, парсинг `.stop-ai-slop.yaml`, baseline, opencode-stub; exit 1 только на поломках (сломанный путь после переноса сканера — документированная боль №1); i18n ru/en
- новый флаг `--annotations` (scan/--staged/--diff, text-вывод): workflow-команды GitHub Actions `::error|::warning file=,line=::` на каждую находку с экранированием `%`/CR/LF/`:` по спеке; input `annotations` (default true) в action.yml — находки кликабельны в PR; json/sarif не затронуты
- политика: секция «2026-10-02 policy review» в docs/TECH_DEBT.md — по эвиденции bench-когорты и adversarial-верификации отвергнуты hedge-language (FP на человеческих оговорках), ticket-ref (TICKET_REF матчит спек-имена), `--commit-msg` (скоуп README отдаёт prose в ai-slop-linter), per-path overrides (закрыто global remap + baseline + excludePaths); не-EN валидация когортой невозможна — зрелого не-EN-комментированного OSS не существует (6 репо × 300k+ строк)
- self-test: 580 PASS — новые чеки todo-word/doctor/annotations/ai-vocab + режим doctor в cli-smoke; задокументирован diff-mode FN obvious-коммента

## 0.11.0

- архитектура: монолит `scan.mjs` (2353 строки) распилен на 20 модулей `skill/scripts/src/` с ациклическим графом импортов; `scan.mjs` — bin + фасад на 35 строк с теми же 23 экспортами, `RULE_BY_ID` конструируется ровно один раз; self-test-проверки авто-дискаверятся из `skill/scripts/selftest/checks/*.mjs`, новый чек = новый файл (520 PASS против 277)
- единый источник правды: EN-тексты правил переехали в `RULES` (поле `en`), `RULE_TEXT_EN` стал вычисляемым экспортом; гейт `i18n-en-parity` требует полного EN-покрытия всех 15 правил (раньше EN-каталог не был загейчен и при пропуске правила `--lang en` молча печатал русский)
- генераторы с checked-in результатом и режимом `--check`: `gen-schema.mjs` (rule-id паттерн схемы и тег `$id` из package.json), `gen-catalog.mjs` (`detekt-rules/rule-catalog.json`), `gen-docs.mjs` (таблицы правил в README/README.ru/SKILL внутри маркеров `<!-- stop-ai-slop:rules:start/end -->`); npm-скрипты `gen:schema`/`gen:docs`/`gen:catalog`
- фикс гейта: `schema-parity-config` читал исходник `scan.mjs` и после распила проходил на комментарии, а не на коде — переведён на `src/config.mjs`; добавлен гейт `types-`, сверяющий объявления `scan.d.mts` с рантайм-экспортами фасада в обе стороны
- фикс: `--baseline-prune` на v1-baseline падал с `ReferenceError` (потерянные импорты в ветке, которую не покрывал ни один чек); добавлен `cli-smoke` — 22 режима CLI × 2 контекста baseline проверяются на неперехваченные исключения и на ожидаемые коды выхода
- детектор: U+200E/U+200F (LRM/RLM) больше не стрипаются молча — флагуются как `vend/bidi-controls`, но только в кодовой части строки, поскольку в комментариях и prose это легальная RTL-типографика; override/isolate-контролы U+202A–U+202E и U+2066–U+2069 по-прежнему флагуются по сырым строкам, включая комментарии. `--fix` не вырезает марку из комментария, если строка флагана за другой невидимый символ
- конфиг применяется единообразно на всех поверхностях: `--pre-tool`, apply_patch-ветвь, `--stdin-path`, MCP `slop_scan` и write-time плагин учитывают `maxCommentLength`, severity-override и `off` (severity-фильтр после ремопа); корень конфига плагина резолвится из редактируемого файла, а не из cwd, с кэшем root/конфиг на процесс — файл в репо B судится политикой репо B, даже если OpenCode запущен из репо A; ошибка парсинга конфига не кэшируется, починка `.stop-ai-slop.yaml` подхватывается без рестарта хоста
- MCP: `resultType` эмитится только на `tools/call` и только при согласованной версии протокола, которая его определяет; с `tools/list` поле убрано (там оно не имеет смысла ни в одной ревизии спеки)
- `--install`: сохраняет отступ (2/4/8 пробелов, таб), CRLF, наличие финального перевода строки и порядок ключей consumer-`package.json`; пустой файл трактуется как `{}`; валидный JSON не-объектной формы и битый JSON дают exit 2 без перезаписи файла
- bin: `isMain` сравнивает realpath с обеих сторон — запуск через симлинк (Homebrew, pnpm `.bin`, `--preserve-symlinks`) больше не завершается молча нулём
- аудит-лог: `statSync`-префильтр вместо чтения всего файла на каждое событие; семантика ротации по числу строк сохранена
- detekt-порт: 14 правил вместо 3 (исключён `vend/self-suppression` — diff-mode-only, в whole-file PSI-правиле бессмыслен); `changelog-marker` переведён на weak-pair семантику вместо срабатывания на одиночный слабый маркер, добавлены de/fr/es маркеры, Unicode-правила, generated-экземпт и suppression-директивы; `RuleCatalogParityTest` сверяет реальный провайдер с `rule-catalog.json` по id, severity, количеству и текстам `Issue`
- новые гейты: `check-coship.mjs` роняет changeset, одновременно трогающий детекторную семантику и `src/baseline.mjs` (CI на PR, escape hatch `--allow-coship "<reason>"`); `version-sync` сверяет package.json ↔ plugin.json ↔ тег `$id` схемы ↔ секцию CHANGELOG
- CI: `detekt.yml` (temurin 17, Gradle запинен на 8.10.2, `gen-catalog --check` до gradle), `bench.yml` (ночной FP-бенч по пин-когорте, не блокирует PR, сетевой сбой = warning)
- `--explain` принимает голое имя правила (`step-numbered` резолвится в `vend/step-numbered`, вывод показывает канонический id); `llms.txt` исправлен — раньше перечислял 12 id из 15 без префикса `vend/`, и `--explain` по ним возвращал exit 2
- фикс generated-детекции: шапка инструмента искалась по сырым первым 10 строкам, поэтому файл, цитирующий сами паттерны в коде, exempt'ил себя сам — `src/markers.mjs` определял `GEN_HEADER_STRICT` и выпадал из всех slop-правил (собственный multi-line-комментарий в нём был невидим гейту). Теперь шапка собирается из строк-комментариев профиля с учётом состояния блокового комментария (`commentLines` в `src/profiles.mjs`): шапка внутри `<# #>`, `/* */` без звёздочек на средних строках, `<!-- -->`, `{- -}`, `(* *)` и `--[[ ]]` эксемптит по-прежнему, а паттерн в коде — нет. Бенч на 8 пин-репо — без роста счётчиков. Гейт `generated-header`/`generated-selfref`/`generated-security`/`generated-negative` — 18 чеков на класс
- `ignoreWhen` трёх правил дополнен семантикой, которую теряли рукописные таблицы: `vend/markdown-in-comment` (строка таблицы требует минимум трёх пайпов, одиночный `|flag|` в прозе не флагается), `vend/cross-file-ref` (нужен разделитель пути или известное кодовое расширение), `vend/cjk-noise` (prose-файлы не проверяются)
- гейт `version-sync` покрывает 9 поверхностей: plugin.json, тег `$id` схемы, секция CHANGELOG, `CITATION.cff`, `docs/jsonld.jsonld`, schema-modeline и pre-commit `rev:` в обоих README
- `tsconfig.json` проведён в CI: `typescript` в devDependencies, `npm run typecheck` (`tsc --noEmit`) отдельным джобом в `slop.yml`. Первый же прогон нашёл две настоящие дыры: `plugin/comment-gate.ts` бросал `new Error(result.message)` при типе `string | null`, а `Rule` в `scan.d.mts` не объявлял поле `en`. `GateResult` стал discriminated union по `blocked` (blocked=true ⇒ `message: string`), `Rule` наследует `RuleText` и объявляет `en`
- чеки `docs-lang[<file>]` независимо от генератора проверяют язык таблицы (EN в README.md, RU в README.ru.md и SKILL.md): мутация маппинга в `tableFor` больше не самосогласована и убивается тестом; `cli-smoke` для `--mcp` проверяет форму ответа `initialize`, а не только «не упал»
- доки: таблицы правил генерируются из `RULES` и загейчены на дрейф; `docs/TECH_DEBT.md` переведён с цитат `scan.mjs:NNN` на `src/*.mjs`
- детекция: `changelog-marker` ловил пересказ диффа только в многострочной форме — тот же текст, сжатый до одной строки, проходил молча (`// the old rule kept the sidebar…`, `// …before this change`). В `CHANGELOG_STRONG` добавлены маркеры перехода, отобранные по принципу «референт может быть только диффом»: `before|prior to|after|since this change|refactor|rewrite`; `the old X <прошедший глагол>` с закрытым списком предлогов-последователей (отсекает reduced-relative «kept for backwards compatibility», «assumed non-null by callers»); `(we|they|it|this) used to` с защитой от purpose-clause («the token we used to authenticate»); `used to … has been removed`; ru «до/после этого изменения», «старое правило держало» без рефлектива и без условного «бы». Зеркало в detekt-порте, паритет JS/Java проверен. `bench-history.json`: PowerShell 14→26, redis 21→23, остальные счётчики не изменились
- отклонённые формы маркеров перехода, зафиксированные фикстурами от повторного расширения: `would`/`did` после `the old X` (модаль и условность неотличимы от домена — «the old value would be overwritten by the merge»); `the fix|patch|pr` без дейксиса (апстрим-фикс, патч конфига, ops-инструкция «after the patch, restart the service»); существительные `commit|update|migration|release` и определители `that|our` (доменные значения: коммит транзакции, миграция схемы, продуктовый релиз); ru «после коммита»/«до фикса». Причина: две независимые adversarial-проверки воспроизвели на этих ветках FP на error-правиле, блокирующем запись и коммит
- обратная связь гейта: `instead` у `multi-line-comment` и текст политики в сообщении write-time гейта дают рецепт, а не только запрет — что оставить (инвариант/ограничение одной строкой), куда деть остальное (пересказ прежнего поведения в коммит, причину теста в имя теста или тикет, контрактную документацию в doc-блок). Текст политики переехал в `messages.mjs` (`gatePolicy`, ru+en), сообщение гейта собирается через `T()`/`rt()` и впервые локализуется: раньше при `--lang en` агент получал EN-`instead` и RU-политику в одном сообщении

## 0.10.1

- фикс публикации 0.10.0: на CI-раннере `LANG=C.UTF-8` включал англоязычный авто-детект у дочерних процессов self-test — падал чек с RU-ассертом, `prepublishOnly` возвращал 1, npm publish не состоялся. Теперь: C/POSIX-локаль = «нет предпочтения» (русский по умолчанию), self-test пинит `STOP_AI_SLOP_LANG=ru` для дочерних CLI (герметичность от хост-окружения)
- юнит-чеки resolveLang (C.UTF-8/POSIX/en_US/ru_RU/unset)

## 0.10.0

- сообщения на английском: `--lang <ru|en>` + автодетект `STOP_AI_SLOP_LANG` > `LC_ALL`/`LANG` (не-ru → en, не задано → ru); каталог `skill/scripts/messages.mjs` (ru+en), EN-тексты всех 15 правил и сервисных строк; переведены findings/`--explain`/`--help`/ошибки/`--fix`/bench/аудит/pre-tool; вывод `--install*` и сгенерированные хуки остаются RU (задокументировано); неверное значение `--lang` — exit 2
- профили: `.vb` ловит `REM`; `.sql` ловит MySQL `#` (риск FP на Postgres XOR принят); `.hbs` ловит `<!-- -->`; `.mdx` — отдельный профиль с `{/* */}` (mdx отнесён к prose: CJK-проверка в нём не включается)
- профилей теперь 33 (в README раньше ошибочно значилось 24), расширений по-прежнему 160, имён — 26
- README (EN+RU): секция Output language/«Язык вывода», обновлённая таблица профилей, счётчик профилей в comparison
- self-test: 272 PASS (+12: 4 профильных + 8 языковых, включая автодетект по env)

## 0.9.0

- фикс гейта: каталог вне git-репо cwd обходится walk-ом — раньше `scan <dir>` вне репо молча возвращал «чисто» (затрагивало CLI, `--fix` и MCP `slop_scan`); RED-чек `scan-outside-repo`
- профили: PHP `//` и `/* */`/`/** */` сканируются (отдельный профиль php); F# `///` doc-строки эксемптятся (TRIPLE_SLASH_DOC в pascal)
- детектор: shebang не склеивается со следующим комментарием (multi-line/header FP); long-comment не флагает строку, где длину задаёт длинная `http(s)`-ссылка; cross-file-ref требует разделитель пути или известное кодовое расширение — host:port с любым TLD больше не флагается; TODO матчится в любом регистре; obvious-comment — иммунитет why-маркеров `only`/UTC/единиц измерения
- `--fix`: vend/step-numbered чинит и trailing inline-комментарии
- архитектура: self-test выделен в `skill/scripts/selftest.mjs` (scan.mjs 3942 → 2287 строк; `--self-test` делегирует динамическим импортом, контракт не изменился); плагин ходит через фасад `evaluateEdit()` — единый контракт write-time гейта вместо пяти глубинных импортов; `CONFIG_KEYS` экспортирован, source-regex parity-гейт заменён сравнением с константой; main() — таблица MODES; `--help` сгруппирован по назначению и упоминает npm-бинар
- scan.d.mts синхронизирован: detectCommentSlop (5 параметров), evaluateEdit/GateResult, loadConfig, scanFiles, collectFiles, loadGitattributesGenerated, benchDelta, RULE_BY_ID, KNOWN_FLAGS, readDisk
- bench: эталон переписан (+4 lowercase-todo — истинные срабатывания, −35 уточнений why/URL/shebang)
- доки: блок установки поднят к шапке (EN+RU); RU приведён к паритету с EN (интро-абзац, baseline v2-семантика, «одиннадцать точек», порядок конфиг-таблицы, `fp:` в описании slop_baseline)
- self-test: 260 PASS

## 0.8.0

- два правила из gap-анализа windbag: `vend/cross-file-ref` (указатель `handler.py:147` в комментарии; URL с `#L12` и host:port не флагаются) и `vend/obvious-comment` (однострочный комментарий пересказывает строку кода под ним; «почему»-маркеры — т.к., чтобы, must, intentionally, deliberately — иммунитет; CJK-текст и проза-профили пропускаются); оба warning, оба чинятся `--fix` удалением
- `--fix`: cross-file-ref и obvious-comment удаляют полнострочный комментарий / снимают trailing
- сравнение с аналогами переписано: 12 специализированных slop-линтеров (свежие факты 2026-09-29, звёзды и загрузки), меньшие инструменты, смежные подходы (SaaS-ревью, классические линтеры, Vale, скиллы), честный «где мы хуже» и «что есть только у нас» (MCP и SARIF исключены — есть у aislop/ai-slop-linter)
- bench: obvious-comment на до-AI-когорте — 5601/3694/735/444/233/104/74/72, сэмплы ревьюированы, эталон перезаписан; cross-file-ref — 0 находок на когорте
- self-test: 253 PASS (+10 чек, включая саботаж-фикстуру «intentionally» из FP-класса, найденного на bench)
- schema $id → v0.8.0

## 0.7.0

- publish.yml: GitHub Release из тега с нотами из секции CHANGELOG (идемпотентно) + зеркало пакета в GitHub Packages как `@whitebite/stop-ai-slop` (scoped, идемпотентно); `workflow_dispatch` гоняет release/зеркало без публикации в npmjs (guard по событию), concurrency-группа сериализует прогоны; релизы v0.2.1…v0.6.0 забэкфиллены

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
