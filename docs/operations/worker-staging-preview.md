# Worker staging preview

Use Cloudflare version previews to test the exact merged Worker bundle without changing active staging or production traffic.

## Upload

Start from a protected `main` commit with a clean owned diff:

```bash
release="$(git rev-parse --short=12 HEAD)"
corepack pnpm --filter @atmos/gateway exec wrangler versions upload \
  --env staging \
  --preview-alias "preview-${release}" \
  --tag "${release}" \
  --message "PREVIEW-002 ${release}" \
  --strict
```

Record the immutable Worker version ID and generated preview URL. Uploading a version must not create or modify a traffic deployment.

## Smoke

Use only bounded, non-sensitive requests against the exact generated preview URL:

```text
GET /health                                      -> 200
GET /version                                     -> 200 and expected release ID
GET /api/v1/weather/dashboard?...                -> 200
POST /internal/notifications/publish             -> 401 without internal credentials
GET /api/v1/profiles/me                           -> 401 without user credentials
```

Cloudflare preview URLs do not provide normal Worker logs. Reproduce failures locally or against isolated staging and preserve only sanitized status/output evidence.

## Rollback

Preview upload does not affect active traffic. If validation fails, delete the inactive version and its alias; do not deploy it. Retain the current staging deployment throughout the smoke.
