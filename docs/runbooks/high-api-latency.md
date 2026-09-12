# High API Latency

## Summary

Use this runbook when client-perceived weather latency breaches the 95 percent under-2.5-second SLO.

## User impact

Dashboard loads are delayed or time out even if requests eventually return HTTP 200.

## Detection

Confirm the Grafana client-latency burn alert and inspect `probe_all_duration_seconds` for `Atmos production weather`. Validate sample freshness.

## Relevant dashboards/logs

Use the latency SLO and synthetic dashboards, WAE `double1` wall duration, provider duration, cache status, Cloudflare native metrics, and Worker logs for the same UTC interval.

## Immediate mitigation

Hold releases. Roll back a correlated candidate; otherwise preserve cache availability and reduce only optional work through a reviewed code release.

## Diagnosis

Compare cache `HIT`, `MISS`, and `STALE`, provider duration, Worker wall time, Supabase health, and frontend timing. Distinguish network/client latency from Worker CPU.

## Recovery

Restore the slow dependency or deploy the smallest protected fix. Require fresh weather synthetic samples below 2.5 seconds and healthy recording rules before closure.

## Rollback

Use the retained Worker version or known-good Vercel deployment. Do not weaken the SLO threshold to make an incident disappear.

## Security considerations

Do not bypass Turnstile, authentication, RLS, TLS, or input validation for latency. Keep query strings and user data out of telemetry evidence.

## Escalation

Escalate if Worker p95 CPU exceeds 7 ms, provider latency is sustained, rollback cannot restore service, or the error budget continues burning.

## Evidence to preserve

Preserve SLO window, synthetic durations, WAE query/result, cache split, provider duration, release IDs, and recovery validation.

## Post-incident follow-up

Add a measured regression test or cache/provider improvement and record any justified SLO or alert tuning separately.
