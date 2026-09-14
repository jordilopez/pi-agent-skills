# Spec: Agent Skills for Pi

## Objective

Build a public, git-installable Pi package that ports version 0.6.9 of
`addyosmani/agent-skills` for use in Pi Agent.

The package is intended for the user and their teammates. It must be usable
through Pi's standard package and resource mechanisms without modifying Pi
itself or requiring users to install an npm package.

The acceptance installation path is:

    pi install git:github.com/<owner>/<repo>

The package must provide the complete upstream resource set required by the
full-repo port:

- All 25 upstream skills, with names, descriptions, and content unchanged.
- The seven shared references used by those skills.
- All nine upstream commands, converted to Pi prompt templates.
- All four upstream agents, converted to Pi subagent definitions.
- A Pi extension implementing the session-start context/meta-skill behavior
  that maps cleanly to Pi.
- A Pi extension command interface that installs and manages this package's
  four agents in a project-local `.pi/agents/` directory using an ownership
  manifest, without overwriting unrelated agents.
- The original Claude Code hook scripts and documentation, retained for
  reference and clearly marked as non-portable where they cannot map to Pi.

Success means that users can install the repository with `pi install`, discover
all skills through Pi's system-prompt discovery and `/skill:<name>` mechanism,
use the converted prompts and agents, explicitly install or update only this
package's agents in a project, and load the extensions without making changes to
Pi.

The original request grounding this specification is:

> Execute this workflow with the subagent tool. It interviews the user about
> an idea, then produces `SPEC.md`. Never write implementation code during this
> workflow.

The idea being specified is:

> I want to create a Pi package that ports `addyosmani/agent-skills` so it can
> be used in Pi Agent

The distribution clarification is:

> Important, I'd like this to be a Pi package that I could use just by doing
> `pi install ...`

## Tech Stack

- Pi package distributed from a public Git repository.
- Git-only distribution; no npm publishing.
- Pi package manifest in `package.json` under the `pi` key.
- Node.js tooling with TypeScript for the Pi extensions.
- Native Node.js APIs for filesystem operations, SHA-256 hashing, path
  validation, and JSON ownership-manifest handling.
- Upstream source pinned to `addyosmani/agent-skills` version `0.6.9`,
  identified by the upstream `plugin.json`.
- Pi-native resource types:
  - `skills/` for the 25 skills.
  - `prompts/` for converted commands.
  - `agents/` for the four package-owned agent sources; Pi does not discover
    these from the package manifest, so the extension delivers them to projects.
  - `extensions/` for session-start and project-local agent-delivery behavior.
- TypeScript compiler for build and typecheck.
- ESLint for linting authored TypeScript.
- Prettier for formatting authored TypeScript, configuration, and documentation.
- The imported upstream skill and reference content is not reformatted or
  otherwise modified.
- The extension must use Pi's documented extension API and must not require a
  change to Pi's source code.

The package may use development dependencies for TypeScript, ESLint, and
Prettier. It must not require runtime dependencies that are unavailable to a
git-installed Pi package unless their need is explicitly documented and
verified by the installation smoke check.

## Commands

Run commands from the repository root.

### Install development dependencies

    npm install

`pi install git:...` must also succeed when Pi invokes npm installation for the
package.

### Build

    npm run build

Build must compile the TypeScript extension using the repository's TypeScript
configuration. Generated build output is validation output and must not replace
the source extension path registered in the Pi manifest unless Pi's package
loader explicitly requires that behavior.

### Typecheck

    npm run typecheck

Typecheck must run TypeScript in no-emit mode and cover the extension and
repository-owned TypeScript configuration.

### Lint

    npm run lint

Lint must cover the authored TypeScript extension and must not rewrite or
reject the verbatim imported skill content solely because it does not follow
the package's authored-code style.

### Format

    npm run format

This formats only package-authored source, configuration, and documentation
files. It must not format or rewrite the verbatim skill files or shared
reference files.

A non-mutating format verification command should also be available:

    npm run format:check

### Acceptance installation

Use the public repository URL:

    pi install git:github.com/<owner>/<repo>

During local development, the equivalent is:

    pi install /abs/path/to/pi-agent-skills

If a specific revision is required for verification, use Pi's supported git
reference syntax:

    pi install git:github.com/<owner>/<repo>@<ref>

After installation, inspect Pi's discovered resources and manually verify the
skills, prompts, agents, and extension load.

