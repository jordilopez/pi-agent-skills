import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type OwnedAgent = {
  sourcePath: string;
  targetPath: string;
  sha256: string;
};

type OwnershipManifest = {
  formatVersion: number;
  packageName: string;
  packageVersion: string;
  agents: OwnedAgent[];
};

const FORMAT_VERSION = 1;
const PACKAGE_NAME = "agent-skills-pi";
const PACKAGE_VERSION = "0.6.9-pi.0";
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

  return compiledPackageCandidate;
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

const resolveAgentTargetPath = (projectRoot: string, agentName: string): string => {
  return join(projectRoot, AGENTS_DIR, agentName);
};

const normalizeOwnedAgent = (entry: OwnedAgent): OwnedAgent => ({
  sourcePath: entry.sourcePath,
  targetPath: entry.targetPath,
  sha256: entry.sha256,
});

const assertOwnershipManifest = (candidate: unknown, manifestPath: string): OwnershipManifest => {
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Malformed agent-skills manifest at ${manifestPath}.`);
  }

  const manifest = candidate as Record<string, unknown>;

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

  if (!Array.isArray(manifest.agents)) {
    throw new Error(`Malformed agent-skills manifest at ${manifestPath}. Missing agents array.`);
  }

  return {
    formatVersion: FORMAT_VERSION,
    packageName: PACKAGE_NAME,
    packageVersion: String(manifest.packageVersion ?? PACKAGE_VERSION),
    agents: manifest.agents.map((entry) => normalizeOwnedAgent(entry as OwnedAgent)),
  };
};

const readManifest = async (manifestPath: string): Promise<OwnershipManifest | null> => {
  try {
    await stat(manifestPath);
  } catch {
    return null;
  }

  return assertOwnershipManifest(await readJson(manifestPath), manifestPath);
};

const writeManifest = async (manifestPath: string, manifest: OwnershipManifest): Promise<void> => {
  await writeJson(manifestPath, manifest);
};

const buildManifestEntry = async (
  packageRoot: string,
  projectRoot: string,
  agentName: string,
): Promise<OwnedAgent> => {
  const sourcePath = join(packageRoot, SOURCE_AGENTS_DIR, agentName);
  const targetPath = resolveAgentTargetPath(projectRoot, agentName);
  const fileHash = await sha256(sourcePath);

  return {
    sourcePath,
    targetPath,
    sha256: fileHash,
  };
};

const ensureDirectory = async (directoryPath: string): Promise<void> => {
  await mkdir(directoryPath, { recursive: true });
};

const installOrUpdate = async (projectRoot: string, packageRoot: string): Promise<void> => {
  const sourceDir = join(packageRoot, SOURCE_AGENTS_DIR);
  let sourceDirExists = false;

  try {
    await stat(sourceDir);
    sourceDirExists = true;
  } catch {
    sourceDirExists = false;
  }

  if (!sourceDirExists) {
    throw new Error("Package agents source directory is missing.");
  }

  for (const agentName of AGENT_NAMES) {
    try {
      await stat(join(sourceDir, agentName));
    } catch {
      throw new Error(`Package agents source directory is missing required file "${agentName}".`);
    }
  }

  const manifestPath = resolveManifestPath(projectRoot);
  const manifest = await readManifest(manifestPath);

  if (manifest !== null && manifest.packageName !== PACKAGE_NAME) {
    throw new Error("Foreign agent-skills manifest detected. refusing to overwrite.");
  }

  const nextAgents: OwnedAgent[] = manifest ? [...manifest.agents] : [];

  await ensureDirectory(join(projectRoot, AGENTS_DIR));
  await ensureDirectory(dirname(manifestPath));

  for (const agentName of AGENT_NAMES) {
    const entry = await buildManifestEntry(packageRoot, projectRoot, agentName);
    const existingIndex = nextAgents.findIndex(
      (current) => current.targetPath === entry.targetPath,
    );
    const existing = existingIndex === -1 ? null : nextAgents[existingIndex];

    let targetExists = false;

    try {
      await stat(entry.targetPath);
      targetExists = true;
    } catch {
      targetExists = false;
    }

    if (existing) {
      await writeFile(entry.targetPath, await readFile(entry.sourcePath));
      nextAgents[existingIndex] = entry;
      console.log(`agent-skills: updated ${agentName}`);
      continue;
    }

    if (targetExists) {
      console.log(`agent-skills: skipped ${agentName} (foreign file already exists)`);
      continue;
    }

    await writeFile(entry.targetPath, await readFile(entry.sourcePath));
    nextAgents.push(entry);
    console.log(`agent-skills: installed ${agentName}`);
  }

  await writeManifest(manifestPath, {
    formatVersion: FORMAT_VERSION,
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    agents: nextAgents.filter((entry) =>
      AGENT_NAMES.includes(entry.targetPath.split("/").pop() as (typeof AGENT_NAMES)[number]),
    ),
  });
};

const status = async (projectRoot: string, packageRoot: string): Promise<void> => {
  const manifestPath = resolveManifestPath(projectRoot);
  const manifest = await readManifest(manifestPath);

  if (manifest === null) {
    console.log("agent-skills: not installed in this project.");
    return;
  }

  if (manifest.packageName !== PACKAGE_NAME) {
    console.log("agent-skills: foreign manifest detected; skipping status report.");
    return;
  }

  for (const owned of manifest.agents) {
    const agentName = owned.targetPath.split("/").pop() as (typeof AGENT_NAMES)[number];

    let targetExists = false;

    try {
      await stat(owned.targetPath);
      targetExists = true;
    } catch {
      targetExists = false;
    }

    if (!targetExists) {
      console.log(`agent-skills: ${agentName} missing`);
      continue;
    }

    const currentHash = await sha256(owned.targetPath);

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
      const absoluteEntry = join(projectRoot, AGENTS_DIR, entry);

      if (ownedTargetPaths.has(absoluteEntry)) {
        continue;
      }

      try {
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
  const manifest = await readManifest(manifestPath);

  if (manifest === null) {
    console.log("agent-skills: nothing to uninstall (no manifest found).");
    return;
  }

  if (manifest.packageName !== PACKAGE_NAME) {
    console.log("agent-skills: foreign manifest detected; refusing to uninstall.");
    return;
  }

  for (const owned of manifest.agents) {
    const agentName = owned.targetPath.split("/").pop() as (typeof AGENT_NAMES)[number];

    let targetExists = false;

    try {
      await stat(owned.targetPath);
      targetExists = true;
    } catch {
      targetExists = false;
    }

    if (!targetExists) {
      console.log(`agent-skills: skipped ${agentName} (already missing)`);
      continue;
    }

    const currentHash = await sha256(owned.targetPath);

    if (currentHash !== owned.sha256) {
      console.log(`agent-skills: skipped ${agentName} (hash mismatch)`);
      continue;
    }

    await rm(owned.targetPath, { force: true });
    console.log(`agent-skills: removed ${agentName}`);
  }

  await rm(manifestPath, { force: true });
  console.log("agent-skills: manifest removed.");
};

const registerAgentDelivery = (pi: ExtensionAPI): void => {
  pi.registerCommand("agent-skills:install", {
    description: "Install this package's owned agents into the current project.",
    handler: async (_args, ctx) => {
      const projectRoot = ctx?.cwd ?? resolveProjectRoot();

      if (!projectRoot) {
        console.error("agent-skills: could not determine the current project root.");
        return;
      }

      await installOrUpdate(projectRoot, resolvePackageRoot());
    },
  });

  pi.registerCommand("agent-skills:update", {
    description: "Refresh this package's owned agents in the current project.",
    handler: async (_args, ctx) => {
      const projectRoot = ctx?.cwd ?? resolveProjectRoot();

      if (!projectRoot) {
        console.error("agent-skills: could not determine the current project root.");
        return;
      }

      await installOrUpdate(projectRoot, resolvePackageRoot());
    },
  });

  pi.registerCommand("agent-skills:status", {
    description: "Show owned agent status for the current project.",
    handler: async (_args, ctx) => {
      const projectRoot = ctx?.cwd ?? resolveProjectRoot();

      if (!projectRoot) {
        console.error("agent-skills: could not determine the current project root.");
        return;
      }

      await status(projectRoot, resolvePackageRoot());
    },
  });

  pi.registerCommand("agent-skills:uninstall", {
    description: "Remove this package's owned agents and manifest from the current project.",
    handler: async (_args, ctx) => {
      const projectRoot = ctx?.cwd ?? resolveProjectRoot();

      if (!projectRoot) {
        console.error("agent-skills: could not determine the current project root.");
        return;
      }

      await uninstall(projectRoot, resolvePackageRoot());
    },
  });
};

export {
  AGENT_NAMES,
  AGENTS_DIR,
  FORMAT_VERSION,
  MANIFEST_DIR,
  MANIFEST_FILE,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  SOURCE_AGENTS_DIR,
};

export type { OwnedAgent, OwnershipManifest };

export {
  assertOwnershipManifest,
  buildManifestEntry,
  installOrUpdate,
  normalizeOwnedAgent,
  readJson,
  readManifest,
  resolveAgentTargetPath,
  resolveManifestPath,
  resolvePackageRoot,
  resolveProjectRoot,
  sha256,
  status,
  uninstall,
  writeJson,
  writeManifest,
};

export default registerAgentDelivery;
