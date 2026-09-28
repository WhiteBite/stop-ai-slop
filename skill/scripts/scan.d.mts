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
export declare function detectCommentSlop(addedLines: string[], profile?: CommentProfile, diffMode?: boolean): Violation[]
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
export declare function auditLogPath(): string
export declare function appendAudit(entry: Record<string, unknown>, path?: string): void
