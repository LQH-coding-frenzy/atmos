# OpenCode Large-Codebase Token & Context Optimization Upgrade Plan

> **Goal:** Restructure the repository's OpenCode configuration and agent workflow so future AI coding sessions load only the context required for the current task, minimize repeated input tokens, avoid unnecessary repository exploration, and retain enough project knowledge to work safely.
>
> **Target:** OpenCode V2
>
> **Primary optimization principle:** **Retrieve context on demand instead of placing repository knowledge permanently in every model request.**

---

## 1. Objectives

This upgrade should achieve the following:

1. Reduce the amount of persistent project context injected into every model call.
2. Prevent agents from recursively exploring or reading large areas of the repository without a reason.
3. Keep subsystem-specific rules local to the subsystem that needs them.
4. Move infrequently needed workflows and documentation into lazy-loaded OpenCode Skills.
5. Encourage search-first, read-second repository exploration.
6. Keep unrelated tasks in separate sessions so stale context does not accumulate.
7. Use subagents as isolated exploration/review contexts when appropriate.
8. Prefer targeted tests, linting, and type checks instead of full-repository command output.
9. Keep automatic compaction enabled so long sessions periodically replace old working context with a smaller checkpoint.
10. Avoid optional OpenCode features that create additional model requests without a clear cost benefit.
11. Make the entire strategy maintainable so future contributors do not gradually turn `AGENTS.md` into a large always-loaded handbook.
12. Provide measurable acceptance criteria to verify that token usage actually improves.

---

# 2. Current OpenCode V2 Behavior to Design Around

The implementation should be based on these OpenCode V2 behaviors.

## 2.1 `AGENTS.md` is active privileged context

OpenCode V2 discovers `AGENTS.md` files and makes their contents available as instructions to the model.

A root `AGENTS.md` should therefore contain only information that is useful for nearly every coding task.

Large root instruction files create a recurring context cost because the same information can influence every request in the session.

## 2.2 Nested `AGENTS.md` files are discovered incrementally

A nested `AGENTS.md` below the starting location is not necessarily loaded immediately.

When OpenCode reads a file or lists a directory inside a subtree, it can discover the relevant nested `AGENTS.md` files on the path to that target and inject each newly discovered file once for the session.

This makes nested `AGENTS.md` files the preferred mechanism for subsystem-specific persistent rules.

Example:

```text
repo/
├── AGENTS.md
├── apps/
│   ├── web/
│   │   ├── AGENTS.md
│   │   └── src/
│   └── api/
│       ├── AGENTS.md
│       └── src/
└── packages/
    └── database/
        ├── AGENTS.md
        └── src/
```

A frontend task should not require database-specific instructions unless the task actually enters the database subtree.

## 2.3 Skills are lazy-loaded

OpenCode Skills are advertised to the agent using small metadata such as an ID/name and description.

The complete `SKILL.md` body is loaded only when the agent invokes the relevant skill.

Supporting files inside a skill directory are also not automatically loaded.

This is ideal for:

- database migration procedures
- release procedures
- deployment rules
- framework-specific debugging playbooks
- test-writing conventions
- security review workflows
- code-generation procedures
- infrequently used architectural references

## 2.4 Do not depend on `opencode.jsonc` `instructions` in V2

OpenCode V2 currently accepts the `instructions` configuration field but does not resolve those entries into active instruction sources.

Therefore this migration **must not depend on** entries such as:

```jsonc
{
  "instructions": [
    "docs/**/*.md"
  ]
}
```

for model behavior.

Use:

- `AGENTS.md`
- nested `AGENTS.md`
- Skills
- normal file reads
- references where explicitly useful

instead.

## 2.5 Automatic compaction is enabled by default

OpenCode V2 can compact older conversation context into a generated checkpoint when the active context approaches the model limit.

The checkpoint contains important objectives, decisions, completed/active work, blockers, next steps, and relevant files while retaining a configurable amount of recent context.

This should remain enabled.

## 2.6 Subagents use separate child sessions

OpenCode subagents execute with fresh child-session context.

This is useful for isolating exploratory work from the main implementation session.

The raw exploration remains in the child session while the parent receives a compact result.

## 2.7 Session warming costs real model requests

OpenCode V2 session warming periodically calls the active model to preserve provider-side caches.

Those requests can consume tokens and incur cost.

For a cost-optimization profile, warming should remain disabled unless measurements prove that provider cache savings exceed warming costs.

---

# 3. Desired Repository Architecture

The target repository structure should look approximately like this:

