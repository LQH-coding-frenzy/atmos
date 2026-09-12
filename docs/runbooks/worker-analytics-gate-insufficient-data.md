# Worker Analytics Gate Insufficient Data

## Summary

Use this runbook when the WAE release gate cannot find at least 30 weighted samples for both exact releases in its bounded window.

## User impact

No direct outage is implied, but rollout safety is unproven and candidate traffic must not increase.

## Detection

The protected `WAE release gate` workflow returns `INSUFFICIENT_DATA` for a missing row or a weighted sample count below 30.

## Relevant dashboards/logs

Use the workflow summary, its bounded SQL result, Cloudflare deployment split, WAE dataset `atmos_worker_requests`, and `docs/operations/wae-release-gate.md`.

## Immediate mitigation

Hold the current percentage. Do not reinterpret missing data as `PASS`, extend to an unbounded query, or promote to generate traffic.

## Diagnosis

Verify exact Worker UUIDs, distinct 12-character release IDs, production dataset selection, lookback, deployment split, WAE binding, and `_sample_interval` weighting.

## Recovery

Use bounded candidate-targeted smoke/health requests already allowed by the release plan, identify them as controlled samples, then rerun the protected gate.

## Rollback

If telemetry remains unavailable or synthetic health degrades, restore stable at 100 percent. Otherwise hold without changing the deployment.

## Security considerations

Do not send credentials or user data as sample traffic, expose the analytics token, or use arbitrary routes/payloads to inflate counts.

## Escalation

Escalate for missing production analytics binding, token/entitlement failure, unexplained sample loss, or inability to obtain bounded safe samples.

## Evidence to preserve

Preserve workflow run ID, inputs, SQL/result JSON, weighted counts, deployment split, controlled-sample count, synthetic result, and final decision.

## Post-incident follow-up

Correct telemetry coverage or minimum-window guidance; never lower the sample minimum solely to complete a release.
