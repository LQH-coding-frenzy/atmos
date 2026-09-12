# Notification DLQ

## Summary

Use this runbook when messages reach `atmos-notifications-dlq` after three failed consumer attempts.

## User impact

Specific alert notifications are not delivered; the durable delivery record should retain their state for reconciliation.

## Detection

Confirm DLQ message/operation metrics and match each compact `delivery_id` to `notification_deliveries` before taking action.

## Relevant dashboards/logs

Use Cloudflare DLQ metrics, consumer and protected claim logs, durable delivery rows, `docs/operations/notification-queue-dlq.md`, and `docs/evidence/game-005/2026-09-07.md`.

## Immediate mitigation

Pause manual replay. Identify whether failure is malformed reference, transient dependency, secret mismatch, or permanent delivery/provider rejection.

## Diagnosis

Inspect only reference IDs and sanitized failure metadata. Confirm idempotency state and whether the primary queue is also backlogged.

## Recovery

Repair the underlying path first. Reprocess only through a reviewed, bounded, idempotent procedure after durable state proves replay is eligible.

## Rollback

If a consumer release caused failures, restore the prior Worker. Leave DLQ messages and durable rows intact until recovery is verified.

## Security considerations

Do not download or expose user destinations, purge evidence, edit delivery ownership, or replay arbitrary message bodies.

## Escalation

Owner approval is required before remote replay, discard, or purge. Escalate immediately for sensitive payloads or unknown message sources.

## Evidence to preserve

Preserve DLQ counts/timestamps, compact references, durable statuses, retry history, consumer release, root cause, and approved disposition.

## Post-incident follow-up

Add a regression case, reconcile all affected durable rows, and document replay tooling before enabling routine operator replay.