### Testing command

There is no test command to run. The project does not add a unit, integration,
evaluation, or hook test suite. Verification consists of build, typecheck,
lint, format, and the manual Pi installation smoke check described above.

## Required `package.json` Shape

The package manifest must explicitly declare the Pi resources so that `pi
install` can discover them. The resource directories must remain at these
paths.

An implementation-ready shape is:

    {
      "name": "agent-skills-pi",
      "version": "0.6.9-pi.0",
      "description": "Pi package port of addyosmani/agent-skills",
      "keywords": [
        "pi-package"
      ],
      "pi": {
        "skills": [
          "./skills"
        ],
        "prompts": [
          "./prompts"
        ],
        "extensions": [
          "./extensions"
        ]
      },
      "files": [
        "skills/",
        "references/",
        "prompts/",
        "agents/",
        "extensions/",
        "hooks/",
        "docs/",
        "README.md",
        "LICENSE",
        "plugin.json"
      ],
      "scripts": {
        "build": "tsc -p tsconfig.build.json",
        "typecheck": "tsc -p tsconfig.json --noEmit",
        "lint": "eslint \"extensions/**/*.ts\"",
        "format": "prettier --write package.json tsconfig*.json \"extensions/**/*.ts\" README.md \"docs/**/*.md\"",
        "format:check": "prettier --check package.json tsconfig*.json \"extensions/**/*.ts\" README.md \"docs/**/*.md\""
      }
    }

The final repository name, package name, public owner, and package version may be
selected during implementation, but the following requirements are mandatory:

- The `keywords` array contains `"pi-package"`.
- The `pi` manifest declares `skills`, `prompts`, and `extensions`; it does
  not declare an `agents` key because Pi does not discover package agents from
  the manifest.
- Every declared resource path exists in the repository.
- `references/` is included in the git repository and in the package's
  included files. It is not a Pi resource directory, but it is required for
  relative links from the skills to resolve after installation.
- The package does not depend on npm publication. Git installation is the
  supported distribution mechanism.
- The package does not use a post-install step that modifies Pi or rewrites
  imported skill content.

## Project Structure

The target repository layout is:

    package.json                 Pi manifest, metadata, scripts, and package files
    package-lock.json            Reproducible development dependency lockfile
    tsconfig.json                TypeScript typecheck configuration
    tsconfig.build.json          TypeScript build configuration
    eslint.config.*               ESLint configuration for authored code
    .prettierrc*                  Prettier configuration for authored files
    README.md                     Installation, usage, provenance, and porting notes
    LICENSE                       Upstream license, preserved as required
    plugin.json                   Upstream version/provenance metadata, preserved
    skills/
      <25 skill directories>      Verbatim upstream skill directories and SKILL.md files
    references/
      accessibility-checklist.md
      definition-of-done.md
      observability-checklist.md
      orchestration-patterns.md
      performance-checklist.md
      security-checklist.md
      testing-patterns.md
    prompts/
      build.md
      code-simplify.md
      constraints.md
      planning.md
      review.md
      ship.md
      spec.md
      test.md
      webperf.md
    agents/
      code-reviewer.md
      security-auditor.md
      test-engineer.md
      web-performance-auditor.md
    extensions/
      session-start.ts             Pi implementation of session-start injection
      agent-delivery.ts             Project-local agent install/update commands
    hooks/
      hooks.json                   Original Claude Code hook configuration
      session-start.sh             Original reference script
      session-start-test.sh        Original reference script
      sdd-cache-pre.sh             Claude Code-only reference hook
      sdd-cache-post.sh            Claude Code-only reference hook
      simplify-ignore.sh           Claude Code-only reference hook
      simplify-ignore-test.sh      Original reference script
      SDD-CACHE.md                  Portability and behavior documentation
      SIMPLIFY-IGNORE.md            Portability and behavior documentation
    docs/
      README and relevant upstream documentation
    <other upstream metadata>       Retained when required for provenance or documentation

The 25 skill names must be exactly:

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

The four `agents/` files are package-owned source definitions. They are not
listed under `pi.agents` because Pi does not discover agents from a package
manifest. The agent-delivery extension installs them into a project's
`.pi/agents/` directory only when the user invokes its commands.

Every upstream `SKILL.md` must retain its original name, description,
frontmatter, body, and links. The additional files under
`constraint-driven-development/references/` and `idea-refine/` must also be
preserved.