```text
repo/
│
├── AGENTS.md
├── opencode.jsonc
│
├── .opencode/
│   ├── agents/
│   │   ├── explorer.md
│   │   ├── reviewer.md
│   │   └── optional/
│   │       └── architecture-investigator.md
│   │
│   └── skills/
│       ├── targeted-verification/
│       │   └── SKILL.md
│       ├── database-migration/
│       │   ├── SKILL.md
│       │   └── references/
│       ├── frontend-workflow/
│       │   └── SKILL.md
│       ├── release/
│       │   ├── SKILL.md
│       │   └── references/
│       └── debugging/
│           └── SKILL.md
│
├── apps/
│   ├── web/
│   │   ├── AGENTS.md
│   │   └── ...
│   └── api/
│       ├── AGENTS.md
│       └── ...
│
├── packages/
│   ├── shared/
│   │   ├── AGENTS.md       # only if useful
│   │   └── ...
│   └── database/
│       ├── AGENTS.md
│       └── ...
│
└── docs/
    └── architecture/
        ├── INDEX.md
        ├── frontend.md
        ├── backend.md
        ├── database.md
        └── ...
```

Not every directory needs an `AGENTS.md`.

Only create one where a subtree contains rules that:

1. are important for most work in that subtree, and
2. are not important for most work elsewhere.

---

# 4. Migration Strategy

Implement this upgrade in stages instead of changing all repository guidance at once.

Recommended order:

```text
Phase 0  Baseline current usage
Phase 1  Audit existing instructions/context
Phase 2  Create lean root AGENTS.md
Phase 3  Add nested subsystem AGENTS.md files
Phase 4  Convert specialist guidance to Skills
Phase 5  Add context-efficient agents/subagents
Phase 6  Add OpenCode cost-conscious config
Phase 7  Improve repository search boundaries
Phase 8  Define task/session workflow rules
Phase 9  Introduce targeted verification rules
Phase 10 Add architecture index
Phase 11 Validate behavior with benchmark tasks
Phase 12 Measure token/cost improvement
Phase 13 Document maintenance rules
```

Do not attempt aggressive tuning of compaction parameters until the earlier structural changes have been measured.

---

# 5. Phase 0 — Establish a Baseline

Before changing anything, collect a small baseline.

Select approximately 5 representative tasks:

1. Small local bug fix
2. Medium feature inside one subsystem
3. Cross-package feature
4. Test failure investigation
5. Architecture/debugging investigation

For each task, record if available:

```text
Task:
Model:
Input tokens:
Cached input tokens:
Output tokens:
Number of model requests:
Number of files read:
Number of searches:
Largest tool output:
Session duration:
Total provider cost:
```

Also record qualitative behavior:

- Did the agent scan unrelated directories?
- Did it repeatedly reread files?
- Did it run full repository tests unnecessarily?
- Did it ingest large documentation files?
- Did unrelated prior conversation affect the task?
- Did the agent lose important context before completion?

Save results somewhere such as:

```text
docs/ai-cost/baseline.md
```

Do **not** optimize solely on one synthetic task.

---

# 6. Phase 1 — Audit Existing Context Sources

Search for all files that may currently instruct AI coding agents.

Candidate files include:

```text
AGENTS.md
CLAUDE.md
.opencode/**
.cursor/**
.github/copilot*
CONTRIBUTING.md
DEVELOPMENT.md
ARCHITECTURE.md
README.md
docs/**/*.md
```

Create an inventory table:

| Source | Approx Size | Always Needed? | Scope | Destination |
|---|---:|---|---|---|
| Root architecture guide | large | No | entire repo | architecture docs |
| Build commands | small | Yes | entire repo | root `AGENTS.md` |
| DB migration policy | medium | No | database work | Skill |
| React conventions | medium | No | frontend | nested `AGENTS.md` |
| Release checklist | large | No | release only | Skill |

Classify every significant instruction into one of four buckets:

### A. Global persistent

Information needed for almost every task.

Destination:

```text
/AGENTS.md
```

### B. Subsystem persistent

Information needed for most work inside one subtree.

Destination:

```text
/<subsystem>/AGENTS.md
```

### C. Workflow-specific

Information needed only for a type of task.

Destination:

```text
/.opencode/skills/<skill>/SKILL.md
```

### D. Reference-only

Detailed background information needed occasionally.

Destination:

```text
/docs/...
```

or:

```text
/.opencode/skills/<skill>/references/...
```

The main migration objective is to minimize category **A**.

---

# 7. Phase 2 — Replace the Root `AGENTS.md` With a Lean Version

Target size:

```text
Preferred: 50–120 lines
Upper target: ~150 lines
```

This is a guideline, not a hard technical limit.

The file should contain only:

- project type
- package/workspace manager
- concise repository map
- essential build/test/lint commands
- key architectural boundaries
- universal code rules
- context-management rules
- verification policy
- pointers to deeper documentation

## Recommended root template

