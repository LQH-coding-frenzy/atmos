# Threat Model Skeleton

## Assets

- User accounts, saved locations, alerts, notification destinations, and preferences.
- Supabase database, RLS policies, migrations, and secret keys.
- R2 backup archives and recovery identities.
- GitHub workflows, Terraform state, provider tokens, OCI artifacts, and deployment metadata.

## Trust boundaries

```text
browser -> Vercel -> Cloudflare -> Supabase
Cloudflare -> Open-Meteo
Supabase -> Cloudflare Queues
Azure jobs -> Supabase and R2
GitHub/HCP Terraform -> provider control planes
```

## Initial threats and controls

| Threat                    | Control                                       | Verification                | Evidence                   |
| ------------------------- | --------------------------------------------- | --------------------------- | -------------------------- |
| Secret committed          | `.gitignore`, Gitleaks, push protection       | secret scan                 | CI report                  |
| Cross-user data access    | RLS, grants, ownership policies               | pgTAP allow/deny tests      | database CI output         |
| Worker CPU exhaustion     | input bounds and 7 ms p95 gate                | controlled performance test | k6 and Cloudflare evidence |
| Provider outage           | bounded timeout and stale-cache policy        | outage exercise             | game-day report            |
| Malicious workflow change | CODEOWNERS, pinned actions, least permissions | PR review                   | workflow diff and CI       |