The `references/` directory must remain at the package root, as a sibling of
`skills/`. Many skills contain links such as:

    ../../references/definition-of-done.md
    ../../references/security-checklist.md
    ../../references/performance-checklist.md

From `skills/<name>/SKILL.md`, those paths resolve to
`<package-root>/references/<file>`. Moving the references into `skills/`,
`docs/`, or another directory would break the imported links and is prohibited.

### Resource conversion

#### Skills

Copy all 25 upstream skills without editing their content. Do not add Pi-only
skills, remove upstream skills, rename skills, shorten descriptions, rewrite
examples, or normalize Markdown.

#### Commands to prompts

Convert each of the nine upstream Claude `.toml` commands into one Markdown
prompt template under `prompts/`:

- `build.toml` → `prompts/build.md`
- `code-simplify.toml` → `prompts/code-simplify.md`
- `constraints.toml` → `prompts/constraints.md`
- `planning.toml` → `prompts/planning.md`
- `review.toml` → `prompts/review.md`
- `ship.toml` → `prompts/ship.md`
- `spec.toml` → `prompts/spec.md`
- `test.toml` → `prompts/test.md`
- `webperf.toml` → `prompts/webperf.md`

For every prompt:

- Map the TOML `description` to prompt-template `description` frontmatter.
- Map the TOML `prompt` field to the template body.
- Adapt only syntax or tool references required for Pi prompt-template
  behavior.
- Preserve the source command's semantics and intent.
- Add `argument-hint` when the source command accepts arguments, such as the
  `build` command's `auto` argument.
- Do not invent additional commands or aliases.

The source filename `planning.toml` maps to `/planning`, not `/plan`. This
preserves the upstream command name and avoids a silent rename. A `/plan`
alias is out of scope and requires an explicit future decision if desired.

Pi prompt discovery is non-recursive, so all nine files must be directly under
`prompts/`.

#### Agents to subagents

Convert the four upstream agent Markdown files into Pi subagent definitions
under `agents/`:

- `code-reviewer`
- `security-auditor`
- `test-engineer`
- `web-performance-auditor`

Preserve each agent's body and instructions, adapting only the frontmatter and
tool declarations required by Pi. Each converted agent must:

- Retain its upstream `name`.
- Retain its upstream `description`.
- Be configured as non-pane.
- Deny `write` and `edit` tools so it remains read-only.
- Preserve the upstream review/audit behavior.
- Not gain permission to modify repository files as part of the conversion.

#### Hooks and extension

Implement `extensions/session-start.ts` only for the behavior that maps cleanly:
the upstream session-start meta-skill/context injection.

The extension must:

- Register with Pi's documented session-start lifecycle mechanism.
- Inject or expose the equivalent context/meta-skill information at session
  start.
- Be safe to load in a normal Pi session.
- Avoid dependence on Claude Code event names or tool names.
- Be covered by build, typecheck, lint, format, and manual installation smoke
  verification.

Retain the original hook scripts and documentation under `hooks/` for
reference. They must be clearly marked in `README.md` and the hook
documentation as Claude-Code-only where applicable.

### Project-local agent delivery

The package must expose a namespaced extension command interface:

    /agent-skills:install
    /agent-skills:update
    /agent-skills:status
    /agent-skills:uninstall

These commands manage only the four agents shipped by this repository. They
must install them into `<project>/.pi/agents/` and store ownership metadata at
`<project>/.pi/pi-agent-skills/manifest.json`. The manifest records its format
version, package name and version, each package-relative source path, each
project-relative target path, and a SHA-256 content hash.

Install and update must create missing package-owned agents, refresh agents
listed in the manifest even when locally modified, skip and report foreign
colliding files, update ownership only after successful operations, and be
idempotent. Status must not mutate files and must report installed, missing,
stale, and foreign/colliding entries. Uninstall may remove only manifest-owned
agents and the package-owned manifest; it must never touch foreign agents,
foreign manifests, global `~/.pi/agent/agents/`, workflows, skills, Pi itself,
or other packages. Commands must fail clearly when no active project root is
available.

The following behaviors are explicitly non-portable and are not to be
pretended to be implemented by the Pi extension:

- The SDD cache pre-hook and post-hook, which depend on Claude Code's
  `WebFetch`, `Read`, `Edit`, and `Write` tool names and `PreToolUse` and
  `PostToolUse` events.
