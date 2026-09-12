# Supabase Dependency Synthetic Failure

Use this runbook when `Atmos candidate dependencies` reports a non-200 response, a coarse `degraded` state, a timeout, or no data.

## Contain

1. Hold the production Worker candidate at its current percentage. For SLO-001 that percentage is zero; never promote on missing data.
2. Confirm the frontend, edge `/health`, and public weather checks separately. Do not infer a total edge outage from the dependency check alone.
3. Retry the candidate dependency request once with the exact documented Cloudflare version override. Do not loop or generate artificial keep-alive traffic.

## Diagnose

1. Confirm the candidate Worker still references the intended immutable Supabase function URL and release ID.
2. Check the Supabase project and Edge Function status in the provider console without exposing environment values or response diagnostics in evidence.
3. Determine whether the project is paused, the Edge Function is unavailable, the default `SUPABASE_SECRET_KEYS` entry is missing, or PostgREST/Postgres is degraded.
4. Review only sanitized Worker request analytics and Grafana timings. Do not log or copy API keys, database URLs, row data, cookies, or JWTs.

## Recover

1. If the Free project is paused, use the provider-supported restore action only with owner approval and keep the candidate held while restoration completes.
2. If configuration drift is present, restore the expected hosted default secret-key environment or redeploy the exact protected Edge Function release. Secret creation or rotation requires explicit approval.
3. If the candidate implementation is faulty, remove it from the deployment and retain stable at 100 percent. Do not delete the stable Worker or any referenced Edge Function.
4. Require a fresh successful direct candidate smoke and a successful scheduled Grafana execution before returning the release gate to consideration.

Record timestamps, coarse provider state, immutable release/version IDs, actions, and final check state. Do not claim enterprise availability or an SLA for the Free-tier environment.
