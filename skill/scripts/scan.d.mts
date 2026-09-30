export type Severity = "error" | "warning"

export interface Violation {
  rule: string
  lineNo: number
  lines: string[]
  severity: Severity
}

export interface Rule {
  id: string
  severity: Severity
  message: string
  why: string
  instead: string
  write: string
  ignoreWhen: string
}

export declare const RULES: Rule[]
export declare const RULE_BY_ID: Map<string, Rule>
export declare const KNOWN_FLAGS: Set<string>
export interface CommentProfile {
  prefixes: string[]
  blocks: [string, string][]
  doc: { openRe: RegExp; close: string }[]
  suffixes: string[]
  regexPrefixes: RegExp[]
  blockScalars?: boolean
}

export declare function isCommentLine(line: string, profile?: CommentProfile): boolean
export declare function profileFor(filePath: string): CommentProfile | null
export declare function detectCommentSlop(
  addedLines: string[],
  profile?: CommentProfile,
  diffMode?: boolean,
  fileSuppress?: Set<string> | null,
  options?: { maxLength?: number } | null,
): Violation[]
export declare function multisetDiff(oldText: string, newText: string): string[]
export declare function isCodePath(filePath: string, extraSkippedSegments?: string[]): boolean
export interface GeneratedContext {
  gitattr: ((rel: string) => boolean) | null
  cfgPaths: string[]
  scanGenerated: boolean
}
export declare function isGeneratedFile(relPath: string, text: string, extra?: GeneratedContext | null): boolean
export declare function addedFromToolArgs(
  tool: string,
  args: Record<string, unknown>,
  opts?: { includeGenerated?: boolean },
): { filePath: string; added: string[] } | null
export interface GateResult {
  tool: string
  evaluated: boolean
  blocked: boolean
  filePath: string | null
  addedCount: number
  violations: Violation[]
  message: string | null
}
export declare function evaluateEdit(tool: string, args: Record<string, unknown>, opts?: { includeGenerated?: boolean }): GateResult
export declare function readDisk(filePath: string): string | null | undefined
export declare function loadGitattributesGenerated(root: string): ((rel: string) => boolean) | null
export declare function collectFiles(paths: string[], root: string, excludePaths?: string[]): string[]
export declare function scanFiles(
  files: string[],
  root: string,
  options?: { maxLength?: number; excludePaths?: string[]; [key: string]: unknown } | null,
  genCtx?: GeneratedContext | null,
): Violation[]
export declare function loadConfig(root: string): {
  maxCommentLength?: number
  excludePaths?: string[]
  generatedPaths?: string[]
  scanGenerated?: boolean
  rules?: Record<string, string> | null
} | null
export declare function benchDelta(
  history: Record<string, Record<string, number>>,
  current: Record<string, Record<string, number>>,
): { repo: string; rule: string; was: number; now: number }[]
export declare function auditLogPath(): string
export declare function appendAudit(entry: Record<string, unknown>, path?: string): void
