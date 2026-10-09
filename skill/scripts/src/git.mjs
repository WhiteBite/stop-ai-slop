import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { SECURITY_RULES } from "./rules.mjs"
import { isExcludedPath, toRel } from "./paths.mjs"
import { CLI_SKIPPED_SEGMENTS, PROFILES, profileFor } from "./profiles.mjs"
import { detectCommentSlop, fileSuppressIds, isCodePath } from "./detect.mjs"
import { decodeText, readDisk } from "./diskio.mjs"
import { isGeneratedFile } from "./generated.mjs"
import { applyRuleConfig, configOptions } from "./config.mjs"
import { loadBaseline, maskBaselined } from "./baseline.mjs"
import { failsGate, printFindings } from "./report.mjs"
import { printFixSuggestions } from "./fixsuggest.mjs"
import { T } from "./i18n.mjs"

export function gitListedFiles(root) {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
    return out.split("\0").filter((s) => s !== "")
  } catch {
    return null
  }
}

export function collectFiles(paths, root, excludePaths = []) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!CLI_SKIPPED_SEGMENTS.has(entry.name) && !isExcludedPath(toRel(root, full), excludePaths)) walk(full)
      } else if (isCodePath(toRel(root, full), [...CLI_SKIPPED_SEGMENTS]) && !isExcludedPath(toRel(root, full), excludePaths)) {
        out.push(full)
      }
    }
  }
  const outsideDirs = []
  for (const p of paths) {
    const abs = resolve(root, p)
    if (!existsSync(abs)) throw new Error(T("pathMissing", p))
    if (!statSync(abs).isDirectory()) {
      if (profileFor(toRel(root, abs)) !== null && !isExcludedPath(toRel(root, abs), excludePaths)) out.push(abs)
      continue
    }
    const rel = toRel(root, abs)
    if (rel.startsWith("../") || rel === ".." || isAbsolute(rel)) outsideDirs.push(abs)
  }
  const listed = gitListedFiles(root)
  if (listed !== null) {
    const prefixes = paths
      .map((p) => resolve(root, p))
      .filter((abs) => existsSync(abs) && statSync(abs).isDirectory() && !outsideDirs.includes(abs))
      .map((abs) => toRel(root, abs))
    for (const rel of listed) {
      if (!isCodePath(rel, [...CLI_SKIPPED_SEGMENTS])) continue
      if (isExcludedPath(rel, excludePaths)) continue
      if (!prefixes.some((p) => p === "" || rel === p || rel.startsWith(p + "/"))) continue
      const abs = join(root, rel)
      if (statSync(abs, { throwIfNoEntry: false })?.isFile() !== true) continue
      out.push(abs)
    }
    for (const d of outsideDirs) walk(d)
    return [...new Set(out)].sort()
  }
  for (const p of paths) {
    const abs = resolve(root, p)
    if (existsSync(abs) && statSync(abs).isDirectory() && !outsideDirs.includes(abs)) walk(abs)
  }
  for (const d of outsideDirs) walk(d)
  return [...new Set(out)]
}

export function readScannable(file) {
  let text
  try {
    text = decodeText(readFileSync(file))
  } catch {
    return null
  }
  if (text.slice(0, 8192).includes("\u0000")) return null
  return text
}

export function scanFiles(files, root, options = null, genCtx = null) {
  const findings = []
  for (const file of files) {
    const text = readScannable(file)
    if (text === null) continue
    const rel = toRel(root, file)
    const visible = detectCommentSlop(text.replaceAll("\r\n", "\n").split("\n"), profileFor(file) ?? PROFILES.legacy, false, null, options)
    for (const v of isGeneratedFile(rel, text, genCtx) ? visible.filter((f) => SECURITY_RULES.has(f.rule)) : visible) {
      findings.push({ rel, ...v })
    }
  }
  return findings
}
export function gitToplevel(root) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  } catch {
    return root
  }
}
export function isNotARepoError(error) {
  return error.code === "ENOENT" || /not a git repository/i.test(String(error.stderr ?? ""))
}

export function gitErrorText(error) {
  const stderr = String(error.stderr ?? "").trim()
  return stderr === "" ? String(error.message ?? error) : stderr
}