```md
# Repository Agent Guide

## Project

<one or two sentences describing the project>

Package manager: `<tool>`
Primary language: `<language>`
Workspace/monorepo system: `<tool if applicable>`

## Repository Map

- `apps/web` — frontend application
- `apps/api` — API/backend
- `packages/shared` — shared types/utilities
- `packages/database` — schema/database layer
- `docs` — long-form project documentation

## Core Commands

Install:
`<command>`

Typecheck:
`<command>`

Lint:
`<command>`

Tests:
`<command>`

Prefer package-local or file-local variants whenever possible.

## Universal Rules

- Preserve existing public APIs unless the task explicitly changes them.
- Search for existing abstractions before creating new ones.
- Do not modify generated files.
- Do not modify vendored dependencies.
- Avoid unrelated refactors while fixing a scoped problem.
- Follow existing patterns in the owning subsystem.

## Context Discipline

This is a large repository. Minimize unnecessary model context.

1. Do not recursively read or summarize the entire repository.
2. Begin unfamiliar tasks with targeted search/glob operations.
3. Identify the likely owning module before reading implementation files.
4. Read only files required to understand the current behavior.
5. Follow imports, callers, and references incrementally.
6. Expand exploration only when an unresolved dependency requires it.
7. Avoid generated output, dependency directories, fixtures, snapshots,
   and build artifacts unless directly relevant.
8. Do not preload architecture documentation.
9. Load detailed documentation only when required by the current task.
10. Before editing, identify the smallest likely affected file set.

## Verification Discipline

Use the narrowest useful verification first.

1. Test the changed unit/module.
2. Run the owning package's typecheck/lint if applicable.
3. Expand to package-wide tests when the change crosses local boundaries.
4. Run repository-wide validation only for genuinely cross-cutting changes
   or when explicitly requested.

Do not dump large successful command output into the working context.

## Architecture Documentation

Start with `docs/architecture/INDEX.md` when ownership or subsystem
boundaries are unclear.

Read individual architecture documents only as needed.

## OpenCode Skills

Use an available project skill when its description matches the task.
Do not load unrelated skills preemptively.
```

### Root `AGENTS.md` anti-patterns

Do not include:

- complete API documentation
- exhaustive coding style rules already enforced by tools
- entire architecture explanations
- deployment runbooks
- every database rule
- enormous directory listings
- changelogs
- large examples
- generic advice the model already knows
- framework documentation
- copied README sections that can be read on demand

---

# 8. Phase 3 — Add Nested `AGENTS.md` Files

Create nested files only at meaningful subsystem boundaries.

Example:

```text
apps/web/AGENTS.md
apps/api/AGENTS.md
packages/database/AGENTS.md
packages/shared/AGENTS.md
```

Avoid putting an `AGENTS.md` in every folder.

## Frontend example

`apps/web/AGENTS.md`

```md
# Web Application Guidance

Applies to work under `apps/web`.

## Architecture

- UI components: `src/components`
- routes/pages: `src/routes`
- state: `src/state`
- API clients: `src/api`

## Rules

- Reuse existing design-system components before adding custom UI.
- Keep server interaction inside the existing API/client layer.
- Do not introduce new global state for component-local behavior.
- Preserve SPA navigation behavior unless explicitly changing routing.

## Verification

Prefer:

1. tests for the affected component/module
2. web package typecheck
3. web package lint

Do not run backend or repository-wide tests for frontend-only changes.
```

## Database example

`packages/database/AGENTS.md`

```md
# Database Package Guidance

Applies to work under `packages/database`.

## Rules

- Treat existing production migrations as immutable.
- Schema changes must include the required migration.
- Preserve backward compatibility when the deployment sequence requires it.
- Do not manually modify generated client code.

## Specialized Workflow

For schema or migration changes, load the `database-migration` skill.
```

### Important rule

Nested `AGENTS.md` should contain **persistent local invariants**, not every possible workflow.

If guidance only matters to an occasional task, it belongs in a Skill instead.

---

# 9. Phase 4 — Move Specialist Knowledge Into Skills

Create:

```text
.opencode/skills/
```

Use one skill per bounded workflow.

Candidate skills:

```text
database-migration
frontend-testing
api-contract-change
release
dependency-upgrade
performance-investigation
security-review
debugging
generated-code
e2e-testing
```

## Skill design rules

Each `SKILL.md` should:

1. Have a very specific description.
2. Explain when it should be used.
3. Contain the minimum procedure required.
4. Point to supporting reference files instead of embedding large material.
5. Tell the agent what files to inspect first.
6. Tell the agent what validation to run.
7. Define stopping conditions.
8. Avoid generic coding advice.

## Example

`.opencode/skills/database-migration/SKILL.md`

```md
---
name: Database Migration
description: Use when changing database schema, migrations, indexes, constraints, or persisted data shape.
---

# Workflow

1. Read the database package's `AGENTS.md`.
2. Locate the current schema definition.
3. Inspect only migrations directly relevant to the affected table/entity.
4. Read `references/migration-policy.md` if deployment ordering or
   backwards compatibility matters.
5. Propose the migration strategy before editing.
6. Never alter an already-deployed migration.
7. Generate or create the new migration using the repository's normal tool.
8. Run database-package validation.
9. Run affected application tests only if their contract changed.

# Return

Summarize:

- schema change
- migration created
- compatibility implications
- validation performed
```

Supporting structure:

```text
.opencode/skills/database-migration/
├── SKILL.md
└── references/
    ├── migration-policy.md
    └── deployment-order.md
```

The references should be read only when their specific information is needed.