- The simplify-ignore hook, which depends on Claude Code's
  `PreToolUse`, `PostToolUse`, `Read`, `Edit`, and `Write` behavior.
- The original `SessionStart` hook wiring format in `hooks.json`.

The documentation must state these gaps and explain that the shell scripts are
retained for reference only.

## Code Style

Imported upstream skill and shared-reference content is immutable. Authored
TypeScript, configuration, and documentation use the repository's ESLint and
Prettier configuration.

Conventions:

- Use lowercase hyphenated names for Pi resource filenames and skill names.
- Use `camelCase` for TypeScript variables and functions.
- Use `PascalCase` for TypeScript types and classes.
- Keep the extension small and focused on session-start integration.
- Prefer explicit types at Pi API boundaries.
- Use `const` by default and avoid mutation unless required by the Pi API.
- Use single-purpose functions for context construction, event handling,
  ownership-manifest parsing, hashing, path validation, and command reporting.
- Use native Node.js filesystem and crypto APIs for agent delivery; never use
  shell commands for copying, deleting, or hashing agents.
- Validate project and manifest paths before filesystem operations, and report
  installed, updated, skipped, foreign, stale, missing, and failed states
  explicitly.
- Preserve source prompt semantics rather than reflowing or paraphrasing imported
  command bodies.
- Do not run formatting over `skills/` or `references/`.
- Keep frontmatter fields valid for Pi and use quoted values when YAML
  punctuation could be ambiguous.

An illustrative Pi prompt-template style is:

    ---
    description: Review the requested target using the upstream review workflow.
    argument-hint: "[target]"
    ---

    Apply the upstream review workflow to `$ARGUMENTS`.

    Preserve the command's original instructions and use Pi-compatible
    argument expansion where the source command requires it.

The actual converted prompt bodies must come from the corresponding upstream
TOML files; this snippet demonstrates formatting and argument usage only. It
does not authorize creation of an additional command.

## Testing Strategy

Testing: none

No new automated tests are to be authored. Upstream hook test scripts may be
retained as reference artifacts, but they are not part of the package's test
suite and are not required to run.

Verification is limited to:

