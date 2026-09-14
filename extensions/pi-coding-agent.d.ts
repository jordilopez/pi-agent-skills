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
