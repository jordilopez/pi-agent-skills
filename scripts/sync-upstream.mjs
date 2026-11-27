import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isProtectedPath, validateUpstreamConfig } from './sync-config.mjs';

const SHA = /^[a-f0-9]{40}$/;

// Validate every existing path component before reading or mutating it. This prevents
// an upstream or package checkout symlink from redirecting a sync outside its root.
const assertSafePath = async (root, target, { allowMissingLeaf = false } = {}) => {
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink()) throw new Error(`symbolic links are not supported: ${root}`);
  if (!rootInfo.isDirectory()) throw new Error(`path root is not a directory: ${root}`);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`path escapes root: ${target}`);
  const components = relative ? relative.split(path.sep) : [];
  let current = root;
  for (const [index, component] of components.entries()) {
    current = path.join(current, component);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`symbolic links are not supported: ${path.relative(root, current)}`);
      if (index < components.length - 1 && !info.isDirectory()) throw new Error(`path component is not a directory: ${current}`);
    } catch (error) {
      if (error.code === 'ENOENT' && allowMissingLeaf && index === components.length - 1) return;
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
};

// Enumerate regular files only; symlinks and special filesystem entries are rejected.
const files = async (root, prefix = '') => {
  await assertSafePath(root, root);
  const entries = await readdir(root, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(prefix, entry.name);
    const full = path.join(root, entry.name);
    const info = await lstat(full);
    if (info.isSymbolicLink()) throw new Error(`symbolic links are not supported: ${relative}`);
    if (info.isDirectory()) result.push(...await files(full, relative));
    else if (info.isFile()) result.push(relative);
    else throw new Error(`unsupported filesystem entry: ${relative}`);
  }
  return result;
};

