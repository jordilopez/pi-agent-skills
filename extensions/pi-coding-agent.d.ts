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
