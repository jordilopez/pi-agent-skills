# Agent Skills for Pi

`agent-skills-pi` is a Pi package port of [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills), pinned to upstream version `0.6.9`. It provides the upstream engineering skills, converted prompt templates, read-only agent definitions, shared references, and the portable portion of the session-start behavior for Pi.

## Installation

Install the package from its public Git repository:

```bash
pi install git:github.com/jordilopez/pi-agent-skills
```

For local development, install from a checkout using either an absolute or relative path:

```bash
# Absolute path
pi install /absolute/path/to/pi-agent-skills

# Relative path from the current directory
pi install ./relative/path
```

Skills, prompts, extensions, and package resources are immediately available after `pi install`; no copy step is needed. This package is distributed through Git and does not require npm publication.

## Quick reference

### Skills (25)

All 25 upstream skills are available through Pi's standard `/skill:<name>` mechanism.

| Phase  | Skill                               | Summary                                                                    |
| ------ | ----------------------------------- | -------------------------------------------------------------------------- |
| Define | `interview-me`                      | Surface what the user actually wants before any plan, spec, or code exists |
| Define | `idea-refine`                       | Refine ideas through structured divergent and convergent thinking          |
| Define | `spec-driven-development`           | Requirements and acceptance criteria before code                           |
| Define | `constraint-driven-development`     | Establish quality bar as a written contract                                |
| Plan   | `planning-and-task-breakdown`       | Decompose into small, verifiable tasks                                     |
| Build  | `incremental-implementation`        | Thin vertical slices, test each before expanding                           |
| Build  | `source-driven-development`         | Verify against official docs before implementing                           |
| Build  | `doubt-driven-development`          | Adversarial fresh-context review of every non-trivial decision             |
| Build  | `context-engineering`               | Right context at the right time                                            |
| Build  | `frontend-ui-engineering`           | Production-quality UI with accessibility                                   |
| Build  | `api-and-interface-design`          | Stable interfaces with clear contracts                                     |
| Verify | `test-driven-development`           | Failing test first, then make it pass                                      |
| Verify | `browser-testing-with-devtools`     | Chrome DevTools MCP for runtime verification                               |
| Verify | `debugging-and-error-recovery`      | Reproduce → localize → fix → guard                                         |
| Review | `code-review-and-quality`           | Five-axis review with quality gates                                        |
| Review | `code-simplification`               | Preserve behavior while reducing unnecessary complexity                    |
| Review | `security-and-hardening`            | OWASP prevention, input validation, least privilege                        |
| Review | `performance-optimization`          | Measure first, optimize only what matters                                  |
| Ship   | `git-workflow-and-versioning`       | Atomic commits, clean history                                              |
| Ship   | `ci-cd-and-automation`              | Automated quality gates on every change                                    |
| Ship   | `deprecation-and-migration`         | Remove old systems and migrate users safely                                |
| Ship   | `documentation-and-adrs`            | Document the why, not just the what                                        |
| Ship   | `observability-and-instrumentation` | Structured logs, RED metrics, traces, symptom-based alerts                 |
| Ship   | `shipping-and-launch`               | Pre-launch checklist, monitoring, rollback plan                            |
| Meta   | `using-agent-skills`                | Discovers and invokes the right skill for the current task                 |

### Prompt templates (9)

The nine converted prompt templates are directly discoverable as:

| Command          | Purpose                                             |
| ---------------- | --------------------------------------------------- |
| `/build`         | Implement a feature following established patterns  |
| `/code-simplify` | Simplify code for clarity without changing behavior |
| `/constraints`   | Define and enforce quality constraints              |
| `/planning`      | Break work into ordered, verifiable tasks           |
| `/review`        | Review code across multiple quality dimensions      |
| `/ship`          | Prepare and ship a release                          |
| `/spec`          | Define requirements and acceptance criteria         |
| `/test`          | Write and run tests using TDD                       |
| `/webperf`       | Analyze and optimize web performance                |

The upstream command name `planning` is preserved as `/planning`; this package does not provide a `/plan` alias.

### Agents (4)

The four read-only agent definitions are retained as source files under `agents/` and can be delivered to projects via `agent-skills:install`.

| Agent                     | Purpose                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `code-reviewer`           | Senior code reviewer evaluating correctness, readability, architecture, security, and performance |
| `security-auditor`        | Security engineer focused on vulnerability detection, threat modeling, and secure coding          |
| `test-engineer`           | QA engineer specialized in test strategy, writing, and coverage analysis                          |
| `web-performance-auditor` | Web performance engineer focused on Core Web Vitals and structural anti-patterns                  |

The session-start extension is auto-loaded by Pi. It registers a `before_agent_start` handler that injects the full `using-agent-skills` meta-skill content into the model-visible system prompt, and reports a user-visible notice at session start. The agent-delivery extension provides explicit project-local commands for installing those four agents when they are needed.

The seven shared reference checklists remain under `references/` and are used by the unchanged skills through relative links. The original Claude Code hooks remain under `hooks/` as reference artifacts only.

## Project-local agent delivery

Pi does not discover project agents from this package's resource manifest. The agent-delivery extension therefore installs only this package's four agents into a project when explicitly requested.

In a Pi session **within the target project**, type any of these slash commands:

```text
/agent-skills:install
/agent-skills:update
/agent-skills:status
/agent-skills:uninstall
```

Agents are installed **locally** into the project's `.pi/agents/` directory — they are not made globally available:

```text
<project>/.pi/agents/
```

Ownership is tracked in:

```text
<project>/.pi/pi-agent-skills/manifest.json
```

The manifest stores relative paths only: the package-relative source
(`agents/<name>.md`) and the project-relative target (`.pi/agents/<name>.md`).
Absolute paths, traversal segments, duplicates, and unexpected agent names are
rejected. Format version 2 is current; format version 1 manifests are refused
with a migration error. The `.pi` directory name is a fixed contract path for
this package, not a rebranded Pi config directory.

The behavior is deliberately ownership-aware:

- `install` creates missing package-owned agents.
- `update` refreshes every manifest-owned agent, even when its local contents have been modified, and creates missing agents when there is no collision.
- `status` reports installed, stale, missing, and foreign files without mutating the project. Owned targets replaced by a symlink or other non-regular file are reported as unsafe and never hashed through.
- `uninstall` removes every manifest-owned regular file regardless of local modification, reports modified files before removal, and then removes the ownership manifest. Owned targets replaced by a symlink or other non-regular file are skipped and preserved.
- Foreign agent files, including uncolliding files and files with colliding names, are preserved and never overwritten or deleted.
- Malformed, foreign, or duplicate ownership manifests are refused without mutation.
- Manifest traversal paths, absolute paths outside the project, unsafe symlinks, and non-regular-file targets are rejected without mutation.
- Managed boundaries are symlink-checked before any write: `.pi`, `.pi/agents`, `.pi/pi-agent-skills`, and `manifest.json` must not be symlinks.
- Install and update are failure-safe: agent files and the manifest are written atomically, and a partial failure rolls back created files (removed) and updated files (restored) before reporting what succeeded, what was rolled back, and what was left untouched.

## Coexistence guarantees

This package is designed to coexist with a project's existing Pi setup:

- Skills stay in the installed package and are never copied into projects.
- Prompt templates and other workflows stay in the installed package and are never copied into projects.
- No files are written to `~/.pi/agent/agents/` or any other global agent directory.
- Agent delivery touches only this package's four owned agent files under the target project's `.pi/agents/` directory.
- Foreign project agents are preserved, including uncolliding files and colliding filenames.
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
- - Claude Code-only hooks and behaviors described above are reference artifacts, not Pi features.

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
