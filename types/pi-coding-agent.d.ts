/**
 * Temporary local type boundary for Pi extension APIs.
 *
 * This file provides minimal type declarations so the package compiles and
 * type-checks without depending on the published `@earendil-works/pi-coding-agent`
 * package.  It should be replaced by the official types once that package is
 * available as a dependency.
 */

export type ExtensionCommandContext = {
  cwd: string;
};

/** Event shape for the before_agent_start lifecycle handler. */
export type BeforeAgentStartEvent = {
  prompt: string;
  images?: unknown[];
  systemPrompt: string;
  systemPromptOptions?: {
    customPrompt?: string;
    selectedTools?: string[];
    toolSnippets?: string[];
    promptGuidelines?: string[];
    appendSystemPrompt?: string;
    cwd?: string;
    contextFiles?: Array<{ path: string; content?: string }>;
    skills?: unknown[];
  };
};

/** Return value accepted from a before_agent_start handler. */
export type BeforeAgentStartResult = {
  systemPrompt?: string;
  message?: {
    customType: string;
    content: string;
    display?: boolean;
  };
};

export type ExtensionAPI = {
  on: (event: string, handler: (...args: unknown[]) => unknown | Promise<unknown>) => void;
  registerTool: (tool: unknown) => void;
  registerCommand: (
    name: string,
    options: {
      description?: string;
      handler?: (args: unknown, ctx: ExtensionCommandContext) => unknown | Promise<unknown>;
    },
  ) => void;
};
