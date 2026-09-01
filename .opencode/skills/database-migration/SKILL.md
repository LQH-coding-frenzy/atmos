---
name: database-migration
description: Use when changing Supabase migrations, RLS policies, grants, RPCs, indexes, constraints, or persisted data shape.
---

# Database Migration Workflow

1. Read `supabase/AGENTS.md` and locate only migrations and tests relevant to the affected relation or function.
2. State the migration strategy before editing. Use expand/contract when old and new backend versions can overlap.
3. Create a new migration; never rewrite an already-applied migration.
4. Enable RLS, define explicit grants, and add allow plus cross-user deny tests for every user-owned table.
5. Run `corepack pnpm exec supabase db reset` and `corepack pnpm test:db`.
6. Stop and request approval for destructive changes, weakened RLS, secret-key use, or production application.
