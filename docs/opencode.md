# OpenCode Project Setup

Atmos uses the project-level `opencode.jsonc` configuration and does not alter the global OpenCode setup.

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

The read-only `task-planner` and `security-reviewer` agents use `openrouter/minimax/minimax-m3:free`. No installed MCP invokes a model. Context7 provides public documentation, and Playwright is restricted to browser automation.

## Restart requirement

Quit and restart OpenCode after editing `opencode.jsonc`, an `.opencode` agent, command, skill, or plugin. OpenCode loads configuration once at startup.
