# Agent Skills for Pi — Documentation

This directory contains supplementary documentation for the `agent-skills-pi` package. See the [root README](../README.md) for the full installation, development, and provenance reference.

## What is this package?

`agent-skills-pi` is a Pi port of [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) version 0.6.9. It provides 25 engineering skills, 9 prompt templates, 4 read-only agent definitions, shared reference checklists, and a session-start extension — all discoverable through Pi's standard resource mechanisms.

## Discovery and usage

### Skills

Pi automatically discovers skills installed through `pi install`. Each of the 25 skills is invoked via the standard `/skill:<name>` mechanism. No copy step or manual registration is needed.

Example:

```text
/skill:code-review-and-quality
/skill:test-driven-development
/skill:spec-driven-development
```

The `using-agent-skills` meta-skill is injected into the model-visible system prompt via Pi's `before_agent_start` event at the start of each agent run, and a user-visible notice is shown at session start. It helps route tasks to the appropriate skill.

### Prompt templates

Nine converted prompt templates are available as slash commands:

`/build` · `/code-simplify` · `/constraints` · `/planning` · `/review` · `/ship` · `/spec` · `/test` · `/webperf`

These map directly to the upstream TOML commands. The upstream `/planning` name is preserved; no `/plan` alias is provided.

### Agents

Pi does not automatically install package agents into projects. The agent-delivery extension provides explicit commands for this (see below). The four agent source definitions live under `agents/` in the package.

## Agent-delivery commands

The agent-delivery extension manages this package's four agents in the current project. In a Pi session **within the target project**, type any of these slash commands:

| Command                   | Behavior                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `/agent-skills:install`   | Install missing package-owned agents                             |
| `/agent-skills:update`    | Refresh all owned agents to current package content              |
| `/agent-skills:status`    | Report installed, stale, missing, and foreign agents (read-only) |
| `/agent-skills:uninstall` | Remove only package-owned agents and the ownership manifest      |

Agents are written to `<project>/.pi/agents/` — they are **not made globally available**. Ownership is tracked in `<project>/.pi/pi-agent-skills/manifest.json`. The manifest stores only relative paths: the package-relative source (`agents/<name>.md`) and the project-relative target (`.pi/agents/<name>.md`). Format version 2 is current; version 1 manifests are refused.

### Safety rules

- Foreign agent files with colliding names are never overwritten or deleted.
- Foreign or malformed manifests are rejected without mutation.
- Uninstall removes only files listed in a valid package-owned manifest.
- Managed boundaries (`.pi`, `.pi/agents`, `.pi/pi-agent-skills`, `manifest.json`) are symlink-checked before any write.
- Install and update are failure-safe: writes are atomic and a partial failure rolls back created and updated files.
- Status and uninstall never follow symlinks: unsafe owned targets are reported or preserved instead of being hashed or deleted.
- No files are written to global directories like `~/.pi/agent/agents/`.

## Non-portable hooks

The files under `hooks/` are retained as Claude Code reference material. They are **not** functional Pi hooks. The SDD cache hooks depend on Claude Code tool names (`WebFetch`, `Read`, `Edit`, `Write`) and event types (`PreToolUse`, `PostToolUse`). The simplify-ignore behavior has similar Claude Code-only limitations.

The Pi session-start extension covers the portable session-start behavior by injecting the `using-agent-skills` content into the model-visible system prompt through `before_agent_start`; it does not implement SDD caching or simplify-ignore.

## pi-setup collision follow-up

Five skills overlap with the separate `pi-setup` package: `code-review-and-quality`, `incremental-implementation`, `planning-and-task-breakdown`, `spec-driven-development`, and `test-driven-development`.

Removing those overlapping skills from `pi-setup` is a separate approved follow-up. Until that cleanup is complete, Pi may display skill collision warnings. This package does not modify `pi-setup`.

## Further reading

- [Root README](../README.md) — full installation, provenance, coexistence guarantees, and development reference
- [Plugin metadata](../plugin.json) — upstream version and provenance
- [Upstream source](https://github.com/addyosmani/agent-skills) — original agent-skills repository (v0.6.9)