1. `npm run build`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run format:check` after `npm run format` has been applied to authored
   files.
5. A manual Pi installation smoke check using
   `pi install git:github.com/<owner>/<repo>` or
   `pi install /abs/path/to/pi-agent-skills`.

The manual smoke check must confirm:

- Pi installs the git repository successfully.
- The package loads without requiring a Pi source change.
- All 25 skills are discovered through the package; no project skill copy is
  required.
- At least one representative skill is callable through `/skill:<name>`.
- The nine prompt templates are registered.
- The session-start extension loads without an error.
- The four agent-delivery commands register and use the active project root.
- Installing into a scratch project places only this package's agents in
  `<project>/.pi/agents/` and records ownership in the package manifest.
- Re-running install/update refreshes owned agents but preserves foreign
  colliding agents; status is read-only; uninstall removes only owned agents.
- The root-level references are present in the installed package and the
  relative skill links resolve.
- No files are created under `~/.pi/agent/agents/` and no workflows are copied
  into the project.

## Implementation Phases and Verification

### Phase 1: Package scaffold and manifest

Create the package metadata, Pi manifest, TypeScript configuration, and
development tooling. Do not alter upstream content.

Acceptance:

- The package has the required `package.json` shape.
- The `pi` manifest declares `skills`, `prompts`, and `extensions`, and has no
  `agents` key.
- `keywords` contains `pi-package`.
- `npm install` succeeds.
- Build, typecheck, lint, and format commands are executable.

This phase can proceed independently of content conversion after the target
resource paths are fixed.

### Phase 2: Skills and references import

Import the 25 upstream skills and seven root-level references from version
0.6.9. Preserve all content and per-skill extra files.

Acceptance:

- The skill inventory exactly matches the 25-name list.
- No skill file is edited, renamed, removed, or added.
- `references/` remains a root sibling of `skills/`.
- Every referenced shared checklist exists at the path expected by the
  unchanged Markdown links.

This lane owns only `skills/` and `references/` and can be validated by file
comparison and link-path inspection without depending on prompt or extension
implementation.

### Phase 3: Prompt and agent conversion

Convert the nine commands and four agents into Pi-native resource files.

Acceptance:

- There are exactly nine prompt templates directly under `prompts/`.
- Each prompt has the source description and preserves source semantics.
- Argument-taking commands have appropriate Pi argument hints.
- `planning.toml` remains `/planning`.
- There are exactly four subagent definitions.
- All four agents are non-pane and deny `write` and `edit`.

The prompt and agent conversions have disjoint file ownership and may be
implemented in parallel, followed by one manifest-level discovery check.

### Phase 4: Extension, project-local agent delivery, and hook documentation

Implement the session-start extension, the project-local agent-delivery command
interface, and retain/document the original hooks.

Acceptance:

- The Pi extensions load through the manifest.
- Session-start context/meta-skill injection is implemented using Pi's lifecycle
  API.
- Install/update/status/uninstall manage only this package's four agents under
  `<project>/.pi/agents/` using `<project>/.pi/pi-agent-skills/manifest.json`.
- Manifest-owned agents refresh on update; foreign colliding agents are
  reported and preserved; status is read-only; uninstall is ownership-safe.
- Claude-Code-only hooks remain available for reference.
- The WebFetch cache hooks and simplify-ignore hooks are explicitly documented
  as non-portable.
- No Claude Code hook is falsely represented as a working Pi hook.

### Phase 5: Integration verification and documentation

Complete `README.md`, provenance notes, installation instructions, and the
manual Pi smoke verification.

Acceptance:

- The public git installation command is documented exactly.
- A local absolute-path installation equivalent is documented.
- All required resource discovery and reference-link checks pass.
- Build, typecheck, lint, and format checks pass.
- No npm publication step is present or required.

## Boundaries

### Always

- Preserve the upstream source version as `0.6.9` and record provenance.
- Keep exactly the 25 upstream skills with their original names and
  descriptions.
- Keep imported skill content verbatim.
- Keep `references/` at the package root beside `skills/`.
- Include `references/` in the git repository and package files so links work
  after installation.
- Preserve per-skill supporting files.
- Preserve the nine command semantics and four agent bodies during conversion.
- Preserve the four converted agents as package-owned source files and deliver
  them only through explicit project-local agent commands.
- Configure converted agents as non-pane and read-only by denying `write` and
  `edit`.
- Record ownership, source paths, target paths, package version, and SHA-256
  hashes for successfully delivered agents.
- Never overwrite or delete foreign or non-owned project agents or write to the
  global agent directory.
- Document all Claude-Code-only hooks and unsupported behavior.
- Run build, typecheck, lint, format, and the manual Pi installation smoke
  verification before declaring the package complete.
- Keep the package installable from a public git URL with no Pi source changes.

### Ask first

- Before touching the separate `pi-setup` repository.
- Before changing the agreed `/planning` command name or adding a `/plan`
  alias.
- Before changing the upstream skill inventory or modifying any imported skill
  content.
- Before adding runtime dependencies beyond the development tooling required
  for the extension.
- Before attempting to map any additional Claude Code hook behavior to Pi.
- Before changing the agent-delivery target or ownership-manifest path.
- Before changing distribution from git-only to npm or another registry.
- Before changing the public repository owner or URL used in acceptance
  verification.

### Never

- Never edit, delete, or add any skill beyond the exact 25 verbatim upstream
  skills.
- Never move `references/` away from the package root.
- Never silently rename a resource or invent a command.
- Never claim that Claude-Code-only hooks are implemented in Pi when their
  required events or tool names do not exist.
- Never modify Pi itself or require a Pi fork.
- Never copy skills into projects; `pi install` already provides package skills.
- Never write to `~/.pi/agent/agents/` or copy workflows into projects.
- Never overwrite or delete foreign or non-owned project agents.
- Never install or invoke `@vanillagreen/pi-agents-tmux`.
- Never publish the package to npm as part of this scope.
- Never commit credentials, tokens, private keys, local machine paths that
  expose secrets, or other sensitive data.
- Never overwrite unrelated user packages or silently resolve Pi skill
  collisions by changing this repository's skill names.

## Out of Scope and Cross-Repository Follow-Up

The following are intentionally outside this repository's implementation:

- Publishing to npm.
- Modifying Pi.
- Adding new skills or changing any upstream skill content.
- Implementing the Claude Code `WebFetch` cache hooks in Pi.
- Implementing the Claude Code simplify-ignore hooks in Pi.
- Porting Claude Code's hook event model wholesale.
- Adding command aliases not present in the upstream command set.
- Copying skills into projects; skills remain supplied by the installed package.
- Installing or managing global agents, foreign project agents, or workflows.
- Adding an automated test suite.

The existing `pi-setup` package is a separate repository and currently exposes
five overlapping skills:

- `code-review-and-quality`
- `incremental-implementation`
- `planning-and-task-breakdown`
- `spec-driven-development`
- `test-driven-development`

Explicit cross-repository follow-up action:

> Remove those five overlapping skills from the separate `pi-setup` repository
> so this package becomes the single source of truth.

That cleanup must not be implemented in this repository. It must be coordinated
and approved separately before modifying `pi-setup`. Until that follow-up is
completed, users may see Pi's normal skill collision warning.

## Risks, Compatibility, and Backout

### Risks

- Pi skill collisions may cause the first discovered package to win until the
  separate `pi-setup` cleanup is completed.
- Moving or omitting `references/` will break unchanged relative links.
- Claude Code command bodies or hooks may refer to tools and lifecycle events
  that do not exist in Pi.
- The Pi extension API may expose session-start behavior differently from the
  upstream hook model.
- Project-root resolution or Pi trust behavior may make project-local writes
  unavailable; commands must fail clearly rather than falling back globally.
- A malformed or foreign ownership manifest could cause destructive behavior;
  validate it before mutation and preserve foreign files.
- Formatting or linting imported content could violate the verbatim-port
  requirement.

### Compatibility controls

- Keep imported skills and references outside authored-code formatting and lint
  globs.
- Use explicit Pi manifest paths rather than relying only on conventions.
- Verify installation from git, not only from the working tree.
- Verify discovery names and reference paths after installation.
- Document unsupported hooks instead of emulating them inaccurately.
- Keep the extensions isolated so failure of optional session-start or
  project-local delivery behavior does not require changes to skill content.
- Validate ownership before every overwrite or deletion and hash installed
  agent content to make update/status decisions deterministic.

### Backout

If a release candidate fails installation or discovery, revert the package
manifest or conversion commit while preserving the upstream import. A
git-installed package can be removed or replaced by installing a known-good
revision. The separate `pi-setup` collision cleanup must be reverted
independently in that repository if it has already been performed.

## Success Criteria

The package is complete only when all of the following are true:

1. `pi install git:github.com/<owner>/<repo>` succeeds from a clean environment
   with no changes to Pi.
2. A local equivalent,
   `pi install /abs/path/to/pi-agent-skills`, also succeeds for development
   verification.
3. `package.json` contains `"pi-package"` in `keywords`.
4. `package.json` declares `skills`, `prompts`, and `extensions` under `pi`
   and does not contain an `agents` key.
5. `references/` is included in the repository and installed package.
6. All 25 required skills are present with unchanged names, descriptions,
   frontmatter, bodies, and supporting files.
7. All 25 skills are discoverable through Pi's standard skill mechanism and
   callable as `/skill:<name>`.
8. Unchanged links such as
   `../../references/definition-of-done.md` resolve from installed skill files.
9. Exactly nine prompt templates are registered:
   `build`, `code-simplify`, `constraints`, `planning`, `review`, `ship`,
   `spec`, `test`, and `webperf`.
10. The `planning` command is registered as `/planning`, with the choice
    documented rather than silently renamed to `/plan`.
11. The four package-owned agents are available as source files and are
    delivered to a project only through the namespaced agent commands.
12. Installing or updating creates/refreshes only manifest-owned agents under
    `<project>/.pi/agents/`, records SHA-256 ownership metadata at
    `<project>/.pi/pi-agent-skills/manifest.json`, and preserves foreign
    colliding agents.
13. Status is non-mutating and reports installed, missing, stale, and foreign
    entries; uninstall removes only owned agents and the owned manifest.
14. The session-start and agent-delivery Pi extensions load successfully and
    perform their supported behavior.
15. The original hook scripts and documentation are retained and clearly label
    the WebFetch cache and simplify-ignore behavior as Claude-Code-only and
    non-portable.
16. `npm run build` passes.
17. `npm run typecheck` passes.
18. `npm run lint` passes.
19. `npm run format:check` passes after formatting authored files.
20. No automated tests are added or required; the testing mode remains exactly
    `Testing: none`.
21. The README documents git-only installation, resource usage, provenance,
    non-portable hooks, project-local agent delivery, ownership semantics,
    coexistence guarantees, and the separate `pi-setup` collision-cleanup
    follow-up.
