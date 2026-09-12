# Weather Provider Outage

## Summary

Use this runbook when Open-Meteo is unavailable, malformed, or too slow for the public weather route.

## User impact

Users may receive a bounded stale forecast for up to one hour or the sanitized `WEATHER_UNAVAILABLE` response when no stale entry exists.

## Detection

Confirm failure of `Atmos production weather`, provider-related sanitized Worker events, rising provider duration/errors, or repeated `x-cache: STALE` responses.

## Relevant dashboards/logs

Use the Grafana weather synthetic, Cloudflare logs, WAE provider/cache fields, and `docs/evidence/game-001/2026-09-07.md` for the tested failure behavior.

## Immediate mitigation

Do not purge usable stale cache. Stop releases and verify `/health` plus `/health/dependencies` to prove the edge and database are independently healthy.

## Diagnosis

Reproduce one bounded weather request, record `x-request-id` and `x-cache`, and distinguish DNS/TLS/rate-limit/provider failures from cache or Worker defects.

## Recovery

After provider recovery, require a successful weather request with `provider: open-meteo`, refresh the five-minute cache, and confirm subsequent synthetic success.

## Rollback

If a release caused provider incompatibility, restore the retained Worker. Do not add an unapproved provider or paid plan during the incident.

## Security considerations

Never log raw provider payloads, arbitrary upstream URLs, client coordinates beyond existing bounded telemetry, or provider credentials.

## Escalation

Escalate for an outage beyond the stale-cache hour, changed provider contract/licence, rate-limit enforcement, or need for a new vendor.

## Evidence to preserve

Preserve UTC onset/recovery, request IDs, sanitized error types, cache states, synthetic history, provider status notices, and release IDs.

## Post-incident follow-up

Update recorded contracts and resilience tests; assess a replaceable fallback provider only as a separately approved task.