---

# 10. Phase 5 — Introduce Context-Efficient Subagents

OpenCode already provides an `explore` subagent, but project-specific agents can enforce tighter output formats and model choices.

## `explorer.md`

Create:

```text
.opencode/agents/explorer.md
```

Suggested behavior:

```md
---
description: Locate relevant implementation and dependencies with minimal context.
mode: subagent
steps: 8
---

You are a repository exploration agent.

Do not edit files.

Goal: identify the minimum code surface needed for the parent's task.

Rules:

1. Start with grep/glob/search.
2. Do not recursively inspect the repository.
3. Read the smallest useful set of files.
4. Follow imports/callers only when needed.
5. Stop once ownership and control flow are sufficiently understood.

Return only:

## Relevant Files
- path — why it matters

## Control Flow
Concise description.

## Constraints
Important invariants discovered.

## Likely Change Surface
Smallest expected set of files.

## Uncertainties
Anything the implementation agent must still verify.

Do not return raw file contents unless absolutely necessary.
```

### Model selection

If your provider setup allows it, assign repository exploration to a cheaper/fast model.

Use stronger reasoning models for:

- difficult architecture
- ambiguous bugs
- cross-system refactors
- correctness-critical implementation

Do not pay premium reasoning rates for filename discovery and basic symbol lookup when a cheaper model performs adequately.

---

# 11. Phase 6 — Add a Reviewer Subagent

Create:

```text
.opencode/agents/reviewer.md
```

Suggested behavior:

```md
---
description: Review a completed change without broad repository exploration.
mode: subagent
steps: 8
---

Review the proposed change for:

- correctness
- regressions
- missing edge cases
- violated local conventions
- inadequate tests
- accidental scope expansion

Context discipline:

- inspect the diff first
- inspect directly affected files second
- expand outward only for a concrete concern
- do not perform a general repository audit

Return only actionable findings.

For each finding include:

1. Severity
2. File/location
3. Problem
4. Why it matters
5. Minimal recommended fix
```

This isolates review context from implementation context.

---

# 12. Phase 7 — Configure OpenCode Conservatively

Create or update:

```text
opencode.jsonc
```

Recommended starting point:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",

  "compaction": {
    "auto": true,
    "keep": {
      "tokens": 15000
    },
    "buffer": 20000
  },

  "warming": false
}
```

## Why

### Compaction

Keep automatic compaction enabled.

Start with OpenCode's documented defaults rather than tuning immediately.

After the migration has real usage data, consider decreasing `keep.tokens` if:

- long sessions retain too much stale detail
- the generated checkpoints retain the information needed
- tasks commonly continue successfully after compaction

Do not lower it aggressively before testing.

### Warming

Keep warming disabled for the initial cost-optimized profile.

Warming generates actual provider requests.

Enable it only after measuring a specific provider where preserved prompt caches demonstrably reduce overall cost.

---

# 13. Phase 8 — Improve Search Boundaries

The repository should make irrelevant files easy for agents to avoid.

Review `.gitignore`.

Typical exclusions:

```gitignore
node_modules/
dist/
build/
coverage/
.next/
.nuxt/
.cache/
tmp/
temp/
vendor/
.generated/
*.generated.*
```

Adapt this list to the actual project.

Do not ignore files that developers genuinely need to search.

The objective is to remove:

- dependencies
- compiler output
- bundles
- generated code
- caches
- test coverage artifacts
- large temporary files

from routine discovery.

If OpenCode watcher exclusions are configured separately, also exclude large generated/build directories there.

---

# 14. Phase 9 — Establish a Search-First Agent Workflow

Future task prompts and project rules should encourage this workflow:

```text
USER TASK
    │
    ▼
Determine likely subsystem
    │
    ▼
grep / glob / symbol search
    │
    ▼
Identify small candidate set
    │
    ▼
Read 2–5 relevant files
    │
    ▼
Follow imports/callers only if necessary
    │
    ▼
Form implementation hypothesis
    │
    ▼
Edit minimal file set
    │
    ▼
Run targeted verification
    │
    ▼
Expand scope only on evidence
```

Avoid this workflow:

```text
USER TASK
    │
    ▼
Read README
    │
    ▼
Read architecture docs
    │
    ▼
Scan entire src tree
    │
    ▼
Read many potentially related files
    │
    ▼
Finally determine ownership
```

---

# 15. Phase 10 — Standardize Cost-Efficient User Prompts

For large repositories, task prompts should give the agent a useful search boundary.

Recommended task template:

```md
## Objective

<What must change?>

## Likely Area

<Paths/packages if known>

## Constraints

- <behavior that must remain unchanged>
- <APIs that must remain compatible>
- <areas that should not be modified>

## Exploration

Start with targeted search.
Do not inspect unrelated subsystems.
Expand scope only when a dependency requires it.

## Acceptance Criteria

- <observable result>
- <tests>
- <compatibility requirement>

## Verification

Run the narrowest relevant test/typecheck/lint first.
```

Example:

```md
## Objective

