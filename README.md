# Agent Skills for Pi

`agent-skills-pi` is a Pi package port of [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills), pinned to upstream version `0.6.9`. It provides the upstream engineering skills, converted prompt templates, read-only agent definitions, shared references, and the portable portion of the session-start behavior for Pi.

## Installation

Install the package from its public Git repository once the repository owner and URL are finalized:

```bash
pi install git:github.com/<owner>/<repo>
```

For local development, install from a checkout:

```bash
pi install /path/to/pi-agent-skills
```

Skills, prompts, extensions, and package resources are immediately available after `pi install`; no copy step is needed. This package is distributed through Git and does not require npm publication.

## What's included

### Skills

All 25 upstream skills are available through Pi's standard `/skill:<name>` mechanism:

- `api-and-interface-design`
- `browser-testing-with-devtools`
- `ci-cd-and-automation`
- `code-review-and-quality`
- `code-simplification`
- `constraint-driven-development`
- `context-engineering`
- `debugging-and-error-recovery`
- `deprecation-and-migration`
- `documentation-and-adrs`
- `doubt-driven-development`
- `frontend-ui-engineering`
- `git-workflow-and-versioning`
- `idea-refine`
- `incremental-implementation`
- `interview-me`
- `observability-and-instrumentation`
- `performance-optimization`
- `planning-and-task-breakdown`
- `security-and-hardening`
- `shipping-and-launch`
- `source-driven-development`
- `spec-driven-development`
- `test-driven-development`
- `using-agent-skills`

### Prompt templates

The nine converted prompt templates are directly discoverable as:

- `/build`
- `/code-simplify`
- `/constraints`
- `/planning`
- `/review`
- `/ship`
- `/spec`
- `/test`
- `/webperf`

The upstream command name `planning` is preserved as `/planning`; this package does not provide a `/plan` alias.

### Agents and extensions

The four read-only agent definitions are retained as source files under `agents/`:

- `code-reviewer.md`
- `security-auditor.md`
- `test-engineer.md`
- `web-performance-auditor.md`

The session-start extension is auto-loaded by Pi and exposes the `using-agent-skills` meta-skill context at session start. The agent-delivery extension provides explicit project-local commands for installing those four agents when they are needed.

The seven shared reference checklists remain under `references/` and are used by the unchanged skills through relative links. The original Claude Code hooks remain under `hooks/` as reference artifacts only.

## Project-local agent delivery

Pi does not discover project agents from this package's resource manifest. The agent-delivery extension therefore installs only this package's four agents into a project when explicitly requested.

Run these commands in the target project:

```text
/agent-skills:install
/agent-skills:update
/agent-skills:status
/agent-skills:uninstall
```

The commands use the current project working directory. Delivered agents are written to:

```text
<project>/.pi/agents/
```

Ownership is tracked in:

```text
<project>/.pi/pi-agent-skills/manifest.json
```

The behavior is deliberately ownership-aware:

- `install` creates missing package-owned agents.
- `update` refreshes all agents already recorded as owned and creates missing agents when there is no collision.
- `status` reports installed, stale, missing, and foreign files without mutating the project.
- `uninstall` removes only files still owned by this package and then removes the ownership manifest.
- A foreign agent file with a colliding name is never overwritten or deleted.
- A foreign or malformed ownership manifest is not overwritten or acted on.

## Coexistence guarantees

This package is designed to coexist with a project's existing Pi setup:

- Skills stay in the installed package and are never copied into projects.
- Prompt templates and other workflows stay in the installed package and are never copied into projects.
- No files are written to `~/.pi/agent/agents/` or any other global agent directory.
- Agent delivery touches only this package's four owned agent files under the target project's `.pi/agents/` directory.
- Foreign project agents are preserved, including colliding filenames.
- The package does not modify Pi itself.

## Provenance

The upstream source is [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills), version `0.6.9`, as recorded by `plugin.json`.

- Skills, shared references, hooks, and their supporting files are verbatim imports from upstream.
- Prompt templates are converted from the nine upstream TOML command files.
- Agent definitions are converted from the four upstream agent definitions, with Pi-specific read-only frontmatter.
- The unchanged skill links such as `../../references/definition-of-done.md` resolve from each skill directory to the sibling package-root `references/` directory.
- `LICENSE` and `plugin.json` retain the upstream provenance metadata required by the port.

## Claude Code hooks and portability

The files under `hooks/` are retained as Claude Code reference material. They are not registered as working Pi hooks.

The SDD cache hooks depend on Claude Code tool names and lifecycle events, including `WebFetch`, `Read`, `Edit`, `Write`, `PreToolUse`, and `PostToolUse`; they are not functional in Pi. The simplify-ignore behavior has the same Claude Code-only limitation. The original `SessionStart` wiring in `hooks.json` is also not a Pi hook registration.

The Pi session-start extension partially covers the portable upstream session-start behavior by exposing the `using-agent-skills` context. It does not claim to implement SDD caching, simplify-ignore, or Claude Code's hook event model.

## Known limitations

- Five skills overlap with the separate `pi-setup` package: `code-review-and-quality`, `incremental-implementation`, `planning-and-task-breakdown`, `spec-driven-development`, and `test-driven-development`. Removing those overlapping skills from `pi-setup` is a separate approved follow-up and is not implemented here. Until that cleanup is complete, Pi may show its normal skill collision warning.
- `/planning` is the preserved prompt name. There is no `/plan` alias.
- The public repository owner and final public URL are still to be selected; the installation example intentionally uses `<owner>/<repo>`.
- Claude Code-only hooks and behaviors described above are reference artifacts, not Pi features.

## Development

Run these commands from the repository root:

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm run format:check
```

Testing mode for this port is `none`: no automated test suite is authored or required. Verification uses the build, typecheck, lint, formatting, and manual Pi installation checks appropriate to each implementation task.

The supported distribution model is Git-only. This project does not publish to npm and has no npm publication workflow.
