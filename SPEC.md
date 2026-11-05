# Spec: Agent Skills for Pi

## Objective

Build a public, git-installable Pi package that ports version 0.6.9 of
`addyosmani/agent-skills` for use in Pi Agent.

The package is intended for the user and their teammates. It must be usable
through Pi's standard package and resource mechanisms without modifying Pi
itself or requiring users to install an npm package.

The acceptance installation path is:

    pi install git:github.com/jordilopez/pi-agent-skills

The package must provide the complete upstream resource set required by the
full-repo port:

- All 25 upstream skills, with names, descriptions, and content unchanged.
- The seven shared references used by those skills.
- All nine upstream commands, converted to Pi prompt templates.
- All four upstream agents, converted to Pi subagent definitions.
- A Pi extension implementing the session-start context/meta-skill behavior
  that maps cleanly to Pi.
- A Pi extension command interface that installs and manages this package's
  four agents in a project-local directory using an ownership manifest,
  without overwriting unrelated agents. The install command emits the agent
  format required by the user's chosen subagent orchestrator (`tmux`, `herdr`,
  or `pi-subagents`) from one canonical agent source.
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
  - `agents/` for the four package-owned canonical agent sources; Pi does not
    discover these from the package manifest, so the extension delivers them
    to projects.
  - `agents/overrides/` for declarative per-orchestrator frontmatter patches
    and target directories. These are data files, not executable code.
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

    pi install git:github.com/jordilopez/pi-agent-skills

During local development, the equivalent is:

    pi install /abs/path/to/pi-agent-skills

If a specific revision is required for verification, use Pi's supported git
reference syntax:

    pi install git:github.com/jordilopez/pi-agent-skills@<ref>

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
- The `agents/` directory is included in the package files so that the
  canonical agent sources and `agents/overrides/` are available after
  installation.
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
      overrides/
        tmux.yaml
        herdr.yaml
        pi-subagents.yaml
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
      agents.md                     Verbatim import from upstream tag 0.6.9; excluded from Prettier
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

The four `agents/` files are package-owned canonical source definitions. They
are not listed under `pi.agents` because Pi does not discover agents from a
package manifest. The agent-delivery extension converts and installs them into
a project-local directory only when the user invokes its commands.

The canonical source format is the tmux-format frontmatter already present in
those four files (`pane: false`, `deny-tools: write, edit`). Per-orchestrator
`agents/overrides/<format>.yaml` files declare the target directory and the
frontmatter patch that adapts the canonical source to that orchestrator.
Conversion is data-driven: adding an orchestrator adds one override file and
must not require a change to the conversion algorithm.

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

Preserve each agent's body and instructions. The four files under `agents/`
are the canonical source and use tmux-format frontmatter: `pane: false` and
`deny-tools: write, edit`. Each canonical agent must:

- Retain its upstream `name`.
- Retain its upstream `description`.
- Be configured as non-pane.
- Deny `write` and `edit` tools so it remains read-only.
- Preserve the upstream review/audit behavior.
- Not gain permission to modify repository files as part of the conversion.

Delivery converts the canonical source into the format required by the user's
chosen orchestrator. Conversion is declared by data, not by code. Each
supported orchestrator has one override file under `agents/overrides/` that
declares a target directory and a frontmatter patch:

| Format | Target directory | Frontmatter patch |
| --- | --- | --- |
| `tmux` | `<project>/.pi/agents/` | Pass-through; the canonical frontmatter is installed unchanged. |
| `herdr` | `<project>/.pi/herdr-subagents/agents/` | Remove `pane`. Set `access: read` and `tools: read, bash, grep, find, ls, codemode`. |
| `pi-subagents` | `<project>/.pi/agents/` | Remove `pane` and `deny-tools`. Set `tools: read, grep, find, ls, bash, contact_supervisor`, `acceptanceRole: read-only`, `inheritProjectContext: true`, `inheritSkills: false`, `systemPromptMode: replace`. |

An override file is a small declarative document, for example:

    targetDir: .pi/herdr-subagents/agents
    frontmatter:
      remove: [pane]
      set:
        access: read
        tools: read, bash, grep, find, ls, codemode

The agent body below the frontmatter is preserved verbatim for every format.
Only frontmatter is added, removed, or replaced.

Every converted agent must remain read-only in every supported format. A
conversion that would grant `write` or `edit` to a read-only agent is a defect,
not a configuration choice.

The `tmux` and `pi-subagents` formats share the target directory
`<project>/.pi/agents/`. A project installs exactly one format at a time; the
install command refuses to switch formats in place (see Project-local agent
delivery).

Adding a new orchestrator requires adding one `agents/overrides/<format>.yaml`
file and one entry in the orchestrator detection table. It must not require a
new conversion function.

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

    /agent-skills:install [format]
    /agent-skills:update [format]
    /agent-skills:status
    /agent-skills:uninstall

