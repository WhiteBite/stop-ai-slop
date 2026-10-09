/** Type declarations for the harness-kit public surface (Bun/TS consumers import the vendored .mjs directly). */

export type MergeShape = 'nested-hooks' | 'root-events' | 'versioned-flat' | 'versioned-typed' | 'flat-matcher' | 'hooks-array';

export function mergeHooks(
  existing: Record<string, unknown>,
  template: Record<string, unknown>,
  options: { shape: MergeShape; isMine: (command: unknown) => boolean },
): Record<string, unknown>;

export type MarkerBlockAction = 'created' | 'replaced' | 'appended' | 'unchanged' | 'skipped-foreign';
export interface MarkerBlockResult {
  action: MarkerBlockAction;
}

export interface ShellBlockOpts {
  variant: 'shell-block';
  id: string;
  shebang?: string;
  executable?: boolean;
}
export interface HtmlBlockOpts {
  variant: 'html-block';
  id: string;
}
export interface FirstLineMarkerOpts {
  variant: 'first-line-marker';
  marker: string;
}
export interface MdcFrontmatterOpts {
  variant: 'mdc-frontmatter';
  fields: ReadonlyArray<readonly [string, string]>;
  body: string;
}
export type WriteMarkerBlockOpts = ShellBlockOpts | HtmlBlockOpts | FirstLineMarkerOpts | MdcFrontmatterOpts;

/** `block` is the full caller-assembled text for shell/html/first-line; mdc-frontmatter builds bytes from fields + body. */
export function writeMarkerBlock(path: string, block: string, opts: WriteMarkerBlockOpts): MarkerBlockResult;

export type DriftStatus = 'broken' | 'missing' | 'stale' | 'ok';

export function extractCliPath(command: unknown, matcher?: RegExp): string | null;
export function collectCommands(config: Record<string, unknown>, options: { shape: MergeShape }): string[];

export interface Finding {
  surface: string;
  status: DriftStatus;
  detail: string | null;
}

export interface HookConfigSurface {
  id: string;
  kind: 'hook-config';
  path: string;
  shape: MergeShape;
  identify: (command: unknown) => boolean;
  extract?: (command: unknown) => string | null;
}

export interface MarkerBlockSurface {
  id: string;
  kind: 'marker-block';
  path: string;
  variant: 'shell-block';
  markerId: string;
  extract?: (text: string) => string | null;
}

export type InstallSurface = HookConfigSurface | MarkerBlockSurface;

export interface CheckInstallOpts {
  surfaces?: InstallSurface[];
  pathExists?: (path: string) => boolean;
}

export function checkInstall(root: string, opts?: CheckInstallOpts): Finding[];
export function resolveHooksDir(root: string, opts?: { exec?: (args: string[], cwd: string) => string }): string | null;

export declare class ConfigParseError extends Error {
  path: string;
}
export function readJsonConfig(path: string): Record<string, unknown> | null;
export function writeJsonAtomic(path: string, data: unknown): void;
