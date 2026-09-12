# Production Worker Canary

REL-003 establishes the first production Worker deployment and proves a release candidate without sending it ordinary traffic. Run every deployment from a protected `main` commit and retain immutable Worker and Supabase function versions for rollback.

## Preconditions

- Confirm Cloudflare Workers, Queues, and Analytics Engine remain within Free allowances.
- Confirm the production Supabase project is healthy and the migration dry-run contains only reviewed, additive migrations.
- Keep database credentials and `INTERNAL_QUEUE_SECRET` out of command arguments, logs, evidence, and the repository.
- Stop before any destructive migration, paid-resource change, custom route, or candidate traffic assignment.

## Isolate staging queues

Create `atmos-notifications-staging` and `atmos-notifications-staging-dlq`, then update only the `staging` environment in `workers/gateway/wrangler.jsonc`. Upload and deploy the protected release to staging at 100 percent before assigning the original queues to production.

Require staging `/health`, `/version`, weather, and unauthenticated protected-route smoke to pass. Confirm `atmos-notifications` has no staging consumer before continuing.

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

Set `CORS_ORIGIN` and one generated `INTERNAL_QUEUE_SECRET` in the production Supabase secret store. Supply that same internal secret to both Worker versions through an ephemeral secrets file, with stable referencing `api-v1` and candidate referencing `api-<release-id>`. Delete the local secrets file immediately after both uploads.

Require exact `/health` and `/version` responses from both function URLs before the Worker deployment.

## Bootstrap stable

Upload the previous protected `main` release as the stable Worker version, then deploy only that version at 100 percent. Require ordinary requests to the production `workers.dev` route to return the stable release and pass bounded weather and authorization smoke.

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
