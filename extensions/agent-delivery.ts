import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
  agents: OwnedAgent[];
};

const FORMAT_VERSION = 2;
const PACKAGE_NAME = "agent-skills-pi";
const MANIFEST_DIR = ".pi/pi-agent-skills";
const MANIFEST_FILE = "manifest.json";
const AGENTS_DIR = ".pi/agents";
const SOURCE_AGENTS_DIR = "agents";
const AGENT_NAMES = [
  "code-reviewer.md",
  "security-auditor.md",
  "test-engineer.md",
  "web-performance-auditor.md",
] as const;

const HEX64_RE = /^[0-9a-f]{64}$/;

const sha256 = async (filePath: string): Promise<string> => {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
};

const readJson = async (filePath: string): Promise<unknown> => {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as unknown;
};

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
};

const isPathContained = (candidate: string, root: string): boolean => {
  const resolvedCandidate = resolve(candidate);
  const resolvedRoot = resolve(root);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}/`);
};

const hasTraversalSegments = (relativePath: string): boolean => {
  const normalized = normalize(relativePath);
  return normalized.startsWith("..") || normalized.startsWith("/");
};

const isHex64 = (value: unknown): value is string =>
  typeof value === "string" && HEX64_RE.test(value);

const isAgentName = (value: unknown): value is (typeof AGENT_NAMES)[number] =>
  typeof value === "string" && (AGENT_NAMES as readonly string[]).includes(value);

const isRelativePath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  !isAbsolute(value) &&
  !hasTraversalSegments(value);

/** Resolve a package-relative path against the verified package root. */
const resolvePackagePath = (packageRoot: string, relativePath: string): string => {
  const resolved = resolve(packageRoot, relativePath);

  if (!isPathContained(resolved, packageRoot)) {
    throw new Error(`Package-relative path escapes the package root: ${relativePath}`);
  }

  return resolved;
};

/** Resolve a project-relative path against the verified project root. */
const resolveProjectPath = (projectRoot: string, relativePath: string): string => {
  const resolved = resolve(projectRoot, relativePath);

  if (!isPathContained(resolved, projectRoot)) {
    throw new Error(`Project-relative path escapes the project root: ${relativePath}`);
  }

  return resolved;
};

const assertFilePathSafe = (filePath: string, root: string, label: string): void => {
  if (!isAbsolute(filePath)) {
    throw new Error(`${label} must be an absolute path: ${filePath}`);
  }

  if (!isPathContained(filePath, root)) {
    throw new Error(`${label} resolves outside the expected root: ${filePath}`);
  }
};

const assertFileIsRegular = async (filePath: string, label: string): Promise<void> => {
  try {
    const fileStat = await lstat(filePath);

    if (fileStat.isSymbolicLink()) {
      throw new Error(`${label} must not be a symlink: ${filePath}`);
    }

    if (!fileStat.isFile()) {
      throw new Error(`${label} must be a regular file: ${filePath}`);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("must not be a symlink") ||
        error.message.includes("must be a regular file"))
    ) {
      throw error;
    }

    throw new Error(`${label} is inaccessible: ${filePath}`);
  }
};

const validateOwnedAgentEntry = (
  entry: unknown,
  manifestPath: string,
  packageRoot: string,
  projectRoot: string,
  index: number,
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
  const normalizedSource = normalize(record.sourcePath);

  if (normalizedSource !== expectedSource) {
    throw new Error(
      `Source path at index ${index} does not point to the expected package agent file: ${record.sourcePath}`,
    );
  }

  const expectedTarget = `${AGENTS_DIR}/${agentName}`;
  const normalizedTarget = normalize(record.targetPath);

  if (normalizedTarget !== expectedTarget) {
    throw new Error(
      `Target path at index ${index} does not point to the expected project agent file: ${record.targetPath}`,
    );
  }

  return {
    sourcePath: normalizedSource,
    targetPath: normalizedTarget,
    sha256: record.sha256,
  };
};

const resolvePackageRoot = (): string => {
  const compiledPackageCandidate = dirname(fileURLToPath(new URL("..", import.meta.url)));
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

const assertOwnershipManifest = (
  candidate: unknown,
  manifestPath: string,
  packageRoot: string,
  projectRoot: string,
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

  if (manifest.formatVersion !== FORMAT_VERSION) {
    throw new Error(
      `Foreign agent-skills manifest at ${manifestPath}. Expected format version ${FORMAT_VERSION}.`,
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

  const seen = new Set<string>();
  const agents: OwnedAgent[] = manifest.agents.map((entry, index) => {
    const validated = validateOwnedAgentEntry(entry, manifestPath, packageRoot, projectRoot, index);

    if (seen.has(validated.targetPath)) {
      throw new Error(
        `Duplicate agent entry for "${validated.targetPath}" at index ${index} in ${manifestPath}.`,
      );
    }

    seen.add(validated.targetPath);
    return validated;
  });

  return {
    formatVersion: FORMAT_VERSION,
    packageName: PACKAGE_NAME,
    packageVersion: manifest.packageVersion,
    agents,
  };
};

const readManifest = async (
  manifestPath: string,
  packageRoot: string,
  projectRoot: string,
): Promise<OwnershipManifest | null> => {
  try {
    await stat(manifestPath);
  } catch {
    return null;
  }

  return assertOwnershipManifest(
    await readJson(manifestPath),
    manifestPath,
    packageRoot,
    projectRoot,
  );
};

const writeManifest = async (manifestPath: string, manifest: OwnershipManifest): Promise<void> => {
  await writeJson(manifestPath, manifest);
};

const buildManifestEntry = async (
  packageRoot: string,
  projectRoot: string,
  agentName: string,
): Promise<OwnedAgent> => {
  const sourceRelative = `${SOURCE_AGENTS_DIR}/${agentName}`;
  const targetRelative = `${AGENTS_DIR}/${agentName}`;
  const resolvedSource = resolvePackagePath(packageRoot, sourceRelative);
  const fileHash = await sha256(resolvedSource);

  return {
    sourcePath: sourceRelative,
    targetPath: targetRelative,
    sha256: fileHash,
  };
};

const ensureDirectory = async (directoryPath: string): Promise<void> => {
  await mkdir(directoryPath, { recursive: true });
};

const installOrUpdate = async (projectRoot: string, packageRoot: string): Promise<void> => {
  const packageVersion = readPackageVersion(packageRoot);
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

  for (const agentName of AGENT_NAMES) {
    const agentPath = join(sourceDir, agentName);

    try {
      await stat(agentPath);
    } catch {
      throw new Error(`Package agents source directory is missing required file "${agentName}".`);
    }

    assertFilePathSafe(agentPath, packageRoot, `Package source agent "${agentName}"`);
    await assertFileIsRegular(agentPath, `Package source agent "${agentName}"`);
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

  const nextAgents: OwnedAgent[] = manifest ? [...manifest.agents] : [];

  await ensureDirectory(join(projectRoot, AGENTS_DIR));
  await ensureDirectory(dirname(manifestPath));

  for (const agentName of AGENT_NAMES) {
    const entry = await buildManifestEntry(packageRoot, projectRoot, agentName);
    const resolvedTarget = resolveProjectPath(projectRoot, entry.targetPath);
    const resolvedSource = resolvePackagePath(packageRoot, entry.sourcePath);
    const existingIndex = nextAgents.findIndex(
      (current) => current.targetPath === entry.targetPath,
    );
    const existing = existingIndex === -1 ? null : nextAgents[existingIndex];

    let targetExists = false;
    let targetIsSymlink = false;

    try {
      const targetStat = await lstat(resolvedTarget);
      targetExists = true;
      targetIsSymlink = targetStat.isSymbolicLink();
    } catch {
      targetExists = false;
      targetIsSymlink = false;
    }

    if (targetIsSymlink) {
      console.log(`agent-skills: skipped ${agentName} (target is a symlink)`);
      continue;
    }

    if (existing) {
      await writeFile(resolvedTarget, await readFile(resolvedSource));
      nextAgents[existingIndex] = entry;
      console.log(`agent-skills: updated ${agentName}`);
      continue;
    }

    if (targetExists) {
      console.log(`agent-skills: skipped ${agentName} (foreign file already exists)`);
      continue;
    }

    await writeFile(resolvedTarget, await readFile(resolvedSource));
    nextAgents.push(entry);
    console.log(`agent-skills: installed ${agentName}`);
  }

  await writeManifest(manifestPath, {
    formatVersion: FORMAT_VERSION,
    packageName: PACKAGE_NAME,
    packageVersion,
    agents: nextAgents.filter((entry) => {
      const basename = entry.targetPath.split("/").pop();
      return isAgentName(basename);
    }),
  });
};

const status = async (projectRoot: string, packageRoot: string): Promise<void> => {
  const manifestPath = resolveManifestPath(projectRoot);
  let manifest: OwnershipManifest | null = null;

  try {
    manifest = await readManifest(manifestPath, packageRoot, projectRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Foreign") || message.includes("foreign")) {
      console.log("agent-skills: foreign manifest detected; skipping status report.");
      return;
    }

    throw error;
  }

  if (manifest === null) {
    console.log("agent-skills: not installed in this project.");
    return;
  }

  if (manifest.packageName !== PACKAGE_NAME) {
    console.log("agent-skills: foreign manifest detected; skipping status report.");
    return;
  }

  for (const owned of manifest.agents) {
    const basename = owned.targetPath.split("/").pop();
    const agentName = isAgentName(basename)
      ? basename
      : ("unknown" as (typeof AGENT_NAMES)[number]);

    const resolvedTarget = resolveProjectPath(projectRoot, owned.targetPath);
    let targetExists = false;

    try {
      await stat(resolvedTarget);
      targetExists = true;
    } catch {
      targetExists = false;
    }

    if (!targetExists) {
      console.log(`agent-skills: ${agentName} missing`);
      continue;
    }

    const currentHash = await sha256(resolvedTarget);

    if (currentHash === owned.sha256) {
      console.log(`agent-skills: ${agentName} installed`);
    } else {
      console.log(`agent-skills: ${agentName} stale`);
    }
  }

  const ownedTargetPaths = new Set(manifest.agents.map((entry) => entry.targetPath));

  try {
    const agentDirEntries = await readdir(join(projectRoot, AGENTS_DIR));

    for (const entry of agentDirEntries) {
      const relativeEntry = `${AGENTS_DIR}/${entry}`;

      if (ownedTargetPaths.has(relativeEntry)) {
        continue;
      }

      try {
        const absoluteEntry = join(projectRoot, AGENTS_DIR, entry);
        const entryStat = await stat(absoluteEntry);

        if (entryStat.isFile()) {
          console.log(`agent-skills: foreign file ${entry}`);
        }
      } catch {
        // Ignore inaccessible entries.
      }
    }
  } catch {
    // Directory may not exist yet.
  }
};

const uninstall = async (projectRoot: string, packageRoot: string): Promise<void> => {
  const manifestPath = resolveManifestPath(projectRoot);
  let manifest: OwnershipManifest | null = null;

  try {
    manifest = await readManifest(manifestPath, packageRoot, projectRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Foreign") || message.includes("foreign")) {
      console.log("agent-skills: foreign manifest detected; refusing to uninstall.");
      return;
    }

    throw error;
  }

  if (manifest === null) {
    console.log("agent-skills: nothing to uninstall (no manifest found).");
    return;
  }

  if (manifest.packageName !== PACKAGE_NAME) {
    console.log("agent-skills: foreign manifest detected; refusing to uninstall.");
    return;
  }

  for (const owned of manifest.agents) {
    const basename = owned.targetPath.split("/").pop();
    const agentName = isAgentName(basename)
      ? basename
      : ("unknown" as (typeof AGENT_NAMES)[number]);

    const resolvedTarget = resolveProjectPath(projectRoot, owned.targetPath);
    let targetExists = false;

    try {
      await stat(resolvedTarget);
      targetExists = true;
    } catch {
      targetExists = false;
    }

    if (!targetExists) {
      console.log(`agent-skills: skipped ${agentName} (already missing)`);
      continue;
    }

    const currentHash = await sha256(resolvedTarget);

    if (currentHash !== owned.sha256) {
      console.log(`agent-skills: removing ${agentName} (modified since install)`);
    }

    await rm(resolvedTarget, { force: true });
    console.log(`agent-skills: removed ${agentName}`);
  }

  await rm(manifestPath, { force: true });
  console.log("agent-skills: manifest removed.");
};

// Reusable command-context helper: resolves project root from Pi's cwd or process.cwd().
const resolveProjectRootForCommand = (ctx: { cwd?: string } | undefined): string => {
  const projectRoot = ctx?.cwd ?? resolveProjectRoot();

  if (!projectRoot) {
    throw new Error("agent-skills: could not determine the current project root.");
  }

  return projectRoot;
};

const registerAgentDelivery = (pi: ExtensionAPI): void => {
  pi.registerCommand("agent-skills:install", {
    description: "Install this package's owned agents into the current project.",
    handler: async (_args, ctx) => {
      await installOrUpdate(resolveProjectRootForCommand(ctx), resolvePackageRoot());
    },
  });

  pi.registerCommand("agent-skills:update", {
    description: "Refresh this package's owned agents in the current project.",
    handler: async (_args, ctx) => {
      await installOrUpdate(resolveProjectRootForCommand(ctx), resolvePackageRoot());
    },
  });

  pi.registerCommand("agent-skills:status", {
    description: "Show owned agent status for the current project.",
    handler: async (_args, ctx) => {
      await status(resolveProjectRootForCommand(ctx), resolvePackageRoot());
    },
  });

  pi.registerCommand("agent-skills:uninstall", {
    description: "Remove this package's owned agents and manifest from the current project.",
    handler: async (_args, ctx) => {
      await uninstall(resolveProjectRootForCommand(ctx), resolvePackageRoot());
    },
  });
};

// Public API: the default export is the only entry point Pi uses.
// Named exports below are the minimum reusable types and constants for
// external testing, documentation, or tooling that inspects this extension.

export {
  AGENT_NAMES,
  AGENTS_DIR,
  FORMAT_VERSION,
  MANIFEST_DIR,
  MANIFEST_FILE,
  PACKAGE_NAME,
  SOURCE_AGENTS_DIR,
};

export type { OwnedAgent, OwnershipManifest };

export { installOrUpdate, resolvePackageRoot, status, uninstall };

export default registerAgentDelivery;
