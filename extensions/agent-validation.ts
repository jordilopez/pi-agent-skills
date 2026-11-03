import type { AgentFormat } from "./orchestrator-detection.js";
import { parseAgentFile, parseToolsList } from "./agent-frontmatter.js";

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/** Shared read-only invariant: a canonical agent must be pane: false and deny write/edit. */
export const checkCanonicalReadOnly = (agentName: string, content: string): ValidationResult => {
  const parsed = parseAgentFile(content);
  const frontmatter = new Map(parsed.frontmatter.map((entry) => [entry.key, entry.value]));

  if (frontmatter.get("pane") !== "false") {
    return { ok: false, reason: `${agentName} must declare "pane: false".` };
  }

  const deniedTools = parseToolsList(frontmatter.get("deny-tools"));

  if (!deniedTools.includes("write") || !deniedTools.includes("edit")) {
    return { ok: false, reason: `${agentName} must deny "write" and "edit".` };
  }

  return { ok: true };
};

/** Validate converted output against the per-format shape requirements. */
export const validateConvertedAgent = (format: AgentFormat, content: string): ValidationResult => {
  const parsed = parseAgentFile(content);
  const frontmatter = new Map(parsed.frontmatter.map((entry) => [entry.key, entry.value]));

  // Generic read-only invariant: no format may grant write/edit through an
  // allow-list, even if a stray `tools` key ended up in a deny-list format.
  if (frontmatter.has("tools")) {
    const tools = parseToolsList(frontmatter.get("tools"));

    if (tools.includes("write") || tools.includes("edit")) {
      return { ok: false, reason: `${format} frontmatter grants "write" or "edit".` };
    }
  }

  if (format === "tmux") {
    if (frontmatter.get("pane") !== "false") {
      return { ok: false, reason: 'tmux frontmatter must set "pane: false".' };
    }

    const deniedTools = parseToolsList(frontmatter.get("deny-tools"));

    if (!deniedTools.includes("write") || !deniedTools.includes("edit")) {
      return { ok: false, reason: 'tmux frontmatter must deny "write" and "edit".' };
    }

    return { ok: true };
  }

  if (format === "herdr") {
    if (frontmatter.get("access") !== "read") {
      return { ok: false, reason: 'herdr frontmatter must set "access: read".' };
    }

    return { ok: true };
  }

  if (frontmatter.get("acceptanceRole") !== "read-only") {
    return { ok: false, reason: 'pi-subagents frontmatter must set "acceptanceRole: read-only".' };
  }

  return { ok: true };
};
