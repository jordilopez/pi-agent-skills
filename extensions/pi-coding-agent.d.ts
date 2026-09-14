export type ExtensionAPI = {
  on: (event: string, handler: (...args: unknown[]) => unknown | Promise<unknown>) => void;
  registerTool: (tool: unknown) => void;
  registerCommand: (name: string, options: unknown) => void;
};