Fix the metadata tooltip retaining the previous video's date after SPA navigation.

## Likely Area

- `src/youtube/metadata`
- `src/youtube/navigation`

## Constraints

- Preserve static-page behavior.
- Do not modify unrelated description rendering.
- Preserve existing public userscript options.

## Exploration

Locate navigation lifecycle handling and tooltip state ownership first.
Do not inspect unrelated channel-page code unless a dependency points there.

## Acceptance Criteria

- Tooltip updates after every SPA navigation.
- No stale metadata from the previous video.
- Existing static-load behavior remains unchanged.

## Verification

Run metadata/navigation tests first.
Use broader tests only if the fix touches shared navigation infrastructure.
```

---

# 16. Phase 11 — Use Separate Sessions for Separate Work Units

Adopt the rule:

> **One coherent engineering objective per OpenCode session.**

Good:

```text
Session A — Fix auth refresh bug
Session B — Refactor dashboard CSS
Session C — Add database index
```

Bad:

```text
Session A:
  fix auth
  then CSS
  then DB
  then dependency upgrade
  then investigate CI
```

Create a new session when:

- the requested task belongs to a different subsystem
- the prior task is complete
- the new task does not materially depend on previous reasoning
- the current history is dominated by unrelated tool output

Continue the same session when:

- debugging the same change
- handling review feedback for the same change
- extending the same feature
- resolving tests caused by the same change

---

# 17. Phase 12 — Minimize Command Output

Command output can become substantial model context.

Add project-specific verification commands that are intentionally narrow.

Examples:

```bash
pnpm --filter web test src/auth
pnpm --filter api typecheck
pytest tests/auth/test_refresh.py
cargo test auth::
eslint apps/web/src/auth
```

Prefer these over:

```bash
pnpm test
pytest
cargo test
eslint .
```

unless broad verification is justified.

## Failure-first output

Where tools support it, prefer output modes that:

- show failures rather than every successful test
- use concise reporters
- avoid progress animations
- avoid verbose dependency logs

If a full test suite must run, the agent should focus on:

- exit status
- failing test names
- relevant stack traces
- summary counts

and avoid copying the complete successful output back into reasoning.

---

# 18. Phase 13 — Build a Tiny Architecture Index

Create:

```text
docs/architecture/INDEX.md
```

Target size:

```text
~30–100 lines
```

Example:

```md
# Architecture Index

Use this file only to locate the owning subsystem.

| Area | Code | Detailed Documentation |
|---|---|---|
| Web UI | `apps/web` | `frontend.md` |
| API | `apps/api` | `backend.md` |
| Authentication | `packages/auth` | `auth.md` |
| Database | `packages/database` | `database.md` |
| Workers | `apps/worker` | `workers.md` |

## Dependency Direction

`web -> api -> domain -> database`

Shared packages must not import application packages.

## Task Routing

UI behavior:
Start in `apps/web`.

HTTP/API behavior:
Start in `apps/api`.

Persistence/schema:
Start in `packages/database`.

Unknown ownership:
Search by feature/domain name before opening detailed architecture documents.
```

Long architecture files remain normal reference files.

Do not inject all of them into every session.

---

# 19. Phase 14 — Avoid Duplicate Knowledge

Each important rule should ideally have one authoritative home.

Bad:

```text
AGENTS.md
docs/architecture.md
README.md
skill
nested AGENTS.md
```

all repeating the same 40-line explanation.

Prefer:

```text
root AGENTS.md:
  "Database migrations must use the database-migration skill."

database AGENTS.md:
  core persistent invariants

database-migration SKILL.md:
  workflow

references/migration-policy.md:
  detailed policy
```

Duplication increases:

- context
- maintenance burden
- contradictory guidance
- agent confusion

---

# 20. Phase 15 — Add Context Escalation Rules

Agents should follow a bounded exploration ladder.

```text
Level 1
Task prompt + current file

Level 2
Targeted grep/glob

Level 3
Owning files + direct tests

Level 4
Direct callers/imports

Level 5
Subsystem architecture doc

Level 6
Cross-subsystem investigation

Level 7
Broad repository exploration
```

The agent should move to the next level only when the previous level leaves a concrete unresolved question.

Add this principle to the root or explorer agent:

```md
Use progressive context escalation.

Do not gather broader context merely because it might be useful.
Gather it when a concrete unanswered question requires it.
```

---

# 21. Phase 16 — Define Stop Conditions for Exploration

A common token sink is continuing repository research after enough information is already available.

The agent should stop exploration once all of the following are known:

- owning module
- current control flow
- state/data owner
- direct callers or consumers relevant to the task
- expected affected files
- relevant tests
- critical invariants

At that point, implement.

Do not continue searching for "more context" without a concrete uncertainty.

---

# 22. Phase 17 — Limit Large File Reads

For very large source files or generated-like artifacts:

1. Search for the relevant symbol first.
2. Read the local section.
3. Expand around callers or related definitions only when needed.

Avoid loading a multi-thousand-line file solely because one function inside it may be relevant.

If a repository contains giant files repeatedly used by agents, consider normal software-engineering refactoring where appropriate—but do not refactor purely for AI token reduction unless it also improves human maintainability.

---

# 23. Phase 18 — Create Task-Specific Commands Only Where They Save Repetition

OpenCode supports reusable commands.

Use them for stable workflows such as:

```text
/review
/verify
/investigate
```

Example conceptual `/investigate` prompt:

```text
Investigate the requested issue using minimal repository context.