export function gitStagedDiff(root) {
  try {
    execFileSync("git", ["-c", "core.quotepath=false", "rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "pipe" })
    return execFileSync("git", ["-c", "core.quotepath=false", "diff", "--cached", "-U0", "--no-color"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    if (isNotARepoError(error)) return null
    throw new Error(gitErrorText(error))
  }
}

const C_ESCAPES = { a: "\a", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", '"': '"', "\\": "\\" }

function cUnquote(quoted) {
  let text = ""
  const bytes = []
  const flush = () => {
    if (bytes.length > 0) {
      text += Buffer.from(bytes).toString("utf8")
      bytes.length = 0
    }
  }
  for (let i = 0; i < quoted.length; i++) {
    const ch = quoted[i]
    if (ch !== "\\") {
      flush()
      text += ch
    } else if (quoted[i + 1] >= "0" && quoted[i + 1] <= "7") {
      let digits = ""
      while (digits.length < 3 && quoted[i + 1] >= "0" && quoted[i + 1] <= "7") digits += quoted[++i]
      bytes.push(Number.parseInt(digits, 8))
    } else {
      flush()
      text += C_ESCAPES[quoted[++i]] ?? quoted[i] ?? "\\"
    }
  }
  flush()
  return text
}

export function parseUnifiedDiff(diff) {
  const byFile = new Map()
  let file = null
  let inHunk = false
  let newLine = 0
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      file = null
      inHunk = false
      continue
    }
    if (!inHunk && raw.startsWith("+++ ")) {
      let p = raw.slice(4).trim()
      if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) p = cUnquote(p.slice(1, -1))
      file = p === "/dev/null" ? null : p.replace(/^b\//, "")
      continue
    }
    if (raw.startsWith("@@ ")) {
      const m = /\+(\d+)/.exec(raw)
      newLine = m === null ? 0 : Number(m[1])
      inHunk = true
      continue
    }
    if (!inHunk || file === null) continue
    if (raw.startsWith("+")) {
      if (!byFile.has(file)) byFile.set(file, [])
      byFile.get(file).push({ lineNo: newLine, text: raw.slice(1).replace(/\r$/, "") })
      newLine++
    } else if (raw.startsWith("-") || raw.startsWith("\\")) {
      continue
    } else {
      newLine++
    }
  }
  return byFile
}

export function consecutiveRuns(lines) {
  const runs = []
  let current = []
  for (const entry of lines) {
    if (current.length > 0 && entry.lineNo !== current[current.length - 1].lineNo + 1) {
      runs.push(current)
      current = []
    }
    current.push(entry)
  }
  if (current.length > 0) runs.push(current)
  return runs
}

export function runDiffGate(diffText, root, strict, format = "text", config = null, genCtx = null, annotations = false, fixSuggestions = false) {
  const findings = []
  const excludePaths = config?.excludePaths ?? []
  const options = configOptions(config)
  for (const [file, lines] of parseUnifiedDiff(diffText)) {
    if (!isCodePath(file, [...CLI_SKIPPED_SEGMENTS])) continue
    if (isExcludedPath(file, excludePaths)) continue
    const disk = readDisk(join(root, file))
    if (typeof disk === "string" && disk.slice(0, 8192).includes("\u0000")) continue
    const profile = profileFor(file) ?? PROFILES.legacy
    const fileIds = fileSuppressIds(lines.map((l) => l.text), profile)
    const visible = []
    for (const run of consecutiveRuns(lines)) {
      for (const v of detectCommentSlop(run.map((r) => r.text), profile, true, fileIds, options)) {
        visible.push({ rel: file, ...v, lineNo: run[0].lineNo + v.lineNo - 1 })
      }
    }
    const genText = typeof disk === "string" ? disk : lines.map((l) => l.text).join("\n")
    for (const v of isGeneratedFile(file, genText, genCtx) ? visible.filter((f) => SECURITY_RULES.has(f.rule)) : visible) {
      findings.push(v)
    }
  }
  const baseline = loadBaseline(root)
  const fresh = maskBaselined(baseline, applyRuleConfig(findings, config))
  printFindings(fresh, format, strict, annotations)
  if (fixSuggestions) printFixSuggestions(root, fresh, format)
  return failsGate(fresh, strict) ? 1 : 0
}
export function gitDiffRef(ref, root) {
  try {
    execFileSync("git", ["-c", "core.quotepath=false", "rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "pipe" })
    return execFileSync("git", ["-c", "core.quotepath=false", "diff", ref, "-U0", "--no-color"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    if (isNotARepoError(error)) return null
    throw new Error(gitErrorText(error))
  }
}
