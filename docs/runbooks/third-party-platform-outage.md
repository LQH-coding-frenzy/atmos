# Third-Party Platform Outage

## Summary

Use this runbook for a confirmed outage affecting Cloudflare, Supabase, Vercel, Grafana, Open-Meteo, GitHub, or another approved Atmos platform.

## User impact

Impact depends on the provider: frontend, API, weather, database/auth, deployment, notifications, or monitoring may be unavailable or degraded.

## Detection

Correlate Atmos synthetics/health/logs with the provider's official status source. Do not attribute an incident solely from one missing dashboard.

## Relevant dashboards/logs

Use Grafana synthetics/SLOs, platform-native logs/status pages, WAE, release/workflow history, and the component-specific runbook in this directory.

## Immediate mitigation

Stop releases that depend on the provider, preserve functioning cache/degraded paths, and avoid repeated retries or control-plane changes that increase impact.

## Diagnosis

Identify provider, region/service, onset, affected Atmos paths, last known-good release, independent health checks, quota/account state, and any local regression.

## Recovery

Wait for or validate provider recovery, then restore only Git-owned configuration if needed and run component health, synthetic, security, and data-integrity checks.

## Rollback

Roll back Atmos only when evidence ties impact to a release. A provider outage is not justification for destructive failover or an unapproved replacement vendor.

## Security considerations

Ignore unsolicited support contacts, never share credentials/log payloads, verify status communications, and treat unexpected access prompts as possible phishing.

## Escalation

Escalate for prolonged SLO burn, data integrity/exposure, account suspension, paid-tier or new-vendor proposal, missing recovery path, or conflicting provider reports.

## Evidence to preserve

Preserve UTC timeline, official status references, affected checks/routes, release IDs, sanitized logs, mitigation decisions, recovery checks, and user communications.

## Post-incident follow-up

Record error-budget impact and accepted lock-in, improve graceful degradation/tests, and evaluate provider diversification only through a separate approved decision.
