# Production Worker Canary

`Release Edge Runtime` is the normal production workflow for the queue-free Worker and Supabase API. It deploys an immutable backend candidate, holds its Worker at zero percent for exact smoke verification, then promotes the same version from protected `main`. Retain immutable Worker and Supabase function versions for rollback.

> Queue-specific instructions are historical release evidence. The CV retirement workflow removes that
> runtime; do not recreate it unless the owner explicitly reopens the production profile.

## Preconditions

- Confirm Cloudflare Workers and Analytics Engine remain within Free allowances.
- Confirm the production Supabase project is healthy and the migration dry-run contains only reviewed, additive migrations.
- Keep database credentials out of command arguments, logs, evidence, and the repository.
- Stop before any destructive migration, paid-resource change, custom route, or candidate traffic assignment.

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

The CV showcase uses the protected zero-percent candidate and exact smoke workflow. It does not claim an active percentage-based canary because its low organic traffic cannot reliably satisfy the WAE sampling threshold.

Percentage-based 10/25/50/100 promotion, WAE sampling, and Grafana synthetic gates remain future production-hardening controls. Do not represent the standalone `WAE release gate` workflow as an active release dependency until an owner adopts that operating profile.

After promotion, preserve the previous Worker and Edge Function releases. REL-007 owns cleanup only after a separate rollback-window decision.
