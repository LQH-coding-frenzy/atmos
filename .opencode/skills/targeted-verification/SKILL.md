---
name: targeted-verification
description: Use when selecting or running validation for an Atmos code change, test failure, or review to minimize unnecessary command output and broad test runs.
---

# Targeted Verification

1. Identify the changed subsystem and its nearest test before running commands.
2. Run the narrowest useful check first: relevant unit test, affected package typecheck/lint, or Worker bundle check.
3. Expand to browser, database, or repository-wide validation only when the change crosses that boundary or the task requires it.
4. For a failure, report the command, failing test name, and relevant stack trace. Do not paste successful verbose logs.
5. Never weaken a test, scanner, or policy merely to pass validation.

Common boundaries:

- `apps/web`: affected UI test, then `corepack pnpm --filter @atmos/web build`.
- `workers/gateway`: Worker test, then `corepack pnpm --filter @atmos/gateway build`.
- `packages/*`: affected package test/typecheck, then direct consumers if a contract changed.
- `supabase`: `corepack pnpm exec supabase db reset`, then `corepack pnpm test:db`.
