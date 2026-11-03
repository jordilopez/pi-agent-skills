import { splitKeyValue } from "./yaml-mini.js";

export type AgentFrontmatterEntry = {
  key: string;
  value: string;
};

export type ParsedAgentFile = {
  frontmatter: AgentFrontmatterEntry[];
  body: string;
};

/**
 * Parse an agent file into ordered frontmatter entries and the verbatim body.
 * The body is the exact bytes after the closing `---` delimiter line, so
 * pass-through conversion can never alter the body.
 */
export const parseAgentFile = (source: string): ParsedAgentFile => {
  const header = /^---[ \t]*\r?\n/.exec(source);

  if (!header) {
    throw new Error("agent-skills: agent file does not start with YAML frontmatter.");
  }

  const afterOpen = header[0].length;
  const closer = /^[ \t]*---[ \t]*$/gm;
  closer.lastIndex = afterOpen;
  const closeMatch = closer.exec(source);

  if (!closeMatch) {
    throw new Error("agent-skills: agent file has unterminated YAML frontmatter.");
  }

  const frontmatterText = source.slice(afterOpen, closeMatch.index);
  const body = source.slice(closeMatch.index + closeMatch[0].length);

  const frontmatter: AgentFrontmatterEntry[] = [];

  for (const line of frontmatterText.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;

    const keyValue = splitKeyValue(line);

    if (!keyValue) {
      throw new Error(`agent-skills: malformed frontmatter line: ${line}`);
    }

    frontmatter.push({ key: keyValue.key, value: keyValue.value });
  }

  return { frontmatter, body };
};

/** Render frontmatter entries plus the unchanged body back into one file. */
export const renderAgentFile = (entries: AgentFrontmatterEntry[], body: string): string => {
  const lines = ["---"];

  for (const entry of entries) {
    lines.push(`${entry.key}: ${entry.value}`);
  }

  lines.push("---");

  return `${lines.join("\n")}\n${body}`;
};

/** Parse a comma-separated scalar into trimmed, lowercased tokens. */
export const parseToolsList = (value: string | undefined): string[] =>
  value
    ? value
        .split(",")
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean)
    : [];
