# Vercel production release

The manual `Vercel production release` workflow is the only Git-owned production promotion path. Vercel Git integration continues to build pull-request previews but does not auto-deploy `main`.

## Controls

- Dispatch only from protected `main`.
- Use GitHub environment `Production`, restricted to protected branches.
- Build once with pinned Vercel CLI `59.15.1` and deploy `.vercel/output` with `--prebuilt`.
- Upload with `--prod --skip-domain`, then smoke the exact deployment URL before promotion.
- Verify HTTP 200, CSP, HSTS, frame denial, MIME sniffing prevention, referrer policy, and permissions policy.
- Capture the current production deployment before upload.
- If production-domain smoke fails after promotion, automatically roll back to the captured deployment.

`VERCEL_TOKEN` is a 90-day token scoped to the project-owning team because Vercel CLI rejects project-only tokens. It expires December 11, 2026 and must be rotated before then. The GitHub environment contains non-secret `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_SCOPE`, and `PRODUCTION_URL` values.

## Dispatch

```bash
gh workflow run vercel-production.yml --ref main -f promote=true
```

Use `promote=false` to create and smoke an unaliased production artifact without changing the production domain.

## Rollback

The workflow rolls back automatically only when promotion succeeded and the subsequent production-domain smoke failed. For a later incident, use the known-good deployment URL from workflow evidence:

```bash
vercel rollback <known-good-deployment-url> --yes
```

Vercel Hobby rollback is limited. Keep Git revert and a new protected prebuilt release as the durable recovery path.
