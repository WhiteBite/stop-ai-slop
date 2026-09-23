declare module "@opencode-ai/plugin" {
  export type PluginInput = Record<string, unknown>
  export type PluginOptions = Record<string, unknown>
  export interface Hooks {
    "tool.execute.before"?: (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> },
    ) => Promise<void>
  }
  export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>
}
