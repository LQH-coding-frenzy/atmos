---
name: atmos-task
description: Use when implementing an Atmos Section 29 backlog ID, changing Supabase migrations, Workers, workflows, infrastructure, or release controls.
---

# Atmos Task Workflow

1. Read `AGENTS.md` and the master plan front matter plus Sections 0, 4, 6, 7, 18, 19, 20, 23, 28, and the selected Section 29 row.
2. Confirm every exact dependency is `DONE` in `.agent/status.yaml`.
3. Create or update one task file following Section 30.
4. Implement only that task unless the owner expands scope.
5. Run the listed validation and preserve evidence.
6. Stop for secrets, paid resources, production changes, destructive migrations, weakened RLS, missing rollback, or Worker p95 CPU above 7 ms.
