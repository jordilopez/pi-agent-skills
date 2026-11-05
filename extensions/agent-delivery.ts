import { readFileSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { parseAgentFile, renderAgentFile } from "./agent-frontmatter.js";
import {
  assertFileIsRegular,
  assertFilePathSafe,
  assertNoSymlinkComponents,
  ensureSafeDirectory,
  inspectTargetState,
  isRelativePath,
  posixNormalize,
  resolvePackagePath,
  resolveProjectPath,
  sha256,
  sha256Content,
  writeFileAtomic,
  type TargetState,
} from "./agent-paths.js";
import { checkCanonicalReadOnly, validateConvertedAgent } from "./agent-validation.js";
import {
  AGENT_FORMATS,
  detectFormats,
  isAgentFormat,
  type AgentFormat,
} from "./orchestrator-detection.js";
import {
  parseBodyRewritesYaml,
  parseOverrideYaml,
  type BodyRewrite,
  type OverrideFile,
} from "./yaml-mini.js";

type OwnedAgent = {
  /** Package-relative path, e.g. "agents/code-reviewer.md". */
  sourcePath: string;
  /** Project-relative path, e.g. ".pi/agents/code-reviewer.md". */
  targetPath: string;
  sha256: string;
};

type OwnershipManifest = {
  formatVersion: number;
  packageName: string;
  packageVersion: string;
  format: AgentFormat;
  agents: OwnedAgent[];
};

type AppliedAgentChange = {
  agentName: string;
  action: "installed" | "updated";
  resolvedTarget: string;
  previousContent: Buffer | null;
};

type SkippedAgent = {
  agentName: string;
  reason: string;
};

type FormatSelection =
  | { ok: true; format: AgentFormat }
  | { ok: false; kind: "unsupported"; message: string }
  | { ok: false; kind: "undetected"; message: string };

const FORMAT_VERSION = 3;
const PACKAGE_NAME = "agent-skills-pi";
// Contract paths for the ownership manifest are intentionally fixed to `.pi`
// as required by SPEC.md; this package's public manifest layout must not
// change. Pi exposes `CONFIG_DIR_NAME` for rebranded distributions, so a
// rebranded Pi install may look elsewhere; this package deliberately keeps
// `.pi` and does not follow a rebranded config directory unless the
// specification is amended.
const MANIFEST_DIR = ".pi/pi-agent-skills";
const MANIFEST_FILE = "manifest.json";
const PI_DIR = ".pi";
const SOURCE_AGENTS_DIR = "agents";
const OVERRIDES_DIR = "agents/overrides";
const BODY_REWRITES_FILE = "agents/body-rewrites.yaml";
const AGENT_NAMES = [
  "code-reviewer.md",
  "security-auditor.md",
  "test-engineer.md",
  "web-performance-auditor.md",
] as const;

const HEX64_RE = /^[0-9a-f]{64}$/;

const readJson = async (filePath: string): Promise<unknown> => {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as unknown;
};

const isHex64 = (value: unknown): value is string =>
  typeof value === "string" && HEX64_RE.test(value);

const isAgentName = (value: unknown): value is (typeof AGENT_NAMES)[number] =>
  typeof value === "string" && (AGENT_NAMES as readonly string[]).includes(value);

/**
 * Apply an override's frontmatter patch to a canonical agent source. The body
 * is preserved verbatim; only frontmatter keys are removed or set. An empty
 * patch returns the source unchanged (tmux pass-through).
 */
const convertAgent = (canonicalSource: string, override: OverrideFile): string => {
  const { remove, set } = override.frontmatter;

  if (remove.length === 0 && Object.keys(set).length === 0) {
    return canonicalSource;
  }

  const parsed = parseAgentFile(canonicalSource);
  const removed = new Set(remove);
  const entries = parsed.frontmatter.filter((entry) => !removed.has(entry.key));

  for (const [key, value] of Object.entries(set)) {
    const existingIndex = entries.findIndex((entry) => entry.key === key);

    if (existingIndex !== -1) {
      entries[existingIndex] = { key, value };
    } else {
      entries.push({ key, value });
    }
  }

  return renderAgentFile(entries, parsed.body);
};

/** Load and validate an override file for a supported format. */
const loadOverride = (format: AgentFormat, packageRoot: string): OverrideFile => {
  const overridePath = resolvePackagePath(packageRoot, `${OVERRIDES_DIR}/${format}.yaml`);

  let text: string;

  try {
    text = readFileSync(overridePath, "utf-8");
  } catch {
    throw new Error(`agent-skills: missing override file for format "${format}": ${overridePath}`);
  }

  let parsed: OverrideFile;

  try {
    parsed = parseOverrideYaml(text);
  } catch (error) {
    throw new Error(
      `agent-skills: malformed override file for format "${format}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!isRelativePath(parsed.targetDir)) {
    throw new Error(
      `agent-skills: invalid targetDir "${parsed.targetDir}" in override for format "${format}".`,
    );
  }

  return { ...parsed, targetDir: posixNormalize(parsed.targetDir) };
};

/**
 * Load and validate the delivery-time body path-anchoring table. A missing or
 * malformed table fails the install before any conversion runs, matching the
 * override loader's fail-closed behavior.
 */
const loadBodyRewrites = (packageRoot: string): BodyRewrite[] => {
  const tablePath = resolvePackagePath(packageRoot, BODY_REWRITES_FILE);

  let text: string;

  try {
    text = readFileSync(tablePath, "utf-8");
  } catch {
    throw new Error(`agent-skills: missing body rewrite table: ${tablePath}`);
  }

  try {
    return parseBodyRewritesYaml(text);
  } catch (error) {
    throw new Error(
      `agent-skills: malformed body rewrite table: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const resolvePackageRoot = (): string => {
  const compiledPackageCandidate = fileURLToPath(new URL("..", import.meta.url));
  const candidatePackageJson = join(compiledPackageCandidate, "package.json");

  try {
    const packageJsonContent = readFileSync(candidatePackageJson, "utf-8");
    const packageJson = JSON.parse(packageJsonContent) as Record<string, unknown>;

    if (packageJson?.name === PACKAGE_NAME) {
      return compiledPackageCandidate;
    }
  } catch {
    // Ignore unreadable candidates.
  }

  const cwd = process.cwd();
  const cwdPackageJson = join(cwd, "package.json");

  try {
    const packageJsonContent = readFileSync(cwdPackageJson, "utf-8");
    const packageJson = JSON.parse(packageJsonContent) as Record<string, unknown>;

    if (packageJson?.name === PACKAGE_NAME) {
      return cwd;
    }
  } catch {
    // Ignore unreadable candidates.
  }

  throw new Error(
    "Cannot resolve package root. No verified installation of agent-skills-pi was found.",
  );
};

const readPackageVersion = (packageRoot: string): string => {
  const packageJsonPath = join(packageRoot, "package.json");

  try {
    const content = readFileSync(packageJsonPath, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;

    if (typeof parsed.version !== "string" || parsed.version.length === 0) {
      throw new Error("Package version is missing or not a non-empty string.");
    }

    return parsed.version;
  } catch (error) {
    throw new Error(
      `Failed to read package version from ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const resolveProjectRoot = (): string | null => {
  try {
    return process.cwd();
  } catch {
    return null;
  }
};

const resolveManifestPath = (projectRoot: string): string => {
  return join(projectRoot, MANIFEST_DIR, MANIFEST_FILE);
};

const validateOwnedAgentEntry = (
  entry: unknown,
  manifestPath: string,
  index: number,
  expectedTargetDir: string,
): OwnedAgent => {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Malformed agent entry at index ${index} in ${manifestPath}.`);
  }

  const record = entry as Record<string, unknown>;

  if (!isRelativePath(record.targetPath)) {
    throw new Error(
      `Invalid target path at index ${index} in ${manifestPath}. Must be a relative path with no traversal segments.`,
    );
  }

  if (!isRelativePath(record.sourcePath)) {
    throw new Error(
      `Invalid source path at index ${index} in ${manifestPath}. Must be a relative path with no traversal segments.`,
    );
  }

  const agentName = record.targetPath.split("/").pop();

  if (!isAgentName(agentName)) {
    throw new Error(`Unexpected or missing agent name at index ${index} in ${manifestPath}.`);
  }

  if (!isHex64(record.sha256)) {
    throw new Error(
      `Invalid SHA-256 at index ${index} in ${manifestPath}. Expected exactly 64 lowercase hex characters.`,
    );
  }

  const expectedSource = `${SOURCE_AGENTS_DIR}/${agentName}`;
  const normalizedSource = posixNormalize(record.sourcePath);

  if (normalizedSource !== expectedSource) {
    throw new Error(
      `Source path at index ${index} does not point to the expected package agent file: ${record.sourcePath}`,
    );
  }

  const expectedTarget = posixNormalize(`${expectedTargetDir}/${agentName}`);
  const normalizedTarget = posixNormalize(record.targetPath);

  if (normalizedTarget !== expectedTarget) {
    throw new Error(
      `Target path at index ${index} does not match the manifest format's target directory: ${record.targetPath}`,
    );
  }

  return {
    sourcePath: normalizedSource,
    targetPath: normalizedTarget,
    sha256: record.sha256,
  };
};

const assertOwnershipManifest = (
  candidate: unknown,
  manifestPath: string,
  packageRoot: string,
): OwnershipManifest => {
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Malformed agent-skills manifest at ${manifestPath}.`);
  }

  const manifest = candidate as Record<string, unknown>;

  if (manifest.formatVersion === 1) {
    throw new Error(
      `Legacy agent-skills manifest at ${manifestPath}. Format version 1 is no longer supported. Run /agent-skills:uninstall then /agent-skills:install to migrate.`,
    );
  }

  if (manifest.formatVersion !== 2 && manifest.formatVersion !== FORMAT_VERSION) {
    throw new Error(
      `Foreign agent-skills manifest at ${manifestPath}. Expected format version 2 or ${FORMAT_VERSION}.`,
    );
  }

  // TypeScript now knows formatVersion is 2 or 3; keep the two aligned so a
  // future version bump cannot silently reintroduce the cast.
  const manifestVersion: 2 | typeof FORMAT_VERSION = manifest.formatVersion;

  // Version 2 was format-agnostic (tmux-only). Read it as tmux; install/update
  // rewrites it as version 3 on the next successful write.
  let format: AgentFormat;

  if (manifestVersion === 2) {
    format = "tmux";
  } else if (isAgentFormat(manifest.format)) {
    format = manifest.format;
  } else {
    throw new Error(
      `Malformed agent-skills manifest at ${manifestPath}. Missing or unsupported format.`,
    );
  }

  if (manifest.packageName !== PACKAGE_NAME) {
    throw new Error(
      `Foreign agent-skills manifest at ${manifestPath}. Expected package name "${PACKAGE_NAME}".`,
    );
  }

  if (typeof manifest.packageVersion !== "string" || manifest.packageVersion.length === 0) {
    throw new Error(
      `Malformed agent-skills manifest at ${manifestPath}. Missing or invalid package version.`,
    );
  }

  if (!Array.isArray(manifest.agents)) {
    throw new Error(`Malformed agent-skills manifest at ${manifestPath}. Missing agents array.`);
  }

  const expectedTargetDir = posixNormalize(loadOverride(format, packageRoot).targetDir);
  const seen = new Set<string>();
  const agents: OwnedAgent[] = manifest.agents.map((entry, index) => {
    const validated = validateOwnedAgentEntry(entry, manifestPath, index, expectedTargetDir);

    if (seen.has(validated.targetPath)) {
      throw new Error(
        `Duplicate agent entry for "${validated.targetPath}" at index ${index} in ${manifestPath}.`,
      );
    }

    seen.add(validated.targetPath);
    return validated;
  });

  return {
    formatVersion: manifestVersion,
    packageName: PACKAGE_NAME,
    packageVersion: manifest.packageVersion,
    format,
    agents,
  };
};

const readManifest = async (
  manifestPath: string,
  packageRoot: string,
  projectRoot: string,
): Promise<OwnershipManifest | null> => {
  const exists = await assertNoSymlinkComponents(manifestPath, projectRoot, "Manifest path");

  if (!exists) {
    return null;
  }

  const manifestStat = await lstat(manifestPath);

  if (!manifestStat.isFile()) {
    throw new Error(`Manifest path must be a regular file: ${manifestPath}`);
  }

  return assertOwnershipManifest(await readJson(manifestPath), manifestPath, packageRoot);
};

const writeManifest = async (manifestPath: string, manifest: OwnershipManifest): Promise<void> => {
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFileAtomic(manifestPath, content);
};

const buildManifestEntry = (
  targetDir: string,
  agentName: string,
  convertedContent: string,
): OwnedAgent => {
  return {
    sourcePath: `${SOURCE_AGENTS_DIR}/${agentName}`,
    targetPath: `${targetDir}/${agentName}`,
    sha256: sha256Content(convertedContent),
  };
};

/**
 * Restore the filesystem to its pre-operation state by reversing applied
 * changes: created files are deleted, updated files are restored with their
 * captured previous content. Runs best-effort and reports per-agent outcomes.
 */
const rollbackAppliedChanges = async (
  changes: AppliedAgentChange[],
): Promise<{ rolledBack: string[]; rollbackFailures: string[] }> => {
  const rolledBack: string[] = [];
  const rollbackFailures: string[] = [];

  for (const change of [...changes].reverse()) {
    try {
      if (change.previousContent === null) {
        // Remove a file created during the forward operation.
        // rm on a symlink removes the entry itself, not the target.
        await rm(change.resolvedTarget, { force: true });
      } else {
        // Guard: only restore if the target is a regular file, not a symlink
        // that may have appeared after the forward write.
        const fileStat = await lstat(change.resolvedTarget);

        if (!fileStat.isFile()) {
          rollbackFailures.push(change.agentName);
          continue;
        }

        // Use the same atomic write mechanism as the forward path to avoid
        // following a symlink that appeared between the check and write.
        await writeFileAtomic(change.resolvedTarget, change.previousContent);
      }

      rolledBack.push(change.agentName);
    } catch {
      rollbackFailures.push(change.agentName);
    }
  }

  return { rolledBack, rollbackFailures };
};

const describeInstallFailure = (
  error: unknown,
  applied: AppliedAgentChange[],
  skipped: SkippedAgent[],
  rollback: { rolledBack: string[]; rollbackFailures: string[] },
): string => {
  const reason = error instanceof Error ? error.message : String(error);
  const parts: string[] = [`agent-skills: install/update failed: ${reason}`];

  if (applied.length > 0) {
    parts.push(`applied before failure: ${applied.map((change) => change.agentName).join(", ")}`);
  }

  if (rollback.rolledBack.length > 0) {
    parts.push(`rolled back: ${rollback.rolledBack.join(", ")}`);
  }

  if (rollback.rollbackFailures.length > 0) {
    parts.push(`rollback failed, manual cleanup required: ${rollback.rollbackFailures.join(", ")}`);
  }

  if (skipped.length > 0) {
    parts.push(
      `left untouched: ${skipped.map((skip) => `${skip.agentName} (${skip.reason})`).join(", ")}`,
    );
  }

  return parts.join("; ");
};

type NotifyLevel = "info" | "warn" | "error";
type Notify = (message: string, level?: NotifyLevel) => void;

/**
 * Resolve the Pi UI notify channel from an unknown command handler context.
 * Returns a no-op stderr writer when no UI is supplied (e.g. direct invocation
 * in tests) so stray calls never bleed into the TUI's stdout.
 */
const makeNotify = (ctx: unknown): Notify => {
  const ctxObj = ctx as
    { ui?: { notify?: (message: string, level?: NotifyLevel) => void } } | undefined;
  const target = ctxObj?.ui?.notify;
  if (typeof target === "function") {
    return (message: string, level: NotifyLevel = "info") => target(message, level);
  }
  return (message: string) => process.stderr.write(`agent-skills: ${message}\n`);
};

/**
 * Batch notify helper. Pi's TUI `showStatus()` deliberately dedupes
 * back-to-back info-level notifications (see interactive-mode.js showStatus:
 * "we update the previous status line instead of appending new ones to avoid
 * log spam"), so calling {@link Notify} once per agent would collapse N
 * messages into the last one. Each command collects its per-agent output via
 * {@link BatchedNotify.add} (newline-separated), then calls
 * {@link BatchedNotify.flush} to emit one notify. Any line added with severity
 * "warn" or "error" escalates the single notification's level so the user
 * sees the batch as needing attention. flush() is a no-op when no lines were
 * added, so commands with empty output stay silent.
 */
type BatchedNotify = {
  add: (line: string, severity?: NotifyLevel) => void;
  flush: () => void;
};

const createBatchedNotify = (notify: Notify): BatchedNotify => {
  const lines: string[] = [];
  let level: NotifyLevel = "info";
  return {
    add(line: string, severity: NotifyLevel = "info"): void {
      lines.push(line);
      if (severity !== "info") {
        level = severity;
      }
    },
    flush(): void {
      if (lines.length > 0) {
        notify(lines.join("\n"), level);
      }
    },
  };
};

const installOrUpdate = async (
  projectRoot: string,
  packageRoot: string,
  notify: Notify,
  format: AgentFormat,
): Promise<void> => {
  const packageVersion = readPackageVersion(packageRoot);
  const override = loadOverride(format, packageRoot);
  const sourceDir = join(packageRoot, SOURCE_AGENTS_DIR);

  try {
    const dirStat = await lstat(sourceDir);

    if (dirStat.isSymbolicLink()) {
      throw new Error("Package agents source directory must not be a symlink.");
    }

    if (!dirStat.isDirectory()) {
      throw new Error("Package agents source directory must be a directory.");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("symlink") || error.message.includes("must be a directory"))
    ) {
      throw error;
    }

    throw new Error("Package agents source directory is missing.");
  }

  // Read and verify every canonical source before any project writes happen.
  const canonicalSources = new Map<string, string>();

  for (const agentName of AGENT_NAMES) {
    const agentPath = join(sourceDir, agentName);

    try {
      await stat(agentPath);
    } catch {
      throw new Error(`Package agents source directory is missing required file "${agentName}".`);
    }

    assertFilePathSafe(agentPath, packageRoot, `Package source agent "${agentName}"`);
    await assertFileIsRegular(agentPath, `Package source agent "${agentName}"`);

    const content = await readFile(agentPath, "utf-8");
    const canonicalCheck = checkCanonicalReadOnly(agentName, content);

    if (!canonicalCheck.ok) {
      throw new Error(`agent-skills: canonical agent is not read-only: ${canonicalCheck.reason}`);
    }

    canonicalSources.set(agentName, content);
  }

  const manifestPath = resolveManifestPath(projectRoot);
  let manifest: OwnershipManifest | null = null;

  try {
    manifest = await readManifest(manifestPath, packageRoot, projectRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Foreign") || message.includes("foreign")) {
      throw new Error("Refusing to overwrite a foreign agent-skills manifest.");
    }

    throw error;
  }

  // Format switch refusal: a project installs exactly one format at a time.
  // Must fail before any write, directory creation, or hash recompute.
  if (manifest !== null && manifest.format !== format) {
    throw new Error(
      `agent-skills: project is installed with format "${manifest.format}". ` +
        `Run /agent-skills:uninstall before installing "${format}".`,
    );
  }

  // Convert all four agents and validate before the first project write, so a
  // bad override or conversion fails with zero filesystem mutation.
  const converted = new Map<string, { entry: OwnedAgent; content: Buffer }>();

  for (const agentName of AGENT_NAMES) {
    const canonical = canonicalSources.get(agentName);

    if (canonical === undefined) {
      throw new Error(`agent-skills: missing canonical source for "${agentName}".`);
    }

    const convertedText = convertAgent(canonical, override);
    const validation = validateConvertedAgent(format, convertedText);

    if (!validation.ok) {
      throw new Error(`agent-skills: conversion failed for ${agentName}: ${validation.reason}`);
    }

    converted.set(agentName, {
      entry: buildManifestEntry(override.targetDir, agentName, convertedText),
      content: Buffer.from(convertedText, "utf-8"),
    });
  }

  const nextAgents: OwnedAgent[] = manifest ? [...manifest.agents] : [];
  const appliedChanges: AppliedAgentChange[] = [];
  const skippedAgents: SkippedAgent[] = [];

  await ensureSafeDirectory(join(projectRoot, PI_DIR), projectRoot, "Project .pi directory");
  await ensureSafeDirectory(
    resolveProjectPath(projectRoot, override.targetDir),
    projectRoot,
    "Managed agents directory",
  );
  await ensureSafeDirectory(
    join(projectRoot, MANIFEST_DIR),
    projectRoot,
    "Managed manifest directory",
  );
  await assertNoSymlinkComponents(manifestPath, projectRoot, "Manifest file");

  try {
    for (const agentName of AGENT_NAMES) {
      const prepared = converted.get(agentName);

      if (prepared === undefined) {
        throw new Error(`agent-skills: missing converted content for "${agentName}".`);
      }

      const { entry, content } = prepared;
      const resolvedTarget = resolveProjectPath(projectRoot, entry.targetPath);
      const existingIndex = nextAgents.findIndex(
        (current) => current.targetPath === entry.targetPath,
      );
      const owned = existingIndex !== -1;
      const targetState = await inspectTargetState(resolvedTarget);

      // Non-regular targets: skip, never overwrite.
      if (targetState === "symlink" || targetState === "directory" || targetState === "other") {
        skippedAgents.push({ agentName, reason: `target is ${targetState}` });
        continue;
      }

      if (owned) {
        // Manifest-owned: update (or recreate if previously missing).
        const previousContent = targetState === "regular" ? await readFile(resolvedTarget) : null;

        appliedChanges.push({
          agentName,
          action: targetState === "missing" ? "installed" : "updated",
          resolvedTarget,
          previousContent,
        });
        await writeFileAtomic(resolvedTarget, content);
        nextAgents[existingIndex] = entry;
        continue;
      }

      if (targetState === "regular") {
        // Foreign file already exists — preserve it.
        skippedAgents.push({ agentName, reason: "foreign file already exists" });
        continue;
      }

      // Missing and not owned — fresh install.
      appliedChanges.push({
        agentName,
        action: "installed",
        resolvedTarget,
        previousContent: null,
      });
      await writeFileAtomic(resolvedTarget, content);
      nextAgents.push(entry);
    }

    await writeManifest(manifestPath, {
      formatVersion: FORMAT_VERSION,
      packageName: PACKAGE_NAME,
      packageVersion,
      format,
      agents: nextAgents.filter((entry) => {
        const basename = entry.targetPath.split("/").pop();
        return isAgentName(basename);
      }),
    });
  } catch (error) {
    const rollback = await rollbackAppliedChanges(appliedChanges);
    throw new Error(describeInstallFailure(error, appliedChanges, skippedAgents, rollback));
  }

  // One notify() carrying every agent name, mirroring `agent-skills:status`
  // (`<name> <state>` per line) so the two commands read the same way.
  const batch = createBatchedNotify(notify);
  for (const change of appliedChanges) {
    batch.add(`${change.agentName} ${change.action}`);
  }
  for (const skipped of skippedAgents) {
    batch.add(`${skipped.agentName} skipped (${skipped.reason})`, "warn");
  }
  batch.flush();
};

const describeTargetState = (state: TargetState): string => {
  switch (state) {
    case "symlink":
      return "target is a symlink";
    case "directory":
      return "target is a directory";
    case "other":
      return "target is not a regular file";
    default:
      return `target state is ${state}`;
  }
};

const status = async (projectRoot: string, packageRoot: string, notify: Notify): Promise<void> => {
  const manifestPath = resolveManifestPath(projectRoot);
  let manifest: OwnershipManifest | null = null;

  try {
    manifest = await readManifest(manifestPath, packageRoot, projectRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Foreign") || message.includes("foreign")) {
      notify("foreign manifest detected; skipping status report.", "warn");
      return;
    }

    throw error;
  }

  if (manifest === null) {
    notify("not installed in this project.");
    return;
  }

  if (manifest.packageName !== PACKAGE_NAME) {
    notify("foreign manifest detected; skipping status report.", "warn");
    return;
  }

  const targetDir = loadOverride(manifest.format, packageRoot).targetDir;
  const batch = createBatchedNotify(notify);

  for (const owned of manifest.agents) {
    const basename = owned.targetPath.split("/").pop() ?? "";
    if (!isAgentName(basename)) continue;

    const resolvedTarget = resolveProjectPath(projectRoot, owned.targetPath);
    const targetState = await inspectTargetState(resolvedTarget);

    if (targetState === "missing") {
      batch.add(`${basename} missing`, "warn");
      continue;
    }

    if (targetState !== "regular") {
      batch.add(`${basename} unsafe (${describeTargetState(targetState)}); not hashed`, "warn");
      continue;
    }

    const currentHash = await sha256(resolvedTarget);

    if (currentHash === owned.sha256) {
      batch.add(`${basename} installed`);
    } else {
      batch.add(`${basename} stale`, "warn");
    }
  }

  const ownedTargetPaths = new Set(manifest.agents.map((entry) => entry.targetPath));

  await assertNoSymlinkComponents(
    resolveProjectPath(projectRoot, targetDir),
    projectRoot,
    "Managed agents directory",
  );

  try {
    const agentDirEntries = await readdir(resolveProjectPath(projectRoot, targetDir));

    for (const entry of agentDirEntries) {
      const relativeEntry = `${targetDir}/${entry}`;

      if (ownedTargetPaths.has(relativeEntry)) {
        continue;
      }

      try {
        const absoluteEntry = resolveProjectPath(projectRoot, relativeEntry);
        const entryStat = await lstat(absoluteEntry);

        if (entryStat.isFile()) {
          batch.add(`foreign file ${entry}`, "warn");
        } else if (entryStat.isSymbolicLink()) {
          batch.add(`foreign symlink ${entry}`, "warn");
        }
      } catch {
        // Ignore inaccessible entries.
      }
    }
  } catch {
    // Directory may not exist yet.
  }

  batch.flush();
};

const uninstall = async (
  projectRoot: string,
  packageRoot: string,
  notify: Notify,
): Promise<void> => {
  const manifestPath = resolveManifestPath(projectRoot);
  let manifest: OwnershipManifest | null = null;

  try {
    manifest = await readManifest(manifestPath, packageRoot, projectRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Foreign") || message.includes("foreign")) {
      notify("foreign manifest detected; refusing to uninstall.", "warn");
      return;
    }

    throw error;
  }

  if (manifest === null) {
    notify("nothing to uninstall (no manifest found).");
    return;
  }

  if (manifest.packageName !== PACKAGE_NAME) {
    notify("foreign manifest detected; refusing to uninstall.", "warn");
    return;
  }

  const targetDir = loadOverride(manifest.format, packageRoot).targetDir;

  await assertNoSymlinkComponents(
    resolveProjectPath(projectRoot, targetDir),
    projectRoot,
    "Managed agents directory",
  );

  // See comment in installOrUpdate for why these go through one batched
  // notify and use `<name> <state>` lines.
  const batch = createBatchedNotify(notify);
  for (const owned of manifest.agents) {
    const basename = owned.targetPath.split("/").pop() ?? "";
    if (!isAgentName(basename)) continue;

    const resolvedTarget = resolveProjectPath(projectRoot, owned.targetPath);
    const targetState = await inspectTargetState(resolvedTarget);

    if (targetState === "missing") {
      batch.add(`${basename} skipped (already missing)`);
      continue;
    }

    if (targetState !== "regular") {
      batch.add(
        `${basename} skipped (unsafe: ${describeTargetState(targetState)}); preserved`,
        "warn",
      );
      continue;
    }

    const currentHash = await sha256(resolvedTarget);

    if (currentHash !== owned.sha256) {
      batch.add(`${basename} removed (modified since install)`, "warn");
    } else {
      batch.add(`${basename} removed`);
    }

    await rm(resolvedTarget, { force: true });
  }

  await rm(manifestPath, { force: true });
  batch.add("manifest removed.");
  batch.flush();
};

// Reusable command-context helper: resolves project root from Pi's cwd or process.cwd().
const resolveProjectRootForCommand = (ctx: { cwd?: string } | undefined): string => {
  const projectRoot = ctx?.cwd ?? resolveProjectRoot();

  if (!projectRoot) {
    throw new Error("agent-skills: could not determine the current project root.");
  }

  return projectRoot;
};

/** Extract a single free-text arg from a command handler's raw args. */
const argsToFormat = (args: unknown): string | undefined => {
  if (typeof args === "string") {
    const trimmed = args.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
};

/** Read the configured package sources from Pi's effective settings. */
const readInstalledPackages = (pi: ExtensionAPI): string[] => {
  const settings = pi.getSettings();
  const packages = settings.packages;

  if (!Array.isArray(packages)) return [];

  return packages
    .map((entry) => (typeof entry === "string" ? entry : entry?.source))
    .filter((source): source is string => typeof source === "string" && source.length > 0);
};

/**
 * Resolve the requested format from an explicit argument or package detection.
 * Interactive prompting is handled by the command wrapper so this stays pure.
 */
const resolveFormat = (
  arg: string | undefined,
  installedPackages: readonly string[],
): FormatSelection => {
  if (arg !== undefined) {
    if (isAgentFormat(arg)) {
      return { ok: true, format: arg };
    }

    return {
      ok: false,
      kind: "unsupported",
      message: `Unknown agent format "${arg}". Supported formats: ${AGENT_FORMATS.join(", ")}.`,
    };
  }

  const detected = detectFormats(installedPackages);

  if (detected.length === 1) {
    return { ok: true, format: detected[0] };
  }

  return {
    ok: false,
    kind: "undetected",
    message: `No single orchestrator detected. Specify one of: ${AGENT_FORMATS.join(", ")}.`,
  };
};

const resolveFormatForCommand = async (
  arg: string | undefined,
  installedPackages: string[],
  ctx: ExtensionCommandContext,
): Promise<AgentFormat> => {
  const result = resolveFormat(arg, installedPackages);

  if (result.ok) {
    return result.format;
  }

  if (result.kind === "unsupported") {
    throw new Error(`agent-skills: ${result.message}`);
  }

  if (ctx.hasUI === true && typeof ctx.ui?.select === "function") {
    const choice = await ctx.ui.select("Select orchestrator agent format", [...AGENT_FORMATS]);

    if (choice !== undefined && isAgentFormat(choice)) {
      return choice;
    }

    throw new Error("agent-skills: format selection cancelled.");
  }

  throw new Error(`agent-skills: ${result.message}`);
};

const registerAgentDelivery = (pi: ExtensionAPI): void => {
  pi.registerCommand("agent-skills:install", {
    description: "Install this package's owned agents into the current project.",
    handler: async (args, ctx) => {
      const notify = makeNotify(ctx);
      const projectRoot = resolveProjectRootForCommand(ctx);
      const format = await resolveFormatForCommand(
        argsToFormat(args),
        readInstalledPackages(pi),
        ctx,
      );
      await installOrUpdate(projectRoot, resolvePackageRoot(), notify, format);
    },
  });

  pi.registerCommand("agent-skills:update", {
    description: "Refresh this package's owned agents in the current project.",
    handler: async (args, ctx) => {
      const notify = makeNotify(ctx);
      const projectRoot = resolveProjectRootForCommand(ctx);
      const format = await resolveFormatForCommand(
        argsToFormat(args),
        readInstalledPackages(pi),
        ctx,
      );
      await installOrUpdate(projectRoot, resolvePackageRoot(), notify, format);
    },
  });

  pi.registerCommand("agent-skills:status", {
    description: "Show owned agent status for the current project.",
    handler: async (_args, ctx) => {
      const notify = makeNotify(ctx);
      await status(resolveProjectRootForCommand(ctx), resolvePackageRoot(), notify);
    },
  });

  pi.registerCommand("agent-skills:uninstall", {
    description: "Remove this package's owned agents and manifest from the current project.",
    handler: async (_args, ctx) => {
      const notify = makeNotify(ctx);
      await uninstall(resolveProjectRootForCommand(ctx), resolvePackageRoot(), notify);
    },
  });
};

// Public API: the default export is the only entry point Pi uses.
// Named exports below are the minimum reusable functions, types, and constants
// for external testing, documentation, or tooling that inspects this extension.

export {
  AGENT_NAMES,
  FORMAT_VERSION,
  MANIFEST_DIR,
  MANIFEST_FILE,
  PACKAGE_NAME,
  SOURCE_AGENTS_DIR,
};

export type { OwnedAgent, OwnershipManifest };

export {
  checkCanonicalReadOnly,
  convertAgent,
  installOrUpdate,
  loadBodyRewrites,
  loadOverride,
  resolveFormat,
  resolvePackageRoot,
  status,
  uninstall,
  validateConvertedAgent,
};

export default registerAgentDelivery;