// Missing destinations are allowed during planning, but existing entries must be regular files.
async function assertRegularFile(filePath, label) {
  try {
    const info = await lstat(filePath);
    if (!info.isFile()) throw new Error(`${label} must be a regular file: ${filePath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

// Keep the import boundary explicit: Pi-owned package files are never inferred from upstream.
const sourceMappings = (config) => [
  ...config.skills.map((name) => ({ source: `skills/${name}`, destination: `skills/${name}` })),
  { source: 'references', destination: 'references' },
  { source: 'hooks', destination: 'hooks' },
  { source: 'docs/agents.md', destination: 'docs/agents.md', file: true },
  ...config.agents.map((name) => ({ source: `agents/${name}.md`, destination: `agents/${name}.md`, file: true, bodyOnly: true })),
];

/** Computes additions, updates, removals, and agent-body replacements without mutating the package. */
export async function createSyncPlan({ config, upstreamRoot, packageRoot }) {
  const validation = validateUpstreamConfig(config);
  if (validation.errors.length) throw new Error(validation.errors.join('; '));
  const operations = [];
  for (const mapping of sourceMappings(config)) {
    if (isProtectedPath(mapping.destination)) throw new Error(`sync mapping targets protected path: ${mapping.destination}`);
    const sourceRoot = path.join(upstreamRoot, mapping.source);
    const destinationRoot = path.join(packageRoot, mapping.destination);
    if (mapping.file) {
      await assertSafePath(upstreamRoot, sourceRoot);
      await assertRegularFile(sourceRoot, 'upstream source');
      await assertSafePath(packageRoot, destinationRoot, { allowMissingLeaf: true });
      await assertRegularFile(destinationRoot, 'sync destination');
      const content = await readFile(sourceRoot);
      const current = await readFile(destinationRoot).catch(() => null);
      const next = mapping.bodyOnly && current ? preserveFrontmatter(current, content) : content;
      if (!current || !current.equals(next)) operations.push({ mapping, source: sourceRoot, destination: destinationRoot, content: next });
      continue;
    }
    await assertSafePath(upstreamRoot, sourceRoot);
    await assertSafePath(packageRoot, destinationRoot, { allowMissingLeaf: true });
    const sourceFiles = await files(sourceRoot);
    const destinationFiles = await files(destinationRoot).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const sourceSet = new Set(sourceFiles);
    for (const relative of sourceFiles) {
      const source = path.join(sourceRoot, relative);
      const destination = path.join(destinationRoot, relative);
      const content = await readFile(source);
      const current = await readFile(destination).catch(() => null);
      if (!current || !current.equals(content)) operations.push({ mapping, source, destination, content });
    }
    for (const relative of destinationFiles) {
      if (!sourceSet.has(relative)) operations.push({ mapping, destination: path.join(destinationRoot, relative), content: null });
    }
  }
  return { operations };
}

// Agent frontmatter contains Pi-specific delivery metadata, so only the upstream body is refreshed.
function preserveFrontmatter(current, upstream) {
  const text = current.toString();
  const next = upstream.toString();
  const localEnd = text.startsWith('---\n') ? text.indexOf('\n---\n', 4) : -1;
  const upstreamEnd = next.startsWith('---\n') ? next.indexOf('\n---\n', 4) : -1;
  return localEnd >= 0 && upstreamEnd >= 0 ? Buffer.from(`${text.slice(0, localEnd + 5)}${next.slice(upstreamEnd + 5)}`) : upstream;
}

/** Applies a sync plan through staged files and temporary backups so failures can be rolled back. */
export async function applySyncPlan({ plan, config, packageRoot, targetCommit }) {
  if (!SHA.test(targetCommit ?? '')) throw new Error('targetCommit must be a 40-character lowercase hexadecimal hash');
  const manifest = path.join(packageRoot, 'UPSTREAM.json');
  await assertRegularFile(manifest, 'provenance file');
  const temp = await mkdtemp(path.join(packageRoot, '.upstream-sync-'));
  const backups = [];
  const applied = [];
  let manifestBackup = null;
  let manifestReplaced = false;
  try {
    for (const [i, operation] of plan.operations.entries()) {
      await assertSafePath(packageRoot, operation.destination, { allowMissingLeaf: true });
      const staged = path.join(temp, String(i));
      await mkdir(path.dirname(staged), { recursive: true });
      if (operation.content !== null) await writeFile(staged, operation.content);
      await mkdir(path.dirname(operation.destination), { recursive: true });
      const backup = path.join(temp, 'backup', String(i));
      await mkdir(path.dirname(backup), { recursive: true });
      try { await rename(operation.destination, backup); backups.push({ operation, backup }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (operation.content !== null) await rename(staged, operation.destination);
      applied.push(operation);
    }
    // Replace provenance last, after all imported files have been staged successfully.
    const stagedManifest = path.join(temp, 'UPSTREAM.json');
    await writeFile(stagedManifest, `${JSON.stringify({ ...config, commit: targetCommit }, null, 2)}\n`);
    if (await readFile(manifest).then(() => true).catch(() => false)) {
      manifestBackup = path.join(temp, 'manifest.backup');
      await rename(manifest, manifestBackup);
    }
    await rename(stagedManifest, manifest);
    manifestReplaced = true;
  } catch (error) {
    const rollbackErrors = [];
    for (const operation of applied.reverse()) {
      try { await rm(operation.destination, { force: true }); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    for (const { operation, backup } of backups.reverse()) {
      try { await rename(backup, operation.destination); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (manifestReplaced) {
      try { await rm(manifest, { force: true }); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (manifestBackup) {
      try { await rename(manifestBackup, manifest); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], 'sync failed and rollback encountered errors');
    throw error;
  } finally { await rm(temp, { recursive: true, force: true }); }
}

async function main(args) {
  const upstreamRoot = args[args.indexOf('--upstream-root') + 1];
  const commit = args[args.indexOf('--commit') + 1];
  if (!upstreamRoot || !commit) throw new Error('usage: node scripts/sync-upstream.mjs --upstream-root PATH --commit HASH [--apply]');
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstreamRoot, encoding: 'utf8' }).trim() !== commit) throw new Error('upstream checkout HEAD does not match requested commit');
  const packageRoot = process.cwd();
  const config = JSON.parse(await readFile(path.join(packageRoot, 'UPSTREAM.json'), 'utf8'));
  const plan = await createSyncPlan({ config, upstreamRoot, packageRoot });
  console.log(`${plan.operations.length} planned operation(s).`);
  if (args.includes('--apply')) await applySyncPlan({ plan, config, packageRoot, targetCommit: commit });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
