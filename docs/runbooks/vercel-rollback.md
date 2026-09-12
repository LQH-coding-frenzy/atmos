# Vercel Rollback

## Summary

Use this runbook when the production frontend fails smoke, security headers, rendering, or critical user flows after promotion.

## User impact

The public dashboard may be unavailable, broken, or incompatible while backend APIs remain independently healthy.

## Detection

Confirm `Atmos production frontend` failure, production-domain smoke failure, browser regression, or Vercel deployment/runtime error.

## Relevant dashboards/logs

Use the Vercel deployment/build/runtime logs, `Vercel production release` workflow, Grafana frontend synthetic, Playwright results, and `docs/operations/vercel-production-release.md`.

## Immediate mitigation

If workflow post-promotion smoke failed, let its captured-deployment rollback complete. Otherwise identify the immediately previous known-good deployment URL.

## Diagnosis

Compare immutable deployment URL versus production domain, source SHA, environment presence, headers, browser console/network failures, and backend compatibility.

## Recovery

Run `vercel rollback <known-good-deployment-url> --yes` with the scoped token through an approved operator context, then verify production HTTP 200, required headers, and smoke flows.

## Rollback

Vercel Hobby rollback is limited to the prior production deployment. The durable recovery is a Git revert followed by the protected prebuilt production workflow.

## Security considerations

Do not expose `VERCEL_TOKEN`, remove CSP/HSTS/frame protections, promote a preview artifact, or rebuild a supposedly immutable deployment during response.

## Escalation

Escalate if no known-good deployment exists, domain alias/TLS fails, environment configuration is lost, or rollback requires token rotation.

## Evidence to preserve

Preserve source SHA, workflow/deployment IDs and URLs, previous/current alias, sanitized logs, smoke/header results, and rollback timestamp.

## Post-incident follow-up

Add a Playwright or response-verification regression and restore service through a new protected prebuilt release.
