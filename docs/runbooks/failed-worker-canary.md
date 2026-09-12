# Failed Worker Canary

## Summary

Use this runbook when candidate smoke, WAE analysis, or a required synthetic returns `FAIL` during a Worker rollout.

## User impact

At zero percent ordinary users are unaffected; at 10/25/50 percent a bounded share may receive candidate errors or latency.

## Detection

Treat failed candidate smoke, WAE `FAIL`, fresh synthetic failure, or deployment-inventory mismatch as immediate rollback conditions.

## Relevant dashboards/logs

Use the GitHub WAE gate run, Grafana synthetics/SLOs, Cloudflare deployment inventory and logs, and `docs/operations/production-worker-canary.md`.

## Immediate mitigation

Stop progression and deploy the retained stable Worker version alone at 100 percent. Verify the resulting deployment inventory before more testing.

## Diagnosis

Compare exact stable/candidate Worker UUIDs and release IDs, WAE errors/p95, route/cache/provider fields, candidate override smoke, and Supabase function health.

## Recovery

Require stable `/health`, `/version`, weather, authorization, WAE, and fresh synthetic checks. Fix the candidate in a new protected release rather than mutating an immutable version.

## Rollback

Run `corepack pnpm --filter @atmos/gateway exec wrangler versions deploy <stable-version-id>@100 --message "incident rollback to stable" --yes`. Keep candidate/stable functions and additive schema for analysis.

## Security considerations

Do not bypass production approval, scanners, RLS, or smoke assertions. Version overrides are non-secret IDs, but credentials and request payloads remain excluded.

## Escalation

Escalate if stable-only deployment fails, ordinary traffic still reaches candidate, database compatibility is uncertain, or rollback impairs security.

## Evidence to preserve

Preserve deployment IDs/splits, Worker/function/release IDs, gate run and result JSON, synthetics, request IDs, rollback command outcome, and stable verification.

## Post-incident follow-up

Run a blameless review, add the missing regression/gate, and do not delete releases until REL-007 reference checks permit cleanup.
