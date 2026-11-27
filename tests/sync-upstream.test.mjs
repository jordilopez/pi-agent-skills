import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSyncPlan, applySyncPlan } from '../scripts/sync-upstream.mjs';

const config = {
  repository: 'https://github.com/addyosmani/agent-skills',
  commit: 'a'.repeat(40),
  skills: ['example-skill'],
  agents: ['reviewer'],
};

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-skills-sync-'));
  const upstream = path.join(root, 'upstream');
  const packageRoot = path.join(root, 'package');
  await mkdir(path.join(upstream, 'skills/example-skill'), { recursive: true });
  await mkdir(path.join(packageRoot, 'skills/example-skill'), { recursive: true });
  await mkdir(path.join(upstream, 'references'), { recursive: true });
  await mkdir(path.join(packageRoot, 'references'), { recursive: true });
  await mkdir(path.join(upstream, 'hooks'), { recursive: true });
  await mkdir(path.join(packageRoot, 'hooks'), { recursive: true });
  await mkdir(path.join(upstream, 'agents'), { recursive: true });
  await mkdir(path.join(packageRoot, 'agents'), { recursive: true });
  await mkdir(path.join(upstream, 'docs'), { recursive: true });
  await mkdir(path.join(packageRoot, 'docs'), { recursive: true });
  await writeFile(path.join(upstream, 'skills/example-skill/SKILL.md'), 'new skill\n');
  await writeFile(path.join(packageRoot, 'skills/example-skill/SKILL.md'), 'old skill\n');
  await writeFile(path.join(packageRoot, 'skills/example-skill/stale.md'), 'stale\n');
  await writeFile(path.join(upstream, 'agents/reviewer.md'), '---\ndescription: upstream\n---\n\nnew body\n');
  await writeFile(path.join(packageRoot, 'agents/reviewer.md'), '---\ndescription: local\npane: false\n---\n\nold body\n');
  await writeFile(path.join(upstream, 'docs/agents.md'), 'docs\n');
  await writeFile(path.join(packageRoot, 'docs/agents.md'), 'old docs\n');
  await writeFile(path.join(packageRoot, 'UPSTREAM.json'), `${JSON.stringify(config)}\n`);
  return { root, upstream, packageRoot };
}

test('plans updates, additions, removals, and preserves agent frontmatter', async () => {
  const f = await fixture();
  try {
    const plan = await createSyncPlan({ config, upstreamRoot: f.upstream, packageRoot: f.packageRoot });
    assert.ok(plan.operations.some(({ destination, content }) => destination.endsWith('stale.md') && content === null));
    const agent = plan.operations.find(({ destination }) => destination.endsWith('agents/reviewer.md'));
    assert.match(agent.content.toString(), /description: local/);
    assert.match(agent.content.toString(), /new body/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('applies updates, removals, frontmatter, and provenance atomically', async () => {
  const f = await fixture();
  try {
    const plan = await createSyncPlan({ config, upstreamRoot: f.upstream, packageRoot: f.packageRoot });
    await applySyncPlan({ plan, config, packageRoot: f.packageRoot, targetCommit: 'b'.repeat(40) });
    assert.equal(await readFile(path.join(f.packageRoot, 'skills/example-skill/SKILL.md'), 'utf8'), 'new skill\n');
    await assert.rejects(() => readFile(path.join(f.packageRoot, 'skills/example-skill/stale.md')));
    const manifest = JSON.parse(await readFile(path.join(f.packageRoot, 'UPSTREAM.json'), 'utf8'));
    assert.equal(manifest.commit, 'b'.repeat(40));
    assert.match(await readFile(path.join(f.packageRoot, 'agents/reviewer.md'), 'utf8'), /description: local/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('rejects symlinked source and package roots', async () => {
  const f = await fixture();
  try {
    const sourceAlias = path.join(f.root, 'upstream-alias');
    const packageAlias = path.join(f.root, 'package-alias');
    await symlink(f.upstream, sourceAlias);
    await symlink(f.packageRoot, packageAlias);
    await assert.rejects(() => createSyncPlan({ config, upstreamRoot: sourceAlias, packageRoot: f.packageRoot }), /symbolic links/);
    await assert.rejects(() => createSyncPlan({ config, upstreamRoot: f.upstream, packageRoot: packageAlias }), /symbolic links/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('rejects symlinked upstream files and destination ancestors', async () => {
  const f = await fixture();
  try {
    await rm(path.join(f.upstream, 'docs/agents.md'));
    await symlink(path.join(f.root, 'outside-upstream.md'), path.join(f.upstream, 'docs/agents.md'));
    await writeFile(path.join(f.root, 'outside-upstream.md'), 'outside\n');
    await assert.rejects(() => createSyncPlan({ config, upstreamRoot: f.upstream, packageRoot: f.packageRoot }), /symbolic links/);
  } finally { await rm(f.root, { recursive: true, force: true }); }

  const ancestor = await fixture();
  try {
    await rm(path.join(ancestor.packageRoot, 'docs'), { recursive: true, force: true });
    await symlink(path.join(ancestor.root, 'outside-dir'), path.join(ancestor.packageRoot, 'docs'));
    await mkdir(path.join(ancestor.root, 'outside-dir'));
    await assert.rejects(() => createSyncPlan({ config, upstreamRoot: ancestor.upstream, packageRoot: ancestor.packageRoot }), /symbolic links/);
  } finally { await rm(ancestor.root, { recursive: true, force: true }); }
});

test('rejects symlinked individual destinations', async () => {
  const f = await fixture();
  try {
    await rm(path.join(f.packageRoot, 'docs/agents.md'));
    await symlink(path.join(f.root, 'outside.md'), path.join(f.packageRoot, 'docs/agents.md'));
    await writeFile(path.join(f.root, 'outside.md'), 'outside\n');
    await assert.rejects(() => createSyncPlan({ config, upstreamRoot: f.upstream, packageRoot: f.packageRoot }), /symbolic links/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('rollback preserves changes after a late failure', async () => {
  const f = await fixture();
  try {
    const plan = await createSyncPlan({ config, upstreamRoot: f.upstream, packageRoot: f.packageRoot });
    const broken = path.join(f.packageRoot, 'broken-target');
    await symlink(path.join(f.root, 'outside-dir'), broken);
    await mkdir(path.join(f.root, 'outside-dir'));
    plan.operations.push({ destination: path.join(broken, 'file.md'), content: Buffer.from('bad\n') });
    await assert.rejects(() => applySyncPlan({ plan, config, packageRoot: f.packageRoot, targetCommit: 'b'.repeat(40) }), /symbolic links/);
    assert.equal(await readFile(path.join(f.packageRoot, 'skills/example-skill/SKILL.md'), 'utf8'), 'old skill\n');
    assert.equal(await readFile(path.join(f.packageRoot, 'skills/example-skill/stale.md'), 'utf8'), 'stale\n');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('rejects malformed provenance before applying', async () => {
  const f = await fixture();
  try {
    await rm(path.join(f.packageRoot, 'UPSTREAM.json'));
    await mkdir(path.join(f.packageRoot, 'UPSTREAM.json'));
    const plan = await createSyncPlan({ config, upstreamRoot: f.upstream, packageRoot: f.packageRoot });
    await assert.rejects(() => applySyncPlan({ plan, config, packageRoot: f.packageRoot, targetCommit: 'b'.repeat(40) }));
    assert.equal(await readFile(path.join(f.packageRoot, 'skills/example-skill/SKILL.md'), 'utf8'), 'old skill\n');
    assert.equal(await readFile(path.join(f.packageRoot, 'skills/example-skill/stale.md'), 'utf8'), 'stale\n');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
