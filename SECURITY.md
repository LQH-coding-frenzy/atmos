# Security Policy

## Reporting

Do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting for this repository when available, or contact the repository owner directly.

## Security invariants

- Secrets, database dumps, Terraform state, and backup archives never enter Git.
- Browser code uses only public configuration and Supabase publishable keys.
- User-owned database tables require RLS, explicit grants, and cross-user deny tests.
- Production deployment credentials live only in protected platform stores.
- Production infrastructure, secret rotation, destructive migrations, and paid-resource changes require explicit human approval.