Start with targeted search.
Identify the owning module, control flow, relevant tests, and smallest likely
change surface.

Do not edit files.
Do not recursively inspect the repository.

Return a concise implementation brief.
```

Do not create dozens of commands whose descriptions themselves become noise or whose behavior can be expressed by one sentence in a task.

---

# 24. Phase 19 — Establish an Expensive-Model Policy

If multiple models are available:

## Cheap/fast model

Use for:

- repository search
- symbol localization
- simple code navigation
- test discovery
- mechanical edits
- straightforward lint fixes

## Strong reasoning model

Use for:

- difficult debugging
- architecture decisions
- race conditions
- distributed state
- risky refactors
- complex migrations
- unclear cross-module behavior

## Review model

Can be cheaper than implementation when the review is diff-bounded, or stronger when correctness is critical.

Do not hard-code a particular provider/model until tested against the repository.

Benchmark models using the same representative task set.

---

# 25. Phase 20 — Validation Tests for the Upgrade

After implementation, run controlled OpenCode sessions.

## Test A — Local bug

Ask for a bug fix in one package.

Expected behavior:

- root `AGENTS.md` loads
- subsystem `AGENTS.md` loads when needed
- unrelated subsystem instructions do not become necessary
- no broad architecture docs are opened
- only a few implementation/test files are read
- package-local tests run

## Test B — Database migration

Expected:

- database subtree rules become available
- `database-migration` skill is selected
- detailed migration references load only if needed
- frontend docs remain untouched

## Test C — Architecture investigation

Expected:

- search first
- architecture index read if ownership is unclear
- only relevant detailed architecture docs are loaded
- explorer/subagent returns concise findings

## Test D — Cross-cutting feature

Expected:

- agent expands to multiple subsystems deliberately
- relevant nested `AGENTS.md` files are discovered as work enters those areas
- scope expansion is explained by dependencies
- broad verification happens only if justified

## Test E — Long debugging session

Expected:

- automatic compaction eventually occurs
- session remains coherent after compaction
- old raw tool output is no longer required
- active files and objectives survive in checkpoint context

---

# 26. Acceptance Criteria

The migration is successful when:

### Context behavior

- [ ] Root `AGENTS.md` contains only global rules.
- [ ] Subsystem-specific persistent guidance lives in nested `AGENTS.md`.
- [ ] Rare workflows live in Skills.
- [ ] Long reference documentation is loaded only on demand.
- [ ] `opencode.jsonc` does not rely on `instructions` for V2 behavior.
- [ ] Automatic compaction remains enabled.
- [ ] Session warming is disabled in the cost-optimized profile.
- [ ] Search-first behavior is explicitly documented.
- [ ] Repository-wide reads are discouraged.
- [ ] Targeted verification is the default.

### Repository behavior

- [ ] Dependency/build/generated folders are excluded from normal search where appropriate.
- [ ] There is a concise architecture index.
- [ ] Relevant packages have local instruction files only where justified.
- [ ] Duplicate agent guidance has been removed.
- [ ] Specialist Skill descriptions are precise enough for reliable selection.

### Agent behavior

- [ ] Agents usually identify the owning module before opening many files.
- [ ] Agents expand context only to answer concrete questions.
- [ ] Exploratory subagents return summaries rather than raw dumps.
- [ ] Unrelated work normally starts in a fresh session.
- [ ] Full test suites are not run for simple local changes.
- [ ] Large successful command logs do not dominate model context.

### Cost behavior

After representative benchmarking:

- [ ] Median input tokens per task decrease.
- [ ] Median total provider cost per task decreases.
- [ ] Number of unnecessary file reads decreases.
- [ ] Number of unnecessary full-repo commands decreases.
- [ ] Task success/regression rate does not materially worsen.

---

# 27. Suggested Metrics

Measure before and after.

| Metric | Baseline | After | Goal |
|---|---:|---:|---:|
| Median input tokens/task | | | lower |
| Median output tokens/task | | | neutral/lower |
| Cached input tokens/task | | | observe |
| Provider cost/task | | | lower |
| Model requests/task | | | lower/neutral |
| Files read/task | | | lower |
| Search operations/task | | | may increase slightly |
| Full test runs/task | | | lower |
| Relevant test runs/task | | | neutral/higher |
| Successful first-pass tasks | | | no regression |
| Rework iterations/task | | | no regression |

A modest increase in cheap search operations is acceptable if it prevents expensive large file reads/model context.

---

# 28. Target Cost Model

Think about task cost approximately as:

```text
Total Cost
≈
Σ(
  persistent instructions
  + prior session context
  + retrieved file content
  + command/tool output
  + model response
)
× number of model requests
× model/provider rate
```

This migration attacks each major term:

| Cost Source | Optimization |
|---|---|
| Persistent instructions | lean + nested `AGENTS.md` |
| Specialist knowledge | lazy-loaded Skills |
| Prior session history | task-specific sessions + compaction |
| Repository reads | grep/glob/search-first workflow |
| Exploration | isolated subagents |
| Command logs | targeted verification |
| Expensive reasoning | model routing |
| Idle model requests | warming disabled |

---

# 29. Maintenance Policy

Add a small policy for future contributors.

```md
# AI Context Maintenance

