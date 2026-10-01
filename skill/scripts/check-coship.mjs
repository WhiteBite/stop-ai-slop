#!/usr/bin/env node
import { gitDiffRef, gitStagedDiff, gitToplevel } from "./src/git.mjs"

const DETECTOR_SEMANTICS = [
  "skill/scripts/src/markers.mjs",
  "skill/scripts/src/detect.mjs",
  "skill/scripts/src/rules.mjs",
  "skill/scripts/src/profiles.mjs",
  "skill/scripts/src/generated.mjs",
]
const BASELINE_SEMANTICS = ["skill/scripts/src/baseline.mjs"]

const HELP = [
  "coship-gate: детектор и baseline нельзя менять в одном ченджсете (docs/TECH_DEBT.md)",
  "",
  "Использование:",
  '  node skill/scripts/check-coship.mjs --staged',
  "  node skill/scripts/check-coship.mjs --diff <ref>",
  '  node skill/scripts/check-coship.mjs --staged --allow-coship "<причина>"',
  "",
  "Режимы:",
  "  --staged                    файлы из git diff --cached (по умолчанию)",
  "  --diff <ref>                файлы из git diff <ref>",
  '  --allow-coship "<причина>"  разрешить co-ship: причина печатается в вывод, exit 0',
  "  --help                      эта справка",
  "",
  "Группы путей:",
  "  detector-semantics: skill/scripts/src/{markers,detect,rules,profiles,generated}.mjs",
  "  baseline-semantics: skill/scripts/src/baseline.mjs",
  "",
  "Правка обеих групп одним ченджсетом делает регресс маскинга неотличимым от намеренного",
  "изменения: новый слоп поверх легаси может молча перестать флагаться.",
  "Выход: 0 — чисто или пропущено (не репо, git error), 1 — co-ship, 2 — ошибка аргументов.",
]

function diffPaths(diff) {
  const paths = new Set()
  let inHunk = false
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      inHunk = false
      continue
    }
    if (raw.startsWith("@@ ")) {
      inHunk = true
      continue
    }
    if (inHunk) continue
    if (raw.startsWith("--- ") || raw.startsWith("+++ ")) {
      const p = raw.slice(4).trim().replace(/^"|"$/g, "")
      if (p !== "/dev/null") paths.add(p.replace(/^[ab]\//, ""))
    }
  }
  return [...paths]
}

const pathMatches = (changed, group) => changed === group || changed.endsWith("/" + group) || group.endsWith("/" + changed)

const hits = (paths, group) => paths.filter((p) => group.some((g) => pathMatches(p, g)))

function report(detector, baseline) {
  console.log("coship-gate: changeset трогает и detector-semantics, и baseline-semantics")
  console.log("detector-semantics:")
  for (const p of detector) console.log("  - " + p)
  console.log("baseline-semantics:")
  for (const p of baseline) console.log("  - " + p)
  console.log(
    'правка детектора и baseline одним ченджсетом скрывает причину регресса маскинга — разнесите на два коммита или дайте --allow-coship "<причина>" (docs/TECH_DEBT.md)',
  )
}

function main(argv) {
  if (argv.includes("--help")) {
    console.log(HELP.join("\n"))
    return 0
  }
  let mode = "staged"
  let ref = null
  let allowReason = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--staged") {
      mode = "staged"
    } else if (a === "--diff") {
      ref = argv[i + 1]
      if (ref === undefined || ref.startsWith("--")) {
        console.error("coship-gate: --diff требует ref (например, main)")
        return 2
      }
      mode = "diff"
      i++
    } else if (a === "--allow-coship") {
      allowReason = argv[i + 1]
      if (allowReason === undefined || allowReason.startsWith("--")) {
        console.error("coship-gate: --allow-coship требует причину")
        return 2
      }
      i++
    } else if (a.startsWith("--")) {
      console.error(`coship-gate: неизвестный флаг ${a}`)
      return 2
    } else {
      console.error(`coship-gate: неизвестный аргумент ${a}`)
      return 2
    }
  }
  const root = gitToplevel(process.cwd())
  let diff
  try {
    diff = mode === "staged" ? gitStagedDiff(root) : gitDiffRef(ref, root)
  } catch (error) {
    console.log(`coship-gate: git error — проверка пропущена: ${error.message}`)
    return 0
  }
  if (diff === null) {
    console.log("coship-gate: не git-репозиторий — проверка пропущена")
    return 0
  }
  const paths = diffPaths(diff)
  const detector = hits(paths, DETECTOR_SEMANTICS)
  const baseline = hits(paths, BASELINE_SEMANTICS)
  if (detector.length > 0 && baseline.length > 0) {
    report(detector, baseline)
    if (allowReason !== null) {
      console.log(`coship-gate: co-ship разрешён: ${allowReason}`)
      return 0
    }
    return 1
  }
  if (allowReason !== null) console.log(`coship-gate: --allow-coship: ${allowReason}`)
  console.log("coship-gate: чисто")
  return 0
}

process.exit(main(process.argv.slice(2)))
