# Atmos Repository Instructions

- The canonical product, architecture, and dependency backlog is `docs/architecture/atmos-devsecops-master-plan.md`.
- Before a substantial change, read master-plan Sections 0, 4, 6, 7, 18, 19, 20, 23, 28, and the selected Section 29 task.
- Implement exactly one canonical backlog task at a time. Its dependencies must be `DONE` in `.agent/status.yaml`.
- Never commit secrets, `.env` values, Terraform state, database dumps, backups, JWTs, or provider credentials.
- Do not make remote production mutations, paid-resource changes, secret creation/rotation, destructive migrations, or Terraform applies without explicit user approval.
- Cloudflare Workers remain thin: measured p95 CPU must stay at or below 7 ms. Move heavier work to Supabase Edge Functions or Azure Container Apps Jobs.
- Database schema belongs in `supabase/migrations`; every user-owned table requires RLS and allow/deny tests.
- Use `pnpm` scripts for validation. Do not infer tool commands from the old rough Vite example.
