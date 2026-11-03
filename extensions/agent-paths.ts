import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";

export type TargetState = "missing" | "symlink" | "directory" | "regular" | "other";

/** Normalize a manifest path to a POSIX contract string (forward slashes). */
export const posixNormalize = (p: string): string => posix.normalize(p.replace(/\\/g, "/"));

export const sha256Content = (content: string | Buffer): string =>
  createHash("sha256").update(content).digest("hex");

export const sha256 = async (filePath: string): Promise<string> =>
  sha256Content(await readFile(filePath));

/** Write a file atomically via a temp file in the same directory, then rename. */
export const writeFileAtomic = async (
  filePath: string,
  content: string | Buffer,
): Promise<void> => {
  const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;

  try {
    await writeFile(tempPath, content);
    await rename(tempPath, filePath);
  } catch (error) {
    try {
      await rm(tempPath, { force: true });
    } catch {
      // Best-effort cleanup of the temporary file.
    }

    throw error;
  }
};

export const isPathContained = (candidate: string, root: string): boolean => {
  // Use platform-aware relativization so containment is correct on Windows
  // (backslash separators) and on roots with a trailing separator.
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
};

export const hasTraversalSegments = (relativePath: string): boolean => {
  // Normalize to POSIX separators so the check is correct on Windows
  // (path.normalize on Windows converts / to \, which would miss an
  // absolute /foo on Windows since startsWith("/") would be false).
  const normalized = posixNormalize(relativePath);
  return normalized.startsWith("..") || normalized.startsWith("/");
};

export const isRelativePath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  !isAbsolute(value) &&
  !hasTraversalSegments(value);

/** Resolve a package-relative path against the verified package root. */
export const resolvePackagePath = (packageRoot: string, relativePath: string): string => {
  const resolved = resolve(packageRoot, relativePath);

  if (!isPathContained(resolved, packageRoot)) {
    throw new Error(`Package-relative path escapes the package root: ${relativePath}`);
  }

  return resolved;
};

/** Resolve a project-relative path against the verified project root. */
export const resolveProjectPath = (projectRoot: string, relativePath: string): string => {
  const resolved = resolve(projectRoot, relativePath);

  if (!isPathContained(resolved, projectRoot)) {
    throw new Error(`Project-relative path escapes the project root: ${relativePath}`);
  }

  return resolved;
};

export const assertFilePathSafe = (filePath: string, root: string, label: string): void => {
  if (!isAbsolute(filePath)) {
    throw new Error(`${label} must be an absolute path: ${filePath}`);
  }

  if (!isPathContained(filePath, root)) {
    throw new Error(`${label} resolves outside the expected root: ${filePath}`);
  }
};

export const assertFileIsRegular = async (filePath: string, label: string): Promise<void> => {
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

/**
 * Walk every path component from `root` down to `targetPath`, rejecting any
 * existing symlink. Returns `true` when the full path exists, `false` when a
 * component (and therefore everything below it) is missing.
 */
export const assertNoSymlinkComponents = async (
  targetPath: string,
  root: string,
  label: string,
): Promise<boolean> => {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(targetPath);
  const relativeTarget = relative(resolvedRoot, resolvedTarget);

  if (relativeTarget === "") {
    return true;
  }

  if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
    throw new Error(`${label} is outside the verified root: ${targetPath}`);
  }

  const segments = relativeTarget.split(sep).filter((segment) => segment.length > 0);
  let current = resolvedRoot;

  for (const segment of segments) {
    current = join(current, segment);

    let componentStat;

    try {
      componentStat = await lstat(current);
    } catch {
      return false;
    }

    if (componentStat.isSymbolicLink()) {
      throw new Error(`${label} must not traverse a symlink: ${current}`);
    }
  }

  return true;
};

/**
 * Create a managed directory only after confirming no existing component in
 * its path is a symlink, then verify the final object is a real directory.
 */
export const ensureSafeDirectory = async (
  directoryPath: string,
  root: string,
  label: string,
): Promise<void> => {
  const exists = await assertNoSymlinkComponents(directoryPath, root, label);

  if (!exists) {
    await mkdir(directoryPath, { recursive: true });
    // Re-check after creation: an attacker may have raced an intermediate symlink
    // in the gap between the original check and the mkdir.
    await assertNoSymlinkComponents(directoryPath, root, label);
  }

  const directoryStat = await lstat(directoryPath);

  if (directoryStat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symlink: ${directoryPath}`);
  }

  if (!directoryStat.isDirectory()) {
    throw new Error(`${label} must be a directory: ${directoryPath}`);
  }
};

export const inspectTargetState = async (resolvedTarget: string): Promise<TargetState> => {
  let targetStat;

  try {
    targetStat = await lstat(resolvedTarget);
  } catch {
    return "missing";
  }

  if (targetStat.isSymbolicLink()) {
    return "symlink";
  }

  if (targetStat.isDirectory()) {
    return "directory";
  }

  if (targetStat.isFile()) {
    return "regular";
  }

  return "other";
};
