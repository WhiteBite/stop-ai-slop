export type Severity = "error" | "warning"

export interface Violation {
  rule: string
  lineNo: number
  lines: string[]
  severity: Severity
  reason?: string
}

export interface FileViolation extends Violation {
  rel: string
}

export interface RuleText {
  message: string
  why: string
  instead: string
  write: string
  ignoreWhen: string
}

export interface Rule extends RuleText {
  id: string
  severity: Severity
  en: RuleText
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
  noMultiLine?: boolean
  templates?: boolean
  goDoc?: boolean
}

export declare function isCommentLine(line: string, profile?: CommentProfile): boolean
export declare function profileFor(filePath: string): CommentProfile | null
export declare function detectCommentSlop(
  addedLines: string[],
  profile?: CommentProfile,
  diffMode?: boolean,
  fileSuppress?: Set<string> | null,
  options?: { maxLength?: number; ticketPattern?: string } | null,
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
): { filePath: string; added: string[]; lineNos: number[] | null } | null
interface GateResultBase {
  tool: string
  evaluated: boolean
  filePath: string | null
  addedCount: number
  violations: Violation[]
}

export type GateResult =
  | (GateResultBase & { blocked: false; message: null })
  | (GateResultBase & { blocked: true; message: string })
export declare function evaluateEdit(
  tool: string,
  args: Record<string, unknown>,
  opts?: { includeGenerated?: boolean; root?: string },
): GateResult
// null: файл отсутствует (ENOENT); undefined: другая ошибка чтения
export declare function readDisk(filePath: string): string | null | undefined
export declare function loadGitattributesGenerated(root: string): ((rel: string) => boolean) | null
export declare function collectFiles(paths: string[], root: string, excludePaths?: string[]): string[]
export declare function scanFiles(
  files: string[],
  root: string,
  options?: { maxLength?: number; ticketPattern?: string } | null,
  genCtx?: GeneratedContext | null,
): FileViolation[]
export interface OverrideEntry {
  paths: string[]
  rules: Map<string, string>
}
export interface SlopConfig {
  maxCommentLength: number | null
  excludePaths: string[]
  generatedPaths: string[]
  scanGenerated: boolean | null
  rules: Map<string, string>
  overrides: OverrideEntry[]
  ticketPattern: string | null
}
export declare const CONFIG_KEYS: string[]
export declare function loadConfig(root: string): SlopConfig | null
export declare function benchDelta(
  history: Record<string, Record<string, number>>,
  current: Record<string, Record<string, number>>,
): { repo: string; rule: string; was: number; now: number }[]
export declare function auditLogPath(): string
export declare function appendAudit(entry: Record<string, unknown>, path?: string): void
export declare function resolveLang(argv: string[], env?: Record<string, string | undefined>): { lang: string | null; error: boolean }
export declare function setLang(lang: string): void
export declare function currentLang(): string
