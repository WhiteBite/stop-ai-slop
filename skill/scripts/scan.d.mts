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
}

export declare function isCommentLine(line: string, profile?: CommentProfile): boolean
export declare function profileFor(filePath: string): CommentProfile | null
export declare function hashComments(filePath: string): boolean
export declare function detectCommentSlop(addedLines: string[], profile?: CommentProfile): Violation[]
export declare function multisetDiff(oldText: string, newText: string): string[]
export declare function isCodePath(filePath: string, extraSkippedSegments?: string[]): boolean
export declare function addedFromToolArgs(
  tool: string,
  args: Record<string, unknown>,
): { filePath: string; added: string[] } | null
export declare function auditLogPath(): string
export declare function appendAudit(entry: Record<string, unknown>, path?: string): void
