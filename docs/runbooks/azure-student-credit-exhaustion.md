# Azure Student Credit Exhaustion

## Summary

Use this runbook when Azure for Students credit is low, exhausted, expired, or requests an upgrade. Atmos currently has no active Azure resources.

## User impact

Future container jobs stop or remain undeployed; the core serverless application must continue without the Azure lane.

## Detection

Use the Azure subscription/credit display and configured budget alerts after `AZ-001`. Before that task is complete, treat credit state as unknown and block Azure provisioning.

## Relevant dashboards/logs

Use Azure Cost Management/student-credit records and job execution inventory. Never infer remaining credit from application traffic or repository configuration.

## Immediate mitigation

Stop new Azure deployments and job runs. Do not upgrade to pay-as-you-go, add a payment method, or create paid replacement resources.

## Diagnosis

Confirm subscription identity, offer status, remaining credit, expiration, and which scale-to-zero jobs consumed credit without exposing billing details in public evidence.

## Recovery

Keep backup/backfill tasks blocked or run approved local alternatives until student credit is restored and a budget alert is verified.

## Rollback

Destroy or scale down only Git/Terraform-owned disposable resources after explicit owner approval; preserve data and remote state.

## Security considerations

Billing and subscription identifiers may be sensitive. Do not share screenshots containing personal data or grant broad Azure roles during recovery.

## Escalation

Owner decision is mandatory for any subscription upgrade, payment method, paid resource, quota exception, or destructive cleanup.

## Evidence to preserve

Preserve redacted offer/status, remaining-credit observation, budget-alert state, affected job IDs, resource inventory, and owner decision.

## Post-incident follow-up

Update the cost ADR and keep the core design operational without Azure; optimize or remove workloads that cannot fit the approved budget.
