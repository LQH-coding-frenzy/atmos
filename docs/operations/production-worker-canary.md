# Production Worker Canary

`Release Edge Runtime` is the normal production workflow for the queue-free Worker and Supabase API. It deploys an immutable backend candidate, holds its Worker at zero percent for exact smoke verification, then promotes the same version from protected `main`. Retain immutable Worker and Supabase function versions for rollback.

> Queue-specific instructions are historical release evidence. The CV retirement workflow removes that
> runtime; do not recreate it unless the owner explicitly reopens the production profile.

## Preconditions

- Confirm Cloudflare Workers and Analytics Engine remain within Free allowances.
- Confirm the production Supabase project is healthy and the migration dry-run contains only reviewed, additive migrations.
- Keep database credentials out of command arguments, logs, evidence, and the repository.
- Stop before any destructive migration, paid-resource change, custom route, or candidate traffic assignment not explicitly approved for the active task.

REL-005 is an owner-approved exception for the existing `api.rainify.dpdns.org` host and its request-header affinity rule. The owner separately authorized a bounded sequence of protected 90/10 affinity-verification attempts with automatic restoration to the captured stable Worker at 100 percent. It does not authorize an ongoing rollout, any later percentage split beyond the approved attempts, or a new hostname.

## Expand production schema

Use the production database password through the process environment or an interactive prompt, never a command argument:

```bash
corepack pnpm exec supabase migration list --project-ref oxgwprvkotfvyacpqayx
corepack pnpm exec supabase db push --project-ref oxgwprvkotfvyacpqayx --dry-run
corepack pnpm exec supabase db push --project-ref oxgwprvkotfvyacpqayx
corepack pnpm exec supabase migration list --project-ref oxgwprvkotfvyacpqayx
```

Do not apply a contract migration. Additive schema remains in place during rollback and is forward-fixed if a later issue is found.

## Deploy backend releases

Deploy canonical `api-v1` as the first stable backend and generate an immutable candidate from the exact protected release:

```bash
corepack pnpm exec supabase functions deploy api-v1 --project-ref oxgwprvkotfvyacpqayx --no-verify-jwt
corepack pnpm release:supabase:stage
corepack pnpm exec supabase functions deploy api-<release-id> --project-ref oxgwprvkotfvyacpqayx --no-verify-jwt
```

Set `CORS_ORIGIN` in the production Supabase secret store. Supply the candidate function URL to its Worker version through an ephemeral secrets file, with stable referencing `api-v1` and candidate referencing `api-<release-id>`. Delete the local secrets file immediately after the upload.

Require exact `/health` and `/version` responses from both function URLs before the Worker deployment.

## Bootstrap stable

For a Worker that does not yet exist, `wrangler versions upload` cannot create its first version. Run `wrangler deploy --env=""` from the previous protected `main` release with the stable secrets file; this creates the Worker, deploys stable at 100 percent, and configures its Worker triggers. For an existing Worker, use version upload followed by an explicit 100-percent deployment instead.

Require ordinary requests to the production `workers.dev` route to return the stable release and pass bounded weather and authorization smoke.

## REL-005 Browser Version Affinity

- Production browser API requests use `https://api.rainify.dpdns.org`; the initial server-rendered request and release smoke remain on `workers.dev`.
- The Vercel client stores a random UUIDv4 in tab-scoped `sessionStorage` under `atmos_version_key` and sends the same value as `X-Atmos-Version-Key` and `Cloudflare-Workers-Version-Key`. It is routing state only, not authentication.
- The zone `http_request_late_transform` rule keeps mapping the custom header on the API hostname; the Worker CORS policy allows both headers only from the configured frontend origin.
- The protected `REL-005 affinity verification` workflow requires the exact `RUN_REL005_AFFINITY_TEST` confirmation on `main`, serializes against other production Worker releases/rollbacks, smoke-tests a zero-percent candidate, and temporarily assigns stable 90 percent / candidate 10 percent.
- Its bounded `/version` probe uses random UUIDv4 keys, repeats each key, and requires at least 30 requests per release to remain on one release. When the GitHub runner cannot reach the custom API host, the workflow opens a four-minute window for the owner-local probe command in its summary. All four fresh Grafana synthetics run while the split is active. The Production job then restores the originally captured stable Worker at 100 percent after success or failure and verifies the final inventory and production smoke; a read-only Staging job evaluates WAE samples afterward using the existing Staging-scoped analytics token. Either gate may fail, but the stable Worker is already restored.
- The earlier bounded verification attempts were owner-approved exceptions, not an ongoing canary. The owner also approved one post-fix 90/10 verification after the direct-header fallback deployment; any subsequent traffic shift requires a separate owner decision and protected release confirmation.

If the first deployment fails, no prior production route exists to restore. Correct the inactive version or delete the new Worker only after confirming it never received ordinary traffic.

## Hold and smoke candidate

Upload the current protected release with the immutable candidate function URL. Create a two-version deployment using explicit version IDs:

```bash
corepack pnpm --filter @atmos/gateway exec wrangler versions deploy \
  <stable-version-id>@100 \
  <candidate-version-id>@0 \
  --message "REL-003 <release-id> zero-percent candidate" \
  --yes
```

Ordinary `/version` requests must continue returning the stable. Target the candidate through the production route with the structured override header:

```text
Cloudflare-Workers-Version-Overrides: atmos-gateway="<candidate-version-id>"
```

Require candidate `/health`, `/version`, weather, and unauthenticated protected-route smoke to pass. The override applies only while the candidate is part of the current deployment.

## Rollback

If candidate smoke fails, deploy the stable version alone at 100 percent. Keep both Supabase functions and the additive schema. REL-007 owns function and version cleanup after the rollback window.

## CV Showcase Promotion Boundary

The CV showcase does not claim an ongoing percentage-based canary because organic traffic is insufficient for reliable rollout analysis. The separately approved REL-005 diagnostic uses bounded controlled `/version` requests to meet the WAE sample floor, runs the same synthetic gate, then restores stable to 100 percent.

Progressive 10/25/50/100 promotion remains future production-hardening. Do not treat the standalone `WAE release gate` workflow as authorization for another traffic change; only the separately approved one-time REL-005 test uses it here.

After promotion, preserve the previous Worker and Edge Function releases. REL-007 owns cleanup only after a separate rollback-window decision.
