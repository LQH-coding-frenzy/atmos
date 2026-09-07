# Notification Queue DLQ Runbook

The `atmos-notifications` consumer retries transient delivery-claim failures three times. Cloudflare routes exhausted messages to `atmos-notifications-dlq`.

Operators must inspect the durable `notification_deliveries` record before deciding whether to reprocess, repair, or discard a DLQ message. Do not replay a message until its delivery reference and failure cause are understood.

Creating or binding the remote DLQ requires owner approval and a separate deployment change.
