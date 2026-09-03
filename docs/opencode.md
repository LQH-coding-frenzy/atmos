# OpenCode Project Setup

Atmos uses project-level OpenCode configuration and does not alter the global setup. The context hierarchy is root `AGENTS.md`, nested subsystem guidance, lazy-loaded skills, and normal on-demand documentation.

## OpenRouter key

Add the key to the ignored `.env` file:

```text
OPENROUTER_API_KEY=<your-key>
```

OpenCode receives this value through the `OPENROUTER_API_KEY` environment variable. If your shell does not load `.env` files automatically, export it before starting OpenCode. On PowerShell:

```powershell
$line = Get-Content .env | Where-Object { $_ -match '^OPENROUTER_API_KEY=' }
$env:OPENROUTER_API_KEY = $line.Split('=', 2)[1]
opencode
```

The read-only `explorer`, `reviewer`, `task-planner`, and `security-reviewer` agents use `openrouter/z-ai/glm-5.2:free`. No installed MCP invokes a model. Context7 provides public documentation, and Playwright is restricted to browser automation.

## Context Efficiency

- Start unfamiliar work with `/investigate <task>` or targeted search.
- Use one coherent engineering objective per session; start a fresh session when the subsystem changes.
- Load a skill only when its workflow matches the task.
- Prefer the narrowest meaningful test and avoid retaining large successful command output.
- Review `docs/architecture/INDEX.md` only when subsystem ownership is unclear.
- Record representative task metrics in `docs/ai-cost/baseline.md` before making further compaction or model-routing changes.

The installed OpenCode schema has no supported session-warming field, so no unsupported setting is added. Automatic compaction and old tool-output pruning remain enabled.

## Restart requirement

Quit and restart OpenCode after editing `opencode.jsonc`, an `.opencode` agent, command, skill, or plugin. OpenCode loads configuration once at startup.
