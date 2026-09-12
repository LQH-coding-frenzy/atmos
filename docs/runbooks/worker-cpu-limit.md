# Worker CPU Limit

## Summary

Use this runbook for Cloudflare 1102 failures or measured Worker p95 CPU above Atmos's 7 ms safety threshold.

## User impact

Affected edge requests may terminate, return 5xx, or become intermittently unavailable under load.

## Detection

Confirm 1102 events or query `workersInvocationsAdaptive` for `cpuTimeP95`; wall-clock WAE duration and Worker Tail are not CPU-percentile evidence.

## Relevant dashboards/logs

Use Cloudflare native invocation analytics/logs and `docs/operations/cloudflare-worker-diagnostics.md`. Filter exact script, version, and bounded UTC interval.

## Immediate mitigation

Stop rollout and restore the known-good Worker version if the regression is release-correlated. Reduce incoming test load rather than increasing paid limits.

## Diagnosis

Identify the route and version, reproduce with the existing bounded load case, and isolate synchronous parsing, crypto, loops, or aggregation from network wait time.

## Recovery

Move CPU-heavy work to a Supabase Edge Function or approved scale-to-zero Azure job/service, then remeasure p50/p95/p99 before promotion.

## Rollback

Deploy the retained stable Worker alone at 100 percent and leave compatible backend/schema resources intact.

## Security considerations

Do not remove validation, authentication, abuse controls, or bounded telemetry to save CPU. Avoid payload capture while profiling.

## Escalation

Escalate on any p95 above 7 ms, repeated 1102 after rollback, inability to identify the route, or proposed paid-plan change.

## Evidence to preserve

Preserve GraphQL query shape, counts, p50/p95/p99, 1102 samples, exact version/release, load parameters, and rollback result.

## Post-incident follow-up

Add a regression budget test and update runtime placement documentation when compute moves off the Worker.
