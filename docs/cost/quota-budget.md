# Quota Budget

Atmos targets zero recurring out-of-pocket cost while within free-tier quotas. Provider entitlements must be revalidated before provisioning.

| Platform                |                                  Quota |            Internal warning |
| ----------------------- | -------------------------------------: | --------------------------: |
| Cloudflare Workers      |                   100,000 requests/day |                         70% |
| Worker CPU              |                       10 ms/invocation |                    p95 7 ms |
| Cloudflare Queues       |                  10,000 operations/day |                         70% |
| Cloudflare R2           |          10 GB and included operations |                         70% |
| Supabase database       |                         500 MB/project |                         70% |
| Supabase Edge Functions |              500,000 invocations/month |                         70% |
| Vercel Hobby            |                     provider allowance |                         70% |
| Azure for Students      |        remaining credit and ACA grants | 70%; stop before exhaustion |
| HCP Terraform           |                  500 managed resources |                         70% |
| Grafana Cloud           | free telemetry and synthetic allowance |                         70% |
| Open-Meteo              |        600/min, 5,000/hour, 10,000/day |                         70% |

No task may silently upgrade a paid plan. Azure credit exhaustion blocks Azure work; it never authorizes pay-as-you-go.
