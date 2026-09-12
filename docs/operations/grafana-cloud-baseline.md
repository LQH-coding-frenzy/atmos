# Grafana Cloud Baseline

Atmos uses one Grafana Cloud Free stack for central dashboards, SLOs, external synthetics, and telemetry from runtimes that support OTLP. Cloudflare Workers Free remains on native logs/traces plus Workers Analytics Engine rather than pretending to export unsupported edge telemetry.

## Stack

- Organization and stack slug: `stouttortoise1569`
- Stack ID: `1827502`
- URL: `https://stouttortoise1569.grafana.net`
- Region: AWS Singapore (`prod-ap-southeast-1`)
- Deletion protection: enabled
- Repository folder: `Atmos` (UID `fbdzpj`)

The generated slug is provider-assigned identity and is not renamed during the release path. Do not create another stack to improve naming.

## Cost Guardrail

Cloud Free is the current plan. It requires no card and caps usage at Free limits. A temporary unlimited onboarding trial ends September 26, 2026; it is not authorization to select Cloud Pro or add a payment method.

Current Free limits relevant to Atmos include 10,000 active metric series, 50 GB/month each for logs and traces, 14-day core telemetry retention, 100,000 API synthetic executions/month, and 10,000 browser synthetic executions/month. The internal warning threshold is 70 percent of each allowance.

SLO-001 plans four bounded API checks from one public probe every 15 minutes. Assuming each check finishes within one minute, a 30-day month projects to `4 * 4 * 24 * 30 = 11,520` executions, or 11.52 percent of the API allowance. Even a conservative two-minute execution assumption is 23,040 executions, or 23.04 percent. Recalculate before changing duration, check count, probe count, or frequency.

## Access Boundary

OBS-002 creates no access policy, service account, or token. Each dependent task must create only the credential it needs, store it in the relevant protected provider environment, and document rotation without exposing values. Personal browser sessions are not deployment credentials.

Stack deletion protection stays enabled. Do not add a payment method, select Pro, or increase usage after a quota warning without explicit owner approval.

Recheck the displayed plan and usage caps after the onboarding trial ends on September 26, 2026 and before any later task assumes the permanent Free state.
