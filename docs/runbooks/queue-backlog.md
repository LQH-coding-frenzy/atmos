# Queue Backlog

## Summary

Use this runbook when `atmos-notifications` grows, message age rises, or durable deliveries remain pending/retry without corresponding claims.

## User impact

Weather-alert notifications are delayed even though rules and durable delivery records may have been created successfully.

## Detection

Compare Cloudflare queue backlog/age with `notification_deliveries` status and the consumer's sanitized claim outcomes. A queue metric alone is not the durable source of truth.

## Relevant dashboards/logs

Use Cloudflare Queue metrics, notification-consumer logs, Supabase function/database logs, and `docs/operations/notification-queue-dlq.md`.

## Immediate mitigation

Stop nonessential publishers if backlog continues growing. Verify the production queue has exactly the intended producer and consumer before changing retry or concurrency settings.

## Diagnosis

Check consumer trigger state, claim endpoint reachability, internal-secret configuration presence, provider failures, retry counts, and durable delivery timestamps.

## Recovery

Restore the existing consumer or claim path through a protected release. Let normal retries drain the queue while monitoring durable statuses and duplicate-safe claims.

## Rollback

Restore the previous consumer Worker/configuration. Do not purge or bulk replay messages until each durable delivery reference is understood.

## Security considerations

Queue payloads must remain compact references. Never log notification destinations, internal secrets, JWTs, or full user/weather payloads.

## Escalation

Escalate for unknown producers/consumers, sustained growth after recovery, quota exhaustion, data mismatch, or a proposed purge.

## Evidence to preserve

Preserve backlog/age snapshots, queue and deployment names, consumer version, sanitized logs, delivery-status counts, and drain timing.

## Post-incident follow-up

Adjust capacity/retry settings only from measured evidence and add a backlog alert when an approved notification receiver exists.
