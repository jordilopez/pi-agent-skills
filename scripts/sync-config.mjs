const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA = /^[a-f0-9]{40}$/;

export const PROTECTED_PATHS = Object.freeze([
  'package.json', 'package-lock.json', 'README.md', 'extensions/',
  'agents/overrides/', 'agents/body-rewrites.yaml', 'scripts/', '.github/',
  'dist/', 'types/', 'tsconfig.json', 'tsconfig.build.json', 'LICENSE',
]);

export function isProtectedPath(relativePath) {
  if (relativePath.startsWith('docs/') && relativePath !== 'docs/agents.md') return true;
  return PROTECTED_PATHS.some((protectedPath) =>
    protectedPath.endsWith('/') ? relativePath.startsWith(protectedPath) : relativePath === protectedPath,
  );
}

export function validateUpstreamConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { errors: ['config must be an object'] };
  if (config.repository !== 'https://github.com/addyosmani/agent-skills') errors.push('repository must be the addyosmani/agent-skills repository');
  if (typeof config.commit !== 'string' || !SHA.test(config.commit)) errors.push('commit must be a 40-character lowercase hexadecimal hash');
  for (const field of ['skills', 'agents']) {
    if (!Array.isArray(config[field]) || config[field].length === 0) errors.push(`${field} must be a non-empty array`);
    const seen = new Set();
    for (const value of Array.isArray(config[field]) ? config[field] : []) {
      if (typeof value !== 'string' || !SLUG.test(value)) errors.push(`${field} entry must be a safe lowercase slug: ${String(value)}`);
      else if (seen.has(value)) errors.push(`${field} entry is duplicated: ${value}`);
      else seen.add(value);
    }
  }
  return { errors };
}
