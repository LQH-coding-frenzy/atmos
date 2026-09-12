# Grafana SLOs

Atmos uses Grafana Cloud's SLO API to turn the production weather synthetic into event-based reliability objectives. The source and destination data source is `grafanacloud-prom`; the stack reports `usesDatasourceRecordingRules: false`, so Grafana-managed recording rules own evaluation.

## Objectives

| SLO                           | Indicator                                                    | Objective                   |
| ----------------------------- | ------------------------------------------------------------ | --------------------------- |
| Public weather availability   | successful synthetic executions / total synthetic executions | at least 99.5% over 28 days |
| Public weather client latency | executions at or below 2.5 seconds / total executions        | at least 95% over 28 days   |

The latency objective is the event-based equivalent of a provider-backed p95 below 2.5 seconds. Synthetic duration includes DNS, TLS, network transit, Worker execution, cache/provider behavior, and response transfer, so it is a client-perceived SLO rather than a server-only latency claim.

The API payload is `docs/operations/atmos-slos.json`. Before applying it, list existing SLOs and reject duplicate names. POST each `slos[]` entry to `/api/plugins/grafana-slo-app/resources/v1/slo` using the existing local `GRAFANA_URL` and `GRAFANA_SERVICE_ACCOUNT_TOKEN`; never print or commit the token.

## Alerts

Each SLO enables Grafana's generated fast-burn and slow-burn alert rules. Grafana currently has no approved Atmos notification receiver or route, so alerts are visible in Grafana but are not sent to an external destination. Creating a contact point requires a separately approved receiver and is not part of SLO-002.

No-data or rule-evaluation errors must not be interpreted as healthy service. Investigate source metric freshness, synthetic state, and Grafana rule health before changing an objective or deleting an alert.

## Rollback

Delete only the two SLO UUIDs recorded in `docs/evidence/slo-002/2026-09-12.md`, then verify their generated recording and burn-rate alert rules disappear. Do not delete the shared Prometheus data source or the four SLO-001 checks.
