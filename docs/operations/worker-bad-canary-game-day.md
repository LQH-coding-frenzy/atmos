# Worker Bad Canary Game Day

GAME-002 proves that real production per-version telemetry detects a controlled candidate failure and that the protected rollback restores stable-only traffic. The only fault switch is a deployment binding; requests cannot activate it.

## Safety Boundaries

- Use protected `main` and current known-good stable release `a794b540e4dc`.
- Hold the candidate at zero percent while validating identity and generating override-only samples.
- Do not exceed 10 percent ordinary candidate traffic.
- Create or rotate no secret. `wrangler versions upload --keep-vars` preserves existing remote bindings.
- Change no database schema, RLS policy, queue trigger, custom route, or frontend deployment.
- Stop immediately if stable health, rollback-target smoke, provider inventory, or Worker CPU safety is uncertain.

## Candidate Preparation

From the exact protected commit, generate and deploy its release-mapped Supabase function, then upload a Worker version with the controlled fault binding:

```bash
release_id="$(corepack pnpm --silent release:id)"
corepack pnpm --silent release:supabase:stage
corepack pnpm exec supabase functions deploy "api-$release_id" --project-ref oxgwprvkotfvyacpqayx --no-verify-jwt
corepack pnpm --filter @atmos/gateway exec wrangler versions upload --env="" --keep-vars --strict --tag "$release_id" --message "GAME-002 controlled weather failure" --var "RELEASE_ID:$release_id" --var "GAME_DAY_FAILURE_MODE:weather-503"
```

Create a stable-100/candidate-0 deployment. Ordinary `/version` and weather must remain stable. With `Cloudflare-Workers-Version-Overrides` targeting the candidate, require candidate `/health` HTTP 200, exact `/version`, weather HTTP 503 with only `WEATHER_UNAVAILABLE`, and unauthenticated `/api/v1/me` HTTP 401.

## Detection And Rollback

At zero percent, generate at least 30 bounded weather samples for each exact version through version overrides. Candidate requests must return 503 and stable requests 200. Wait only for WAE ingestion, then:

1. Deploy stable at 90 percent and candidate at 10 percent.
2. Dispatch `WAE release gate` from protected `main` against `atmos_worker_requests` with exact identities and a minimum of 30 samples.
3. Require a deterministic `FAIL` caused by candidate error rate, not an infrastructure or credential error.
4. Dispatch `Worker production rollback` with current stable as the target, controlled candidate as failed, `mode=execute`, and `confirmation=ROLLBACK`.
5. Require a new stable-only 100-percent deployment and successful health, version, weather, and authorization smoke.
6. Confirm Grafana synthetics and production dependency health recover.

The rollback workflow must use Cloudflare's `wrangler rollback` command. A one-version `versions deploy` is not equivalent when a candidate changed versioned secrets; Cloudflare rejects that request with code `10220` instead of restoring the target's prior bindings.

Retain the failed Worker version and its mapped Supabase function through DOC-002 incident review. The completion PR removes the source fault hook so future normal releases cannot accidentally enable it.

## Evidence

Record protected Git SHA, release and Worker IDs, deployment IDs and percentages, controlled sample counts, WAE decision/metrics, rollback workflow run, final inventory, stable smoke, synthetic recovery, and elapsed exposure/restore times. Do not record tokens, cookies, JWTs, user payloads, or provider response bodies.
