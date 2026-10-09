/** harness-kit public surface: owner-scoped merge + atomic writes + marker blocks + install health. */
export { mergeHooks } from './merge.mjs';
export { writeMarkerBlock } from './marker.mjs';
export { extractCliPath, collectCommands } from './drift.mjs';
export { checkInstall, resolveHooksDir } from './doctor.mjs';
export { ConfigParseError, readJsonConfig, writeJsonAtomic } from './atomic.mjs';
