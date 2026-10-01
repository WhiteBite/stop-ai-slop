import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { collectFiles, gitToplevel, scanFiles } from "./git.mjs"
import { loadGitattributesGenerated } from "./generated.mjs"
import { T } from "./i18n.mjs"

export const BENCH_COHORT = [
  { repo: "expressjs/express", sha: "43020ff2753477a5abc75a72931a807503d31bbf" },
  { repo: "pallets/flask", sha: "6b054f8f3876ff4c31580b014d344c4cf491059d" },
  { repo: "gin-gonic/gin", sha: "3f818c3fa69e03feb46d2b49d2a8084c425cbed6" },
  { repo: "tokio-rs/tokio", sha: "b3ff911c389405a5fc2fb931517449c26b252d56" },
  { repo: "rack/rack", sha: "e9f2f246377da9d1c1cb55dae4328273ef235488" },
  { repo: "redis/redis", sha: "dc57ee03b1c5b8f646718e362f3a809a7511ad36" },
  { repo: "PowerShell/PowerShell", sha: "c066cd85aa5c0dec8bb4a7007f86431693bf0542" },
  { repo: "vuejs/vue", sha: "9e88707940088cb1f4cd7dd210c9168a50dc347c" },
]
export function benchCacheRoot() {
  return process.env.STOP_AI_SLOP_BENCH_CACHE ?? join(homedir(), ".cache", "stop-ai-slop", "bench")
}
export function benchEnsureRepo(repo, sha) {
  const dir = join(benchCacheRoot(), repo.replace("/", "--"))
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  try {
    if (!existsSync(join(dir, ".git"))) {
      mkdirSync(dir, { recursive: true })
      git(["init", "-q"])
      git(["remote", "add", "origin", `https://github.com/${repo}`])
    }
    let head = null
    try {
      head = git(["rev-parse", "HEAD"]).trim()
    } catch {
      head = null
    }
    if (head !== sha) {
      console.log(T("benchFetch", repo, sha.slice(0, 12)))
      git(["fetch", "-q", "--depth", "1", "origin", sha])
      git(["checkout", "-q", "FETCH_HEAD"])
    }
    return dir
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? error).trim().split("\n")[0]
    console.error(`slop-gate: bench: не удалось получить ${repo}@${sha.slice(0, 12)}: ${detail}`)
    return null
  }
}
export function benchScanRepo(dir) {
  const files = collectFiles(["."], dir, [])
  const findings = scanFiles(files, dir, null, { gitattr: loadGitattributesGenerated(dir), cfgPaths: [], scanGenerated: false })
  const counts = {}
  for (const f of findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1
  return counts
}
export function benchDelta(history, current) {
  const out = []
  for (const [repo, rules] of Object.entries(current)) {
    const was = history[repo] ?? {}
    for (const [rule, now] of Object.entries(rules)) {
      const prev = was[rule] ?? 0
      if (now > prev) out.push({ repo, rule, was: prev, now })
    }
  }
  return out.sort((a, b) => (a.repo === b.repo ? (a.rule < b.rule ? -1 : 1) : a.repo < b.repo ? -1 : 1))
}
export function benchSorted(perRepo) {
  const out = {}
  for (const repo of Object.keys(perRepo).sort()) {
    const rules = {}
    for (const rule of Object.keys(perRepo[repo]).sort()) rules[rule] = perRepo[repo][rule]
    out[repo] = rules
  }
  return out
}
export function cmdBench(write) {
  const perRepo = {}
  for (const { repo, sha } of BENCH_COHORT) {
    const dir = benchEnsureRepo(repo, sha)
    if (dir === null) return 2
    perRepo[repo] = benchScanRepo(dir)
  }
  const sorted = benchSorted(perRepo)
  for (const [repo, rules] of Object.entries(sorted)) {
    const total = Object.values(rules).reduce((a, b) => a + b, 0)
    console.log(`${repo}: ${total}`)
    for (const [rule, n] of Object.entries(rules)) console.log(`  ${rule} ${n}`)
  }
  const historyPath = join(gitToplevel(process.cwd()), "bench-history.json")
  if (write) {
    writeFileSync(historyPath, JSON.stringify(sorted, null, 2) + "\n")
    console.log(T("benchWritten", BENCH_COHORT.length))
    return 0
  }
  let history = {}
  if (existsSync(historyPath)) {
    try {
      const parsed = JSON.parse(readFileSync(historyPath, "utf8"))
      history = typeof parsed === "object" && parsed !== null ? parsed : {}
    } catch {
      history = {}
    }
  } else {
    console.log("slop-gate: bench: история пуста — запишите эталон через --bench-write")
  }
  const delta = benchDelta(history, perRepo)
  if (delta.length === 0) {
    console.log(T("benchNoGrowth"))
    return 0
  }
  console.log(T("benchGrowthHeader"))
  for (const d of delta) console.log(T("benchDeltaLine", d.repo, d.rule, d.was, d.now))
  return 1
}
