/**
 * Minimal YAML subset parser for this package's two data files:
 * `agents/overrides/<format>.yaml` and `agents/body-rewrites.yaml`.
 *
 * Scope is intentionally narrow: it parses only these two schemas —
 *
 *     targetDir: <relative-path>
 *     frontmatter:
 *       remove: [key, ...]
 *       set:
 *         key: <safe-scalar>
 *
 * and
 *
 *     rewrites:
 *       - from: <literal-prefix>
 *         to: <target-with-${packageRoot}>
 *
 * It supports plain, single-quoted, and double-quoted scalar values and flow
 * sequences for `remove`. Anchors, aliases, block scalars, multi-document
 * files, and nested mappings are rejected. The permitted character set for
 * `set` values is deliberately small so a malformed or over-broad override
 * fails closed before it can produce a mis-shaped agent frontmatter.
 *
 * The frontmatter `key: value` scalar-line splitting is shared here so the
 * agent-delivery conversion code uses exactly one definition of a scalar line.
 */

export type OverrideFrontmatterPatch = {
  remove: string[];
  set: Record<string, string>;
};

export type OverrideFile = {
  targetDir: string;
  frontmatter: OverrideFrontmatterPatch;
};

/** Strip one pair of matching surrounding single or double quotes. */
export const stripQuotes = (value: string): string => {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];

    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
};

/**
 * Split one `key: value` scalar line. Supports a colon at end of line (empty
 * value) and colon followed by a space or tab. A key is never empty.
 */
export const splitKeyValue = (line: string): { key: string; value: string } | null => {
  let index = -1;

  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === ":") {
      if (i + 1 >= line.length || line[i + 1] === " " || line[i + 1] === "\t") {
        index = i;
        break;
      }
    }
  }

  if (index === -1) return null;

  const key = line.slice(0, index).trim();

  if (key.length === 0) return null;

  return { key, value: stripQuotes(line.slice(index + 1).trim()) };
};

const isBlankOrComment = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith("#");
};

const isSafeScalar = (value: string): boolean => {
  if (value.length === 0) return false;

  if (!/[A-Za-z0-9]/.test(value[0])) return false;

  for (const ch of value) {
    if (!/[A-Za-z0-9 _.,/_-]/.test(ch)) return false;
  }

  return true;
};

const isSafeKey = (key: string): boolean => /^[A-Za-z][A-Za-z0-9_-]*$/.test(key);

const parseNonEmptyString = (value: string, lineNo: number, label: string): string => {
  const parsed = stripQuotes(value.trim());

  if (parsed.length === 0) {
    throw new Error(`yaml-mini: empty ${label} on line ${lineNo}.`);
  }

  return parsed;
};

const parseFlowSequence = (value: string, lineNo: number): string[] => {
  const trimmed = value.trim();

  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`yaml-mini: expected a flow sequence ([...]) on line ${lineNo}.`);
  }

  const inner = trimmed.slice(1, -1).trim();

  if (inner.length === 0) return [];

  return inner
    .split(",")
    .map((item) => stripQuotes(item.trim()))
    .filter((item) => item.length > 0);
};

export const parseOverrideYaml = (text: string): OverrideFile => {
  const lines = text.split(/\r?\n/);

  let targetDir: string | undefined;
  let remove: string[] | undefined;
  let sawFrontmatter = false;
  let sawSet = false;
  const set: Record<string, string> = {};

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];

    if (isBlankOrComment(raw)) continue;

    const lineNo = i + 1;
    const indent = raw.length - raw.trimStart().length;
    const content = raw.trim();

    if (indent === 0) {
      if (content === "frontmatter:") {
        if (sawFrontmatter) {
          throw new Error(`yaml-mini: duplicate "frontmatter" key on line ${lineNo}.`);
        }
        sawFrontmatter = true;
        sawSet = false;
        continue;
      }

      if (content.startsWith("targetDir:")) {
        if (targetDir !== undefined) {
          throw new Error(`yaml-mini: duplicate "targetDir" key on line ${lineNo}.`);
        }
        const keyValue = splitKeyValue(content);
        targetDir = keyValue ? parseNonEmptyString(keyValue.value, lineNo, "targetDir") : "";
        if (targetDir.length === 0) {
          throw new Error(`yaml-mini: empty "targetDir" on line ${lineNo}.`);
        }
        continue;
      }

      throw new Error(`yaml-mini: unexpected top-level key on line ${lineNo}.`);
    }

    if (indent === 2) {
      if (content.startsWith("remove:")) {
        if (remove !== undefined) {
          throw new Error(`yaml-mini: duplicate "remove" key on line ${lineNo}.`);
        }
        const keyValue = splitKeyValue(content);
        if (!keyValue) {
          throw new Error(`yaml-mini: malformed "remove" key on line ${lineNo}.`);
        }
        remove = parseFlowSequence(keyValue.value, lineNo);
        sawSet = false;
        continue;
      }

      if (content === "set:" || content === "set: {}") {
        if (sawSet) {
          throw new Error(`yaml-mini: duplicate "set" key on line ${lineNo}.`);
        }
        sawSet = true;
        continue;
      }

      throw new Error(`yaml-mini: unexpected frontmatter key on line ${lineNo}.`);
    }

    if (indent === 4) {
      if (!sawSet) {
        throw new Error(`yaml-mini: nested key without "set" on line ${lineNo}.`);
      }
      const keyValue = splitKeyValue(content);
      if (!keyValue) {
        throw new Error(`yaml-mini: expected "key: value" under set on line ${lineNo}.`);
      }
      if (!isSafeKey(keyValue.key)) {
        throw new Error(`yaml-mini: unsupported set key "${keyValue.key}" on line ${lineNo}.`);
      }
      if (keyValue.key in set) {
        throw new Error(`yaml-mini: duplicate set key "${keyValue.key}" on line ${lineNo}.`);
      }
      if (!isSafeScalar(keyValue.value)) {
        throw new Error(
          `yaml-mini: unsupported set value "${keyValue.value}" for ${keyValue.key} on line ${lineNo}.`,
        );
      }
      set[keyValue.key] = keyValue.value;
      continue;
    }

    throw new Error(`yaml-mini: unexpected indentation on line ${lineNo}.`);
  }

  if (targetDir === undefined) {
    throw new Error('yaml-mini: missing required "targetDir" key.');
  }

  if (!sawFrontmatter) {
    throw new Error('yaml-mini: missing required "frontmatter" key.');
  }

  return {
    targetDir,
    frontmatter: {
      remove: remove ?? [],
      set,
    },
  };
};

