# Atmos Incident Runbooks

These runbooks are the operator entry points required by the Atmos master plan. Start an incident record before changing production, use UTC timestamps, and preserve immutable release/version IDs. Never paste credentials, cookies, JWTs, database URLs, raw user data, or provider response bodies into evidence.

## Current operational boundary

The Vercel frontend, Cloudflare Worker, production Supabase project, Grafana synthetics/SLOs, and Workers Analytics Engine are active. Notification queues, alert delivery, and Azure container-platform resources are retired from the CV showcase; R2 backup evidence and restore automation remain on-demand rather than continuously operated. External Grafana notification routing is inactive.

## Shared production references

- Frontend: `https://rainify.dpdns.org/`
- Worker: `https://api.rainify.dpdns.org`
- Grafana synthetic dashboard: `/d/atmos-synthetics/atmos-synthetic-monitoring`
- Availability SLO: `/d/grafana_slo_app-jcmsyyihfk6uhgi19d5m7`
- Client-latency SLO: `/d/grafana_slo_app-evgiwsqi2ipq6tgr2p4nm`
- WAE dataset: `atmos_worker_requests`

Use provider dashboards only for diagnosis or an explicitly documented emergency action. Git-owned workflows, migrations, and versioned deployments remain the normal recovery path.
