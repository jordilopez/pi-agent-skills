# Upstream synchronization

This package keeps its imported skills, references, hooks, `docs/agents.md`, and selected agent bodies aligned with `addyosmani/agent-skills` through a reviewable pull-request workflow.

## Source of truth

[`UPSTREAM.json`](../UPSTREAM.json) records:

- the upstream repository;
- the exact upstream commit;
- the skill directories included in this Pi package; and
- the agent definitions whose bodies are synchronized.

Pi-specific agent frontmatter remains local. Synchronization replaces only the agent body, preserving delivery metadata such as read-only tool restrictions.

## Automation

`.github/workflows/sync-upstream.yml` runs weekly and supports manual dispatch with an optional commit SHA. It:

1. checks out the requested upstream commit, or the current upstream `main` commit for scheduled runs;
2. computes a constrained sync plan;
3. applies changes atomically with rollback;
4. runs the package validation checks; and
5. opens or updates the stable `automation/sync-agent-skills` pull request.

The workflow never writes upstream changes directly to `master`. Reviewers can inspect the imported diff and confirm Pi compatibility before merging.

## Local operation

To preview a synchronization:

```bash
node scripts/sync-upstream.mjs \
  --upstream-root /path/to/agent-skills \
  --commit <40-character-commit-sha>
```

To apply the plan, add `--apply`:

```bash
node scripts/sync-upstream.mjs \
  --upstream-root /path/to/agent-skills \
  --commit <40-character-commit-sha> \
  --apply
```

The checked-out upstream `HEAD` must exactly match the supplied SHA. The synchronizer rejects symlinks, validates configured paths, detects additions/updates/removals, and updates `UPSTREAM.json` only after the imported files have been applied.

## Verification

The normal CI workflow runs the synchronization regression tests in addition to the package build, typecheck, lint, and formatting checks:

```bash
npm test
npm run build
npm run typecheck
npm run lint
npm run format:check
```

Tests cover sync planning, stale-file removal, agent frontmatter preservation, successful application, symlink rejection, and rollback safety.