These commands manage only the four agents shipped by this repository. They
must install them into the target directory declared by the selected
orchestrator format and store ownership metadata at
`<project>/.pi/pi-agent-skills/manifest.json`. The manifest records its format
version, package name and version, the selected orchestrator format, each
package-relative source path, each project-relative target path, and a SHA-256
content hash of the converted content that was installed.

#### Format selection

Supported formats are `tmux`, `herdr`, and `pi-subagents`. The install and
update commands accept an optional positional `format` argument. Selection
resolves in this order:

1. An explicit `format` argument, which must be one of the supported formats.
2. Automatic detection when exactly one recognized orchestrator package is
   present in the active Pi package configuration.
3. An interactive prompt listing the supported formats, when Pi is running
   interactively and no format can be detected.
4. Otherwise, the command fails with a message naming the supported formats and
   stating that no orchestrator was detected.

Recognition uses this mapping. Only these package identities may be recognized;
the table is the single place in the extension that names an orchestrator.

| Package | Format |
| --- | --- |
| `npm:@vanillagreen/pi-agents-tmux` | `tmux` |
| `npm:@maxiaochao/pi-herdr-subagents` | `herdr` |
| `npm:pi-subagents` | `pi-subagents` |

Detection is a convenience, not a source of truth. When two or more recognized
orchestrators are present, detection is ambiguous and must not guess; the
command falls through to the prompt or to the explicit-argument requirement.

Recognizing a package identity does not authorize installing it. This package
emits orchestrator-compatible files only.

#### Format switching

A project installs exactly one format at a time. When a manifest exists whose
recorded format differs from the requested format, install and update must
refuse the operation and instruct the user to run `/agent-skills:uninstall`
before installing the new format. The refusal must not modify any file. This
matches the existing refusal behavior for foreign manifests and keeps each
state change a single, reviewable operation.

#### Ownership manifest

The ownership manifest format version becomes `3`. A version `2` manifest is
read as format `tmux` and is rewritten as version `3` on the next successful
install or update; no agent content is lost. Version `1` remains unsupported
and continues to require uninstall followed by install.

#### Behavior

Install and update must create missing package-owned agents, refresh agents
listed in the manifest even when locally modified, skip and report foreign
colliding files, update ownership only after successful operations, and be
idempotent. Conversion must be deterministic: the same canonical source and
override file must always produce byte-identical output.

Install and update must validate each converted agent against the selected
format before writing it, and must fail the operation, with rollback, when a
converted agent does not satisfy that format's shape requirements. A malformed
override file must fail the operation rather than install a partially
converted agent.

Status must not mutate files and must report installed, missing, stale, and
foreign/colliding entries, using the format recorded in the manifest to locate
the target directory. Uninstall may remove only manifest-owned agents and the
package-owned manifest; it must never touch foreign agents, foreign manifests,
global `~/.pi/agent/agents/` or `~/.pi/agent/herdr-subagents/`, workflows,
skills, Pi itself, or other packages. Commands must fail clearly when no active
project root is available.

Uninstall must remain format-agnostic: it removes exactly the target paths
recorded in the manifest and does not require the user to restate the format.

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
- Keep the orchestrator detection table as the only extension code that names a
  specific orchestrator package.
- Keep conversion rules in `agents/overrides/<format>.yaml` data files; do not
  add per-orchestrator conversion functions.
- Validate override files and converted agent output before any filesystem
  mutation, and report a specific reason when validation fails.

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
   `pi install git:github.com/jordilopez/pi-agent-skills` or
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
- Installing into a scratch project places only this package's agents in the
  selected format's target directory and records the selected format in the
  package manifest.
- Installing `tmux` and installing `pi-subagents` both target
  `<project>/.pi/agents/`, and each produces frontmatter valid for its
  orchestrator.
- Installing `herdr` produces files under
  `<project>/.pi/herdr-subagents/agents/` whose frontmatter satisfies the herdr
  persona schema, verified by parsing one converted file with herdr's own
  parser.
- Requesting a format that differs from the recorded format refuses the
  operation without modifying files and reports the uninstall-then-install
  instruction.
- Installing with no argument in a non-interactive session, with no detectable
  orchestrator, fails with a message naming the supported formats.
- A malformed override file fails the operation and leaves no partially
  converted agent behind.
- Re-running install/update refreshes owned agents but preserves foreign
  colliding agents; status is read-only; uninstall removes only owned agents.
- The root-level references are present in the installed package and the
  relative skill links resolve.
- No files are created under `~/.pi/agent/agents/` or
  `~/.pi/agent/herdr-subagents/`, and no workflows are copied into the project.

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
- There are exactly four canonical subagent definitions.
- All four canonical agents are non-pane and deny `write` and `edit`.
- `agents/overrides/` contains exactly the three supported override files and
  no executable code.

The prompt and agent conversions have disjoint file ownership and may be
implemented in parallel, followed by one manifest-level discovery check.

### Phase 4: Extension, project-local agent delivery, and hook documentation

Implement the session-start extension, the project-local agent-delivery command
interface, and retain/document the original hooks.

Acceptance:

- The Pi extensions load through the manifest.
- Session-start context/meta-skill injection is implemented using Pi's lifecycle
  API.