Before adding content to the root `AGENTS.md`, ask:

1. Does nearly every engineering task need this?
2. Would a nested `AGENTS.md` be more appropriate?
3. Is this a workflow that belongs in a Skill?
4. Is this detailed background that should remain normal documentation?
5. Is this already stated somewhere else?

Do not grow the root file merely because information might be useful.

Agent context is a limited working resource.
```

Review the OpenCode context setup periodically.

Recommended trigger:

- major repository restructuring
- new application/package added
- root `AGENTS.md` grows significantly
- agents repeatedly make the same navigation mistake
- token costs drift upward
- OpenCode changes instruction/skill semantics

---

# 30. Rollout Checklist

## Stage A — Inventory

- [ ] Find existing AI instruction files.
- [ ] Estimate their sizes.
- [ ] Categorize global/local/workflow/reference guidance.
- [ ] Record baseline cost/usage on representative tasks.

## Stage B — Persistent context

- [ ] Rewrite root `AGENTS.md`.
- [ ] Remove subsystem-specific detail from root.
- [ ] Add only necessary nested `AGENTS.md` files.
- [ ] Add context-discipline rules.
- [ ] Add targeted-verification rules.

## Stage C — Lazy context

- [ ] Create `.opencode/skills/`.
- [ ] Convert migration procedures.
- [ ] Convert release procedures.
- [ ] Convert specialist test/debug procedures.
- [ ] Move long supporting material into skill `references/`.

## Stage D — Agent isolation

- [ ] Add/adjust explorer subagent.
- [ ] Add reviewer subagent.
- [ ] Configure cheaper model(s) for low-reasoning work if supported and tested.
- [ ] Ensure subagent reports are concise.

## Stage E — OpenCode config

- [ ] Confirm automatic compaction is enabled.
- [ ] Start with default `keep.tokens`/`buffer`.
- [ ] Disable warming.
- [ ] Remove assumptions that V2 `instructions` loads extra files.

## Stage F — Repository hygiene

- [ ] Review `.gitignore`.
- [ ] Exclude generated/build/cache directories appropriately.
- [ ] Add concise architecture index.
- [ ] Remove duplicated AI guidance.

## Stage G — Workflow

- [ ] Introduce standard task prompt template.
- [ ] Adopt one-objective-per-session rule.
- [ ] Prefer search before reading.
- [ ] Define progressive context escalation.
- [ ] Define exploration stop conditions.
- [ ] Prefer targeted command output.

## Stage H — Benchmark

- [ ] Re-run representative tasks.
- [ ] Compare input tokens.
- [ ] Compare request count.
- [ ] Compare file reads.
- [ ] Compare provider cost.
- [ ] Check task quality/regressions.
- [ ] Adjust only after collecting measurements.

---

# 31. Recommended Initial Files to Implement

For most sizable codebases, start with only:

```text
AGENTS.md
opencode.jsonc

.opencode/
├── agents/
│   ├── explorer.md
│   └── reviewer.md
└── skills/
    ├── targeted-verification/
    │   └── SKILL.md
    └── <one or two genuinely important domain skills>/
        └── SKILL.md

docs/
└── architecture/
    └── INDEX.md

<major-subsystem-1>/AGENTS.md
<major-subsystem-2>/AGENTS.md
```

Do not build an enormous AI configuration framework on day one.

Start small, benchmark, then add Skills/local rules only where agent behavior demonstrates a need.

---

# 32. Recommended Implementation Order for an AI Agent

When handing this plan to a future OpenCode agent, use the following execution sequence.

## Pass 1 — Analysis only

1. Inspect current AI/OpenCode instruction files.
2. Inspect top-level repository layout.
3. Identify major subsystem boundaries.
4. Locate current build/lint/test commands.
5. Locate large generated/dependency directories.
6. Classify current guidance.
7. Propose the exact destination structure.
8. Do not edit code yet.

Deliver:

```text
- Current context sources
- Problems
- Proposed root AGENTS contents
- Proposed nested AGENTS locations
- Proposed Skills
- Proposed config changes
```

## Pass 2 — Context restructuring

Implement:

1. lean root `AGENTS.md`
2. nested `AGENTS.md`
3. architecture index
4. Skills

Do not change application behavior.

## Pass 3 — Agent/config optimization

Implement:

1. explorer/reviewer configuration
2. compaction settings
3. warming policy
4. search/watcher exclusions if appropriate

## Pass 4 — Validation

Run representative sessions or static review against the acceptance criteria.

Fix only issues directly related to the OpenCode context upgrade.

---

# 33. Prompt to Give the Implementation Agent

Use this prompt together with this plan:

```md
Implement the OpenCode context/token optimization plan in this repository.