export type BodyRewrite = {
  from: string;
  to: string;
};

/** The only placeholder a rewrite target may contain. */
const PACKAGE_ROOT_PLACEHOLDER = "${packageRoot}";

/**
 * Parse `agents/body-rewrites.yaml`, the delivery-time body path-anchoring
 * table. Same fail-closed rules as the override parser: unknown keys, wrong
 * indentation, a missing `to`, duplicate `from` prefixes, and any
 * placeholder other than `${packageRoot}` in `to` throw with the offending
 * line number, so a malformed table can never reach conversion.
 */
export const parseBodyRewritesYaml = (text: string): BodyRewrite[] => {
  const lines = text.split(/\r?\n/);
  const rewrites: BodyRewrite[] = [];
  let sawRewrites = false;
  let pending: { from: string } | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];

    if (isBlankOrComment(raw)) continue;

    const lineNo = i + 1;
    const indent = raw.length - raw.trimStart().length;
    const content = raw.trim();

    if (indent === 0) {
      if (content !== "rewrites:") {
        throw new Error(`yaml-mini: unexpected top-level key on line ${lineNo}.`);
      }
      if (sawRewrites) {
        throw new Error(`yaml-mini: duplicate "rewrites" key on line ${lineNo}.`);
      }
      sawRewrites = true;
      continue;
    }

    if (indent === 2 && content.startsWith("- from:")) {
      if (!sawRewrites) {
        throw new Error(`yaml-mini: rewrite entry before the "rewrites" key on line ${lineNo}.`);
      }
      if (pending !== undefined) {
        throw new Error(
          `yaml-mini: rewrite entry "${pending.from}" is missing "to" before line ${lineNo}.`,
        );
      }
      const from = parseNonEmptyString(content.slice("- from:".length), lineNo, 'rewrite "from"');

      if (from.includes("${")) {
        throw new Error(
          `yaml-mini: "from" must be a literal prefix without placeholders on line ${lineNo}.`,
        );
      }

      if (rewrites.some((rewrite) => rewrite.from === from)) {
        throw new Error(`yaml-mini: duplicate rewrite prefix "${from}" on line ${lineNo}.`);
      }

      pending = { from };
      continue;
    }

    if (indent === 4) {
      if (pending === undefined) {
        throw new Error(`yaml-mini: rewrite key without a preceding "- from" on line ${lineNo}.`);
      }
      const keyValue = splitKeyValue(content);

      if (!keyValue || keyValue.key !== "to") {
        throw new Error(
          `yaml-mini: expected "to: <target>" for rewrite "${pending.from}" on line ${lineNo}.`,
        );
      }

      const to = parseNonEmptyString(keyValue.value, lineNo, 'rewrite "to"');
      const withoutAllowed = to.split(PACKAGE_ROOT_PLACEHOLDER).join("");

      if (withoutAllowed.includes("${")) {
        throw new Error(
          `yaml-mini: unsupported placeholder in "to" on line ${lineNo}; only \${packageRoot} is allowed.`,
        );
      }

      if (!to.startsWith(`${PACKAGE_ROOT_PLACEHOLDER}/`)) {
        throw new Error(`yaml-mini: "to" must start with "\${packageRoot}/" on line ${lineNo}.`);
      }

      if (
        to
          .slice(PACKAGE_ROOT_PLACEHOLDER.length + 1)
          .split("/")
          .includes("..")
      ) {
        throw new Error(`yaml-mini: "to" must not escape the package root on line ${lineNo}.`);
      }

      rewrites.push({ from: pending.from, to });
      pending = undefined;
      continue;
    }

    if (indent === 2) {
      throw new Error(`yaml-mini: expected "- from: <prefix>" on line ${lineNo}.`);
    }

    throw new Error(`yaml-mini: unexpected indentation on line ${lineNo}.`);
  }

  if (!sawRewrites) {
    throw new Error('yaml-mini: missing required "rewrites" key.');
  }

  if (pending !== undefined) {
    throw new Error(`yaml-mini: rewrite entry "${pending.from}" is missing "to".`);
  }

  if (rewrites.length === 0) {
    throw new Error('yaml-mini: "rewrites" declares no entries.');
  }

  return rewrites;
};