- Install/update/status/uninstall manage only this package's four agents using
  `<project>/.pi/pi-agent-skills/manifest.json`.
- Install and update accept the optional `format` argument, resolve the format
  by argument, detection, or interactive prompt, and refuse a format switch in
  place without modifying files.
- Converted agents are validated against the selected format before writing; a
  malformed override fails the operation with rollback.
- Manifest-owned agents refresh on update; foreign colliding agents are
  reported and preserved; status is read-only; uninstall is ownership-safe and
  format-agnostic.
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
- Preserve the four converted agents as package-owned canonical source files
  and deliver them only through explicit project-local agent commands.
- Configure the canonical agents as non-pane and read-only by denying `write`
  and `edit`, and keep every converted format read-only as well.
- Keep conversion rules declarative in `agents/overrides/`, with the detection
  table as the only extension code that names an orchestrator package.
- Record ownership, source paths, target paths, selected format, package
  version, and SHA-256 hashes of the installed converted content for
  successfully delivered agents.
- Never overwrite or delete foreign or non-owned project agents or write to the
  global agent directories.
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
- Before changing the ownership-manifest path or adding, removing, or renaming
  a supported orchestrator format.
- Before changing the orchestrator detection table or its package mapping.
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
- Never write to `~/.pi/agent/agents/` or `~/.pi/agent/herdr-subagents/`, or
  copy workflows into projects.
- Never overwrite or delete foreign or non-owned project agents.
- Never install, invoke, or declare a dependency on any subagent orchestrator,
  including `@vanillagreen/pi-agents-tmux`, `@maxiaochao/pi-herdr-subagents`,
  and `pi-subagents`. Emitting orchestrator-compatible agent files is in scope;
  installing the orchestrator is the user's responsibility.
- Never install two orchestrator formats into the same project at the same
  time.
- Never grant `write` or `edit` to a canonical read-only agent in any format.
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
- Installing, configuring, or invoking any subagent orchestrator.
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
- An override file is data, so a malformed or over-broad patch could produce an
  agent that fails to load, or that is not read-only; validate before writing
  and fail closed.
- Format detection can be ambiguous when multiple orchestrators are installed;
  detection must not guess.
- The `tmux` and `pi-subagents` formats share a target directory, so switching
  between them requires an uninstall step.

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
- Validate each converted agent against the selected format before writing, and
  roll back the whole operation on failure.
- Treat the orchestrator detection table as the single authoritative mapping and
  keep it free of conversion logic.
- Keep the canonical agent sources unchanged so an override file is the only
  per-orchestrator variable.

### Backout

If a release candidate fails installation or discovery, revert the package
manifest or conversion commit while preserving the upstream import. A
git-installed package can be removed or replaced by installing a known-good
revision. The separate `pi-setup` collision cleanup must be reverted
independently in that repository if it has already been performed.

## Success Criteria

The package is complete only when all of the following are true:

1. `pi install git:github.com/jordilopez/pi-agent-skills` succeeds from a clean environment
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
11. The four package-owned agents are available as canonical source files and
    are delivered to a project only through the namespaced agent commands.
12. Installing or updating creates/refreshes only manifest-owned agents in the
    selected format's target directory, records the selected format and SHA-256
    ownership metadata at `<project>/.pi/pi-agent-skills/manifest.json`, and
    preserves foreign colliding agents.
13. Status is non-mutating and reports installed, missing, stale, and foreign
    entries; uninstall removes only owned agents and the owned manifest and does
    not require the format to be restated.
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
    non-portable hooks, project-local agent delivery, orchestrator format
    selection, ownership semantics, coexistence guarantees, and the separate
    `pi-setup` collision-cleanup follow-up.
22. Each supported format produces agent files whose frontmatter satisfies that
    orchestrator's schema, and every converted agent remains read-only.
23. Install and update resolve the format by explicit argument, detection, or
    interactive prompt, and refuse a format switch in place without modifying
    files.
24. Conversion rules live in `agents/overrides/` as data, and the only
    orchestrator-specific extension code is the detection table.

## Revision History

### Revision 2 - multi-orchestrator agent delivery

- Agent delivery becomes format-aware. One canonical agent source in `agents/`
  is converted into `tmux`, `herdr`, or `pi-subagents` format at install time
  using declarative `agents/overrides/<format>.yaml` files.
- `agent-skills:install` and `agent-skills:update` accept an optional `format`
  argument and otherwise resolve the format by detection or interactive prompt.
- The ownership-manifest format version becomes `3` and records the selected
  format. Version `2` manifests are read as `tmux` and upgraded in place.
- A format switch in place is refused; uninstall then install is required.
- The canonical agents remain non-pane and read-only, and every converted
  format must remain read-only.
- The package still never installs, invokes, or depends on an orchestrator.
  The previous prohibition on `@vanillagreen/pi-agents-tmux` is narrowed from
  "do not target" to "do not install, invoke, or depend on"; emitting
  tmux-compatible agent files is now in scope.