Read this plan first, but do not broadly scan the repository.

Start by locating:

1. existing OpenCode/AI instruction files
2. top-level subsystem boundaries
3. package manager/workspace configuration
4. build, test, lint, and typecheck commands
5. existing architecture documentation

Then propose the smallest concrete migration for this repository.

Core constraints:

- Minimize always-loaded context.
- Keep root `AGENTS.md` concise.
- Use nested `AGENTS.md` only for persistent subsystem rules.
- Use Skills for infrequent workflows.
- Do not depend on V2 `opencode.jsonc.instructions`.
- Keep automatic compaction enabled.
- Keep session warming disabled for cost optimization.
- Prefer targeted search and validation.
- Do not alter application behavior as part of this migration.
- Do not create large numbers of speculative Skills or instruction files.
- Reuse existing project documentation instead of duplicating it.

Before editing, state:

1. files you intend to create/change
2. information that will move out of global context
3. why each nested `AGENTS.md` or Skill is justified

After implementation, report:

1. resulting context architecture
2. estimated always-loaded context reduction
3. lazy-loaded knowledge introduced
4. validation performed
5. any recommendations that should wait for real token measurements
```

---

# 34. Do Not Do These Things

Avoid these common "optimizations":

## Do not preload every documentation file

This defeats on-demand retrieval.

## Do not create a giant root `AGENTS.md`

It becomes permanent model context.

## Do not put an `AGENTS.md` in every directory

Nested instruction discovery itself can accumulate context as the session enters directories.

Create them only for meaningful policy boundaries.

## Do not convert every README into a Skill

Skills should represent actionable specialized workflows.

## Do not aggressively lower compaction retention immediately

Compaction is lossy. Measure first.

## Do not enable warming under the assumption that caching is automatically cheaper

Warming makes real model calls.

Measure provider-specific economics.

## Do not use subagents for every trivial action

Child sessions still consume tokens.

Use them when context isolation or cheaper model routing outweighs the extra request.

## Do not make an agent "understand the whole repository" before working

Require sufficient context, not exhaustive context.

## Do not optimize token count at the expense of correctness

The goal is:

```text
minimum sufficient context
```

not:

```text
minimum possible context
```

---

# 35. Final Target State

After this upgrade, a normal local task should behave roughly like:

```text
Start session
  │
  ├─ Load small root AGENTS.md
  │
  ▼
Receive scoped task
  │
  ▼
Search target feature/symbol
  │
  ▼
Enter owning package
  │
  ├─ Discover local AGENTS.md if present
  │
  ▼
Read only relevant implementation + tests
  │
  ├─ Load specialist Skill only if task requires one
  │
  ▼
Implement minimal change
  │
  ▼
Run focused verification
  │
  ▼
Finish session
```

A complex task should expand context incrementally:

```text
small global context
      │
      ▼
subsystem context
      │
      ▼
specific source files
      │
      ▼
specific Skill/reference
      │
      ▼
additional subsystem only if evidence requires it
```

This should replace the expensive pattern:

```text
large global instructions
+ entire architecture docs
+ broad repository scans
+ huge command logs
+ unrelated conversation history
+ expensive model for every exploratory step
```

---

# 36. Definition of Done

The upgrade is complete when the repository has a deliberate **context hierarchy**:

```text
Layer 1 — Root AGENTS.md
small, universal, always useful

Layer 2 — Nested AGENTS.md
persistent subsystem rules, discovered when entering the subsystem

Layer 3 — Skill metadata
cheaply advertised specialist capabilities

Layer 4 — SKILL.md
loaded only when the workflow is required

Layer 5 — Skill references / architecture docs
loaded only for concrete unanswered questions

Layer 6 — Source code and tests
retrieved incrementally through targeted search
```

And future agent sessions follow the operating principle:

> **Search narrowly, load progressively, isolate exploration, verify locally, compact long histories, and start fresh when the engineering objective changes.**

---

## OpenCode V2 References

The implementation details in this plan were checked against current OpenCode V2 documentation on:

- Instructions and nested `AGENTS.md`: https://opencode.ai/v2/docs/instructions
- Skills and lazy runtime loading: https://opencode.ai/v2/docs/skills
- Agents/subagents and child-session context: https://opencode.ai/v2/docs/agents
- Compaction: https://opencode.ai/v2/docs/compaction
- Session warming and cost behavior: https://opencode.ai/v2/docs/warming
- Configuration: https://opencode.ai/v2/docs/config

> Re-check these pages when performing the migration if OpenCode has been upgraded since this plan was generated, because V2 behavior is still evolving.
