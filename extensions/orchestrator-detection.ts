/**
 * Orchestrator detection table.
 *
 * This is the single place in the extension that names a specific subagent
 * orchestrator package. Conversion code, validation code, and commands must
 * consult this table rather than branching on package names directly.
 *
 * Recognizing a package identity here does not authorize installing it. This
 * package only emits orchestrator-compatible agent files; installing the
 * orchestrator remains the user's responsibility.
 */

export type AgentFormat = "tmux" | "herdr" | "pi-subagents";

export const AGENT_FORMATS: readonly AgentFormat[] = ["tmux", "herdr", "pi-subagents"];

export type OrchestratorPackage = {
  /** Pi package identity, e.g. `npm:@vanillagreen/pi-agents-tmux`. */
  package: string;
  format: AgentFormat;
};

export const ORCHESTRATOR_PACKAGES: readonly OrchestratorPackage[] = [
  { package: "npm:@vanillagreen/pi-agents-tmux", format: "tmux" },
  { package: "npm:@maxiaochao/pi-herdr-subagents", format: "herdr" },
  { package: "npm:pi-subagents", format: "pi-subagents" },
];

/** Type guard narrowing an unknown value to a supported agent format. */
export const isAgentFormat = (value: unknown): value is AgentFormat =>
  typeof value === "string" && (AGENT_FORMATS as readonly string[]).includes(value);

/**
 * Return the recognized orchestrator format present in `installedPackages`.
 *
 * Detection is a convenience, not a guess: returns the single matching format
 * when exactly one recognized orchestrator package is present, and `[]` when
 * zero or more than one are present (ambiguous).
 */
export const detectFormats = (installedPackages: readonly string[]): AgentFormat[] => {
  const matches = ORCHESTRATOR_PACKAGES.filter((entry) =>
    installedPackages.includes(entry.package),
  ).map((entry) => entry.format);

  const unique = [...new Set(matches)];

  return unique.length === 1 ? unique : [];
};
