---
document: Atmos DevSecOps Master Plan
version: 2.0.2
status: implementation-ready-final-validated
last_updated: 2026-08-31
validation:
  last_validated: 2026-08-31
  result: GO
  blocking_issues: 0
  devsecops_blockers: 0
  accepted_platform_constraints: 4
  note: architecture is implementation-ready; provider quotas and account entitlements remain time-sensitive and must pass Section 0.6 before remote mutation
project_type: full-stack serverless-first weather intelligence platform
architecture_style: modern hybrid; edge-first; managed data; scale-to-zero containers
primary_language: TypeScript
monorepo: true
frontend: Next.js + TypeScript on Vercel Hobby
edge_gateway: Cloudflare Workers Free + Hono
backend_compute: Supabase Edge Functions + Hono
primary_database: Supabase PostgreSQL
identity: Supabase Auth + PostgreSQL Row Level Security
async_messaging: Cloudflare Queues Free
scheduler: Supabase Cron; Azure Container Apps Jobs for heavy schedules
object_storage: Cloudflare R2 Standard
container_runtime: Azure Container Apps Consumption + Azure Container Apps Jobs
student_cloud: Azure for Students
container_registry: GitHub Container Registry (GHCR), public image by default
ci_cd: GitHub Actions + platform-native immutable deployments
progressive_delivery: Cloudflare Workers gradual deployments; Azure Container Apps revisions
infrastructure_as_code: Terraform + HCP Terraform Free
observability: Grafana Cloud Free + Cloudflare Workers Analytics Engine + platform-native telemetry + OpenTelemetry where supported
security: Turnstile + RLS + OIDC federation + Gitleaks + CodeQL/Semgrep + Trivy + SBOM + Cosign; GitHub attestations when repository visibility/plan supports them
primary_weather_provider: Open-Meteo
optional_weather_provider: OpenWeather or replaceable provider adapter
intended_consumers:
  - human developers
  - DevOps/SRE engineers
  - security reviewers
  - interviewers
  - AI coding agents
  - AI planning agents
  - CI/CD automation
source_of_truth:
  code_and_platform_configuration: Git monorepo
  database_schema: versioned Supabase SQL migrations
  infrastructure_state: HCP Terraform remote state
  durable_application_state: Supabase PostgreSQL
  large_objects_and_backups: Cloudflare R2
  secrets: platform secret stores / HCP sensitive variables; never Git
---

# Atmos — Serverless-First Full-Stack + DevSecOps Master Implementation Plan

> **Purpose:** Build a production-style weather intelligence platform that is inexpensive enough to keep online as a student portfolio, while still demonstrating substantive modern DevOps, DevSecOps, SRE, cloud, edge, database, asynchronous-processing, container, infrastructure-as-code, and release-engineering skills.
>
> This version deliberately replaces the always-on GKE/Cloud SQL/Memorystore/Argo architecture from v1 with a **serverless-first hybrid**. The objective is not to remove engineering rigor. The objective is to keep the rigor while paying for work rather than idle servers.
>
> This document is written for both humans and automation. Major components have stable IDs, dependencies, failure modes, acceptance criteria, evidence requirements, rollback expectations, and agent-safe boundaries.

---

# 0. How to use this document

## 0.1 Human workflow

1. Read Sections 1–7 before provisioning anything.
2. Follow the dependency order in Section 28.
3. Implement one backlog item at a time from Section 29.
4. Do not skip security, telemetry, rollback, or evidence because a feature “works.”
5. Re-check free-tier and student-plan quotas before provisioning; the values in this document are a research snapshot, not a permanent contract.

## 0.2 AI-agent workflow

Before modifying code or infrastructure, an agent MUST:

1. read the front matter and Sections 0, 4, 6, 7, 18, 19, 20, 23, 28, and 29;
2. choose one task whose `depends_on` entries are complete;
3. produce a short execution plan containing:
   - files changed;
   - external resources affected;
   - schema/migration impact;
   - security implications;
   - observability implications;
   - tests;
   - rollback;
   - expected evidence;
4. implement only the selected task unless the user explicitly expands scope;
5. run all validation commands listed by the task;
6. never invent secret values or production identifiers;
7. never bypass the safety rules below.

## 0.3 Definition of done

A feature/platform task is complete only when all applicable items exist:

- implementation;
- unit/integration/contract tests;
- lint/type checks;
- security validation;
- schema/RLS tests when data access changes;
- deployment configuration;
- telemetry or explicit reason telemetry is unnecessary;
- rollback/recovery path;
- documentation;
- evidence showing the control actually works;
- reproducibility from Git.

## 0.4 Non-negotiable automation safety rules

Agents, scripts, CI jobs, and humans MUST NOT:

- commit passwords, API tokens, Supabase secret keys (or legacy `service_role` keys), database URLs, signing keys, cookies, OAuth tokens, or `.env` values;
- commit Terraform state;
- store Supabase secret keys (or legacy `service_role` credentials) in browser-visible code;
- expose R2 S3 credentials to the frontend;
- use Azure client secrets for normal GitHub CI authentication when OIDC federation is available;
- make production database schema edits through the Supabase Dashboard after migrations become authoritative;
- run destructive production database migrations without an expand/contract plan;
- delete a database column/table while the currently deployed stable backend can still reference it;
- deploy container images by mutable `latest` tag;
- rebuild a container between staging and production promotion;
- set Azure Container Apps `minReplicas > 0` merely to avoid cold starts without an approved cost ADR;
- deploy paid Cloudflare-only capabilities while claiming the platform is within the Free plan;
- place CPU-heavy logic in Workers Free if it consistently approaches the 10 ms CPU ceiling;
- use a queue as the only durable record of a user-visible alert or notification;
- assume Supabase Free automatic backups exist; they do not;
- store database dumps in a Git repository;
- call the primary serverless delivery path “GitOps.” It is **Git-driven declarative delivery**, not a reconciliation-controller model;
- weaken a security scanner with blanket `continue-on-error: true` merely to keep CI green;
- bypass protected production approvals;
- perform routine production changes manually in provider dashboards when an IaC or deployment workflow owns that setting;
- create an always-on VM/Kubernetes cluster for work that can be implemented with the selected serverless primitives;
- log JWTs, refresh tokens, cookies, secrets, raw database URLs, or sensitive personal data.

## 0.5 Edge CPU budget rule

Workers Free has a strict per-invocation CPU budget. Atmos therefore applies an explicit engineering gate:

```text
Worker route measured p95 CPU <= 7 ms
    -> allowed to remain in the Worker

Worker route measured p95 CPU > 7 ms
or repeated 1102 CPU-limit failures
    -> move compute to Supabase Edge Function
       or Azure Container Apps Job/Service
```

The 7 ms threshold is an internal safety margin, not a Cloudflare guarantee.

## 0.6 Pre-implementation validation gate

**Validation result on 2026-08-31: `GO` — no architecture blocker remains after the v2.0.1 corrections in this document.**

Before the first remote mutation in a new implementation session, run this provider preflight and record the result in `docs/evidence/preflight/YYYY-MM-DD.md`:

```text
[ ] GitHub repository visibility is known (public if GitHub artifact attestations are required on Free/Pro/Team)
[ ] Cloudflare zone is active and Workers/Queues/R2/Workers Analytics Engine Free entitlements are visible
[ ] Supabase staging + production projects exist or the two-project Free allocation is available
[ ] Supabase publishable + secret key model is available; no new code depends on legacy anon/service_role keys
[ ] Azure for Students subscription is active, remaining credit is recorded, and a budget/credit alert can be created
[ ] HCP Terraform organization is on the intended Free plan
[ ] Vercel project is eligible for Hobby/non-commercial portfolio use
[ ] Grafana Cloud Free stack is available and synthetic-test projected usage is below the Free allowance
[ ] Open-Meteo use remains non-commercial and required attribution is planned in UI/README
[ ] Current quotas were compared with Section 2; any material change has an ADR/backlog impact
```

A failed entitlement/quota check is **not** permission for an agent to silently choose a paid tier. Mark the affected task `BLOCKED` and request a decision.

### First executable implementation batch

Start with this dependency-safe slice; do not provision Azure or production resources yet:

```yaml
bootstrap_wave_1:
  - GOV-001
  - GOV-003
  - REPO-001
  - REPO-002

local_product_wave:
  - DOM-001
  - WX-001
  - WX-002
  - WX-003
  - WX-004
  - WEB-001
  - SUPA-001
  - DB-001
  - DB-002
  - EDGE-001
  - EDGE-002
  - EDGE-003

ci_security_wave:
  - CI-001
  - CI-004
  - SEC-001
  - SEC-002
  - SEC-003
  - SEC-004
```

Within each wave, the canonical dependency table in Section 29 still controls the exact execution order; a task starts only when all of its `depends_on` IDs are `DONE`.

The first milestone is complete when local Supabase can reset from migrations, the mock-provider dashboard works locally, the Worker skeleton builds, and PR CI/security checks are green. That gives the project a reproducible engineering baseline before any production deployment.

---

# 1. Architecture decision: why v2 exists

## 1.1 Problem with the v1 architecture

The first plan used GKE Standard, managed Redis, managed PostgreSQL, Argo CD, Argo Rollouts, ingress, and cluster observability. That architecture demonstrated Kubernetes well, but for a low-traffic student portfolio it imposed too much permanently provisioned infrastructure and too much idle-cost/maintenance burden.

## 1.2 New principle

Atmos v2 follows:

```text
request-driven work       -> edge/serverless function
DB-adjacent business work -> Supabase Edge Function
scheduled DB work         -> Supabase Cron / SQL function
asynchronous delivery     -> Cloudflare Queue
large object/archive      -> Cloudflare R2
heavy/batch/container work-> Azure Container Apps Job
frontend rendering        -> Vercel / Next.js
```

A container or server is introduced only when its workload earns it.

## 1.3 Interview outcome

The author should be able to explain:

- why Kubernetes was intentionally removed from the primary runtime;
- why edge compute and DB-adjacent compute are separated;
- the consequence of Workers Free CPU limits;
- how data authorization is enforced with RLS;
- how asynchronous work is made retryable and idempotent;
- how a free-tier database is backed up and restore-tested despite no managed backup entitlement;
- how a backend release is progressively delivered without Argo Rollouts;
- how DB migrations remain compatible while two backend versions receive traffic;
- how container security and cloud IAM are still demonstrated through Azure Container Apps;
- how GitHub authenticates to Azure without a stored Azure password;
- why HCP Terraform is used for state/remote plans while application deployments use platform CLIs;
- why the project is intentionally multi-platform rather than “all Cloudflare” or “all Azure”;
- what vendor lock-in exists and how domain contracts/provider adapters reduce it.

## 1.4 Substance rule

Every major technology must answer:

1. Why is it here?
2. Which failure/risk/cost does it address?
3. How do we verify it works?
4. What trade-off or lock-in did we accept?
5. What would cause us to replace it?

Example:

```text
Cloudflare Queue is here because notification delivery must outlive
an HTTP request and must be retryable.

It is NOT the source of truth.
The database records alert_event + delivery state before/around enqueue.

Evidence:
- retry test;
- duplicate-delivery test;
- DLQ test;
- backlog metric/check;
- runbook.

Trade-off:
Workers Free queue retention is only 24 hours and operations are limited,
so a reconciliation job must be able to re-enqueue durable pending events.
```

---

# 2. Research snapshot and platform constraints

> **Research date:** 2026-08-31. Revalidate before deployment.

## 2.1 Cloudflare Workers Free

Current official limits relevant to Atmos:

- 100,000 Worker requests/day;
- 10 ms CPU time per HTTP invocation;
- 128 MB memory;
- 50 subrequests/request;
- 5 Cron Triggers/account;
- network wait time is not counted as CPU time;
- versioned deployments, preview URLs, gradual traffic splits, version affinity, version overrides, and rollback are available in Workers versions/deployments tooling;
- Cloudflare Transform Rules are available on Free with 10 active rules (no regex support on Free), which is sufficient for the version-affinity request-header mapping in this plan;
- Workers Logs is included on Free with a current allowance of 200,000 log events/day and 3-day retention;
- external OpenTelemetry log/trace export is not available on Workers Free, and Worker metrics export through OTel is not supported.

Design consequence:

- Worker stays thin;
- no SSR, heavy auth parsing, large JSON transforms, historical aggregation, PDF generation, or other CPU-heavy jobs in the Free Worker;
- direct weather-provider fetch + cache/routing is acceptable only after measured CPU validation.

## 2.2 Cloudflare Queues Free

Relevant current free limits:

- 10,000 queue operations/day across reads/writes/deletes;
- free-tier message retention: 24 hours;
- retries and dead-letter queues available;
- max message size: 128 KB;
- pull consumers are available for external compute;
- a Worker consumer still shares Workers-plan CPU constraints.

Design consequence:

- queue messages contain IDs/references, not large payloads;
- DB remains authoritative;
- lightweight notification HTTP delivery can run in a Worker consumer;
- heavy consumers move to Supabase Edge Functions or Azure jobs via pull-consumer patterns if needed.

## 2.3 Cloudflare R2 Standard

Current monthly free tier:

- 10 GB-month storage;
- 1 million Class A operations;
- 10 million Class B operations;
- Internet egress: free;
- free allowance applies to Standard storage, not Infrequent Access.

Primary Atmos uses:

- encrypted/logical database backup archives;
- generated exports/reports;
- optional long-lived evidence artifacts;
- optional public assets that benefit from R2 economics.

## 2.4 Cloudflare Turnstile

Turnstile Free currently allows production use, up to 20 widgets/account and unlimited challenges. Atmos uses it on abuse-sensitive anonymous flows such as sign-up, contact/demo, or alert creation where appropriate.

## 2.5 Supabase Free

Current relevant limits/features:

- two active free projects total;
- Postgres database: 500 MB/project;
- 50,000 MAU;
- Edge Functions: 500,000 invocations/month;
- Edge Function CPU time: 2 seconds/request;
- Edge Function free wall-clock duration: 150 seconds;
- Edge Function memory: 256 MB;
- 100 Edge Functions/project;
- 1 day platform log retention;
- no automatic backups on Free;
- no PITR on Free;
- no Branching on Free;
- inactive Free projects may pause after about one week of low activity.

Design consequence:

- use two projects maximum: `staging` and `production`;
- PR tests use local Supabase rather than paid remote branches;
- production backup is an explicit Atmos responsibility;
- schema changes are migration-only;
- RLS tests are mandatory;
- Edge Functions host DB-heavy/API business logic that exceeds Worker CPU budget.

API-key baseline as of this validation:

- browser/public clients use Supabase **publishable** keys (`sb_publishable_...`);
- backend-only privileged components use Supabase **secret** keys (`sb_secret_...`) only when RLS-bypassing access is genuinely required;
- legacy `anon` and `service_role` JWT keys are migration compatibility only and are scheduled for deprecation by the end of 2026;
- normal user-scoped operations should forward the user's JWT and rely on RLS rather than use a privileged secret key.

Database connectivity baseline:

- Free direct Postgres connection is IPv6 unless a paid IPv4 add-on is used;
- use the shared **session pooler on port 5432** for `pg_dump`/backup or other persistent Postgres clients running from IPv4-only infrastructure such as GitHub Actions/Azure when direct IPv6 is unavailable;
- use the shared **transaction pooler on port 6543** for temporary/serverless application clients when a raw Postgres connection is actually required;
- Supabase client/Data API access remains preferred for normal Edge Function application logic.

## 2.6 Supabase Cron and Queues

Supabase supports:

- Postgres-native cron through `pg_cron`;
- scheduled HTTP invocation through `pg_net`;
- Postgres-native durable queues through `pgmq`.

Atmos default choice:

- use **Supabase Cron** for DB-oriented schedules;
- use **Cloudflare Queues** for cross-platform notification/event delivery;
- do not run two queues merely for résumé keywords;
- Supabase Queue becomes an optional fallback if free Cloudflare queue constraints become a blocker.

## 2.7 Vercel Hobby

Current relevant Hobby characteristics:

- free for personal projects;
- preview deployments available;
- 4 active CPU-hours/month for Functions;
- 1,000,000 Function invocations/month;
- 360 GB-hours provisioned memory/month;
- 100 GB fast data transfer in documented Hobby plan overview;
- runtime logs have limited retention;
- rollback on Hobby is limited to the immediately previous production deployment;
- Vercel Rolling Releases require Pro/Enterprise.

Design consequence:

- frontend release safety relies on PR preview + tests + staged production deployment + immediate rollback;
- do **not** claim frontend canary on Hobby;
- backend canary occurs at Cloudflare Worker layer.

## 2.8 Azure for Students + Azure Container Apps

Current Azure for Students offer:

- $100 credit;
- no credit card required;
- credit valid one year;
- eligible active students can renew annually and receive another $100;
- it is intended for education/non-commercial research or development/test/demonstration scenarios;
- if the student credit is exhausted before the renewal point and the subscription is not upgraded to pay-as-you-go, Microsoft can cancel/decommission the subscription/resources rather than providing an unlimited free runtime.

Azure Container Apps Consumption currently includes each month:

- first 180,000 vCPU-seconds free;
- first 360,000 GiB-seconds free;
- first 2 million HTTP requests free;
- scale-to-zero supported by default for appropriate apps;
- jobs can be manual, scheduled, or event-driven;
- revisions are immutable/versioned;
- multiple revisions can split traffic by percentage for canary/blue-green patterns.

Design consequence:

Azure is the **container escape hatch**, not the primary request path.

Cost/lifecycle guardrails:

- Azure Container Apps environments default to Log Analytics-backed log storage unless configured otherwise; Atmos defaults the environment log destination to **`none`** when Grafana/OTel plus real-time log streaming are sufficient, and enables paid Azure log storage only through an ADR;
- an ACA environment that remains idle (no active apps/jobs) or in certain failed states for more than 90 days can be automatically deleted by Azure; Terraform must be able to recreate it and the runbook must treat this as expected platform lifecycle, not data loss;
- exhausting Azure Student credit is a **STOP condition**, not authorization to upgrade to pay-as-you-go. The container lane must be optional/recreatable so the core Atmos product continues without Azure while waiting for renewal or choosing another provider.

## 2.9 HCP Terraform Free

HCP Terraform Free currently provides remote state, remote runs, VCS integration, and other collaboration features for small teams, with a 500-managed-resource limit.

Atmos uses HCP Terraform for:

- remote state;
- speculative PR plans;
- controlled remote applies;
- Azure dynamic provider credentials through OIDC where configured;
- separation of IaC execution from application deployment.

## 2.10 Grafana Cloud Free

Current Grafana Cloud Free capabilities relevant to Atmos include:

- 10k active metric series;
- 50 GB/month logs;
- 50 GB/month traces;
- 14-day retention for core telemetry;
- Synthetics API Testing Free allowance currently includes 100,000 API test executions/month and 10,000 browser test executions/month;
- k6/performance-testing free allowance documented by Grafana.

Important limitation:

Cloudflare's **native OpenTelemetry export from Workers is not available on Workers Free** as of this research snapshot. Therefore Atmos does not pretend to have perfect cross-platform distributed tracing from the Cloudflare edge. It uses:

- Cloudflare native Workers Logs/traces for short-retention edge diagnostics;
- Cloudflare Workers Analytics Engine for durable custom edge/release metrics and release analysis;
- shared `traceparent`/`request_id` propagation;
- Grafana Cloud for supported application telemetry, central SLOs, and external synthetics;
- Vercel OpenTelemetry support for Next.js;
- OTLP from Azure/container workloads where useful;
- optional lightweight manual telemetry export only after measuring Worker CPU impact.

## 2.11 Open-Meteo Free API usage contract

Atmos currently relies on Open-Meteo's Free/Open-Access API for a non-commercial student portfolio. Current constraints are part of the architecture, not an informal assumption:

- non-commercial use only on the free endpoint;
- fewer than 600 calls/minute, 5,000/hour, 10,000/day, and 300,000/month;
- no uptime guarantee/SLA;
- Open-Meteo data is CC BY 4.0 and **attribution is required**;
- some underlying datasets (for example air-quality sources) have additional acknowledgement requirements that must be surfaced where applicable;
- large requests with many variables/long time ranges can count as more than one API call.

Production acceptance therefore requires:

```text
[ ] visible Open-Meteo attribution in About/footer and README
[ ] provider-specific acknowledgements for data products actually shown
[ ] cache/coalescing enabled before public traffic
[ ] provider-call counters/quota warning logic documented
[ ] no ads/subscription/commercialization while using the free non-commercial endpoint
```

If Atmos becomes commercial, replace the endpoint/contract or move to a provider plan that explicitly permits commercial use before launch.

## 2.12 GitHub Actions and provenance constraints

- third-party GitHub Actions MUST be pinned to a **full commit SHA**, with a human-readable version comment; mutable tags such as `@v4` are not sufficient for the protected release path;
- workflow `permissions:` MUST be explicitly least-privilege;
- GitHub artifact attestations on GitHub Free/Pro/Team are available for **public repositories**. For a private portfolio repository, **Cosign/Sigstore verification is the mandatory supply-chain control** and GitHub attestations remain optional until the repository is public or the account plan supports private attestations.

## 2.13 Cloudflare Workers Analytics Engine

Workers Analytics Engine (WAE) is the official mitigation for the edge-metrics/export gap on Workers Free. It is **not** an OTel replacement; it is a Cloudflare-native custom analytics store that complements Grafana and Workers Logs.

Current constraints/capabilities relevant to Atmos:

- Workers Free currently lists 100,000 data-point writes/day and 10,000 SQL read queries/day;
- Cloudflare currently states Analytics Engine usage is not yet billed, but published pricing may take effect later, so Section 0.6 must revalidate this before provisioning;
- WAE retains data for three months;
- `writeDataPoint()` is non-blocking and designed for instrumentation on frequently called Worker paths;
- Analytics Engine may sample high-volume data; queries that count events MUST account for `_sample_interval`;
- Worker version metadata exposes version ID/tag/timestamp and can be written into WAE;
- WAE exposes a SQL API and Cloudflare documents querying it from Grafana or other automation with a scoped API token.

Atmos edge dataset contract:

```text
dataset: atmos_worker_requests
index1: worker_version_id        # sampling/query key for release comparison
blob1: release_id
blob2: route_group               # bounded cardinality, never raw arbitrary URL
blob3: status_class              # 2xx/4xx/5xx
blob4: cache_status              # HIT/MISS/STALE/BYPASS
blob5: backend_release           # Supabase release identifier when applicable
blob6: provider                  # open-meteo/supabase/etc.
double1: wall_duration_ms
double2: error_flag              # 0/1
double3: provider_duration_ms    # when provider was called
```

Privacy/cardinality rules:

- never store user IDs, emails, JWTs, IP addresses, exact search text, or other personal data in WAE;
- route names are normalized templates/groups, not raw URLs;
- version ID is the preferred index because release comparison is the primary query;
- WAE does **not** become the authoritative audit log.

Release-gate role:

```text
0% candidate + version override smoke
        ↓
10% ordinary traffic
        ↓
GitHub Actions queries WAE SQL API
        ├─ candidate 5xx/error rate
        ├─ candidate wall latency
        ├─ stable-vs-candidate delta
        └─ minimum sample size / observation window
        ↓
external Grafana synthetic result
        ↓
PASS -> 25% -> repeat -> 50% -> repeat -> 100%
FAIL -> wrangler rollback
INSUFFICIENT DATA -> hold percentage; do not auto-promote
```

For low-traffic portfolio deployments, the candidate receives a bounded **version-override smoke/k6 exercise** before ordinary traffic promotion so release gates do not pretend that three production requests are statistically meaningful. Synthetic/controlled requests MUST remain within provider and Worker free-tier quotas.

---

# 3. Product scope

## 3.1 Full product feature inventory

All features are listed here. Actual implementation can be accepted/rejected one-by-one later.

### F-WEATHER — Core weather dashboard

- current weather;
- current temperature;
- feels-like temperature;
- weather condition;
- daily high/low;
- humidity;
- pressure;
- wind speed;
- wind direction;
- wind gusts;
- visibility;
- cloud coverage;
- precipitation;
- precipitation probability;
- UV index;
- sunrise/sunset;
- daylight duration;
- hourly forecast;
- 7–16 day forecast;
- weather icons;
- selected-location local timezone/time;
- last-updated indicator;
- Celsius/Fahrenheit;
- metric/imperial units.

### F-CHART — Interactive analytics charts

Variables:

- temperature;
- feels-like;
- humidity;
- precipitation;
- rain probability;
- accumulated rainfall;
- pressure;
- wind;
- gusts;
- UV;
- visibility;
- clouds;
- AQI.

UX:

- hover tooltips;
- crosshair;
- min/max;
- selectable series;
- time-range switching;
- day/night shading;
- sunrise/sunset indicators;
- precipitation bands;
- zoom where appropriate.

### F-LOC — Saved locations

- add/remove location;
- rename labels;
- reorder;
- favorites;
- home/work/university/travel labels;
- default location;
- browser geolocation;
- recent searches;
- quick dashboard switcher.

### F-GEO — Search/geocoding

- city;
- region;
- country;
- coordinates;
- current GPS location;
- postal code when supported by provider.

### F-MAP — Interactive weather map

Layers:

- temperature;
- precipitation;
- clouds;
- wind;
- pressure;
- AQI.

Map features:

- saved-location markers;
- marker weather popovers;
- user location;
- layer switcher;
- legends;
- fullscreen;
- click-to-select location;
- timestamp;
- overlay opacity;
- optional animated precipitation/wind.

### F-AQI — Air quality

- US AQI;
- European AQI;
- PM2.5;
- PM10;
- NO₂;
- O₃;
- SO₂;
- CO;
- pollutant breakdown;
- AQI forecast;
- historical chart;
- category/health indicator.

### F-CAL — Weather calendar

- calendar forecast view;
- click date for hourly details;
- sunrise/sunset;
- precipitation;
- AQI;
- activity score;
- alerts on selected day.

### F-PLAN — Activity planner

Built-in profiles:

- running;
- cycling;
- hiking;
- football;
- photography;
- beach;
- commuting;
- sightseeing;
- picnic;
- custom activity.

Planner dimensions:

- temperature;
- feels-like;
- humidity;
- rain;
- wind;
- UV;
- AQI.

Output:

- 0–100 suitability score;
- ranked time windows;
- explanation of positive/negative factors;
- deterministic, testable scoring.

### F-COMPARE — Location comparison

Compare multiple destinations by:

- temperature;
- rain probability;
- total precipitation;
- humidity;
- wind;
- UV;
- AQI;
- activity score;
- overall weather suitability.

### F-HISTORY — Historical analytics

- 24h / 7d / 30d / 90d / custom ranges;
- temperature history;
- daily min/max;
- humidity;
- pressure;
- rain;
- wind;
- AQI;
- rolling averages;
- event counts;
- data sourced from provider history where licensing permits and/or Atmos-collected snapshots.

### F-ANOM — Weather anomaly insights

- deviation from recent average;
- pressure anomalies;
- temperature anomalies;
- unusual rainfall or wind;
- deterministic statistical approach before any AI/ML feature.

### F-ALERT — Smart user-defined alert rules

Conditions:

- temperature threshold;
- feels-like threshold;
- rain probability;
- rainfall;
- snowfall;
- wind/gust;
- UV;
- AQI;
- PM2.5;
- visibility;
- thunderstorms;
- freeze risk;
- extreme heat;
- provider severe-weather alert.

Rules can include:

- location;
- time window;
- weekday mask;
- cooldown;
- notification channel;
- enabled/disabled state.

### F-NOTIFY — Notification center

- in-app notifications;
- email;
- browser/mobile push;
- read/unread;
- dismissed/expired;
- delivery state;
- retry state;
- failure state.

### F-SEVERE — Severe-weather center

- provider-issued warnings where available;
- Atmos-derived alert events;
- severity;
- location;
- start/end time;
- related saved locations;
- map context;
- clear distinction between official alerts and Atmos-calculated alerts.

### F-REALTIME — Live application updates

Prefer Server-Sent Events initially for:

- notification count;
- triggered alerts;
- completed background work;
- dashboard refresh hints.

Use WebSockets only if a future bidirectional requirement justifies them.

### F-AUTH — Authentication/profile

- Google sign-in;
- email/password if required;
- user profile;
- units;
- timezone;
- theme;
- notification preferences;
- user/admin roles.

### F-PWA — PWA/mobile

- installable application;
- responsive layout;
- cached app shell;
- last-known weather offline;
- clear stale-data indicator;
- push notifications.


---

# 4. Target technology stack

| ID | Layer | Technology | Why it exists |
|---|---|---|---|
| FE | Web app | Next.js + TypeScript | polished SSR/SPA-capable frontend, Vercel-native deployment |
| UI | Design system | Tailwind CSS + shadcn/ui | fast professional UI development |
| DATA-Q | Server state | TanStack Query | caching/loading/retry semantics |
| STATE | Client state | Zustand | small local UI state |
| CHART | Visualization | Apache ECharts | rich weather/analytics charts |
| MAP | Map | MapLibre GL | open map rendering |
| EDGE | Edge/API gateway | Cloudflare Workers Free + Hono | routing, cache, lightweight public API, edge security integration |
| FUNC | Business/API compute | Supabase Edge Functions + Hono | DB-heavy/authenticated logic with larger CPU budget |
| DB | Durable relational data | Supabase PostgreSQL | user data, alerts, history, analytics |
| AUTH | Identity | Supabase Auth | managed authentication |
| AUTHZ | Authorization | PostgreSQL RLS + grants | data-level authorization, testable in SQL |
| CACHE | Weather response cache | Cloudflare Cache API | eliminate Redis server and reduce provider calls |
| QUEUE | Async transport | Cloudflare Queues Free | retryable notification/event delivery |
| SCHED | DB scheduler | Supabase Cron | recurring DB-adjacent work |
| STORE | Object/archive | Cloudflare R2 | backups/exports with free Internet egress |
| BOT | Abuse prevention | Cloudflare Turnstile | protect anonymous flows |
| WEBHOST | Frontend hosting | Vercel Hobby | previews, HTTPS, Next.js deployment |
| CTR | Container format | OCI/Docker | portable heavy-job artifact |
| CTRRUN | Serverless containers | Azure Container Apps Consumption | scale-to-zero container service when edge runtimes are unsuitable |
| CTRJOB | Batch containers | Azure Container Apps Jobs | backup/backfill/heavy scheduled work |
| AZID | Azure identity | Microsoft Entra workload federation + managed identity | keyless GitHub deploy and runtime Azure access |
| REG | Container registry | GHCR | low-cost/public OCI artifact distribution |
| IAC | IaC | Terraform | reproducible multi-provider infrastructure |
| TFSTATE | IaC runtime/state | HCP Terraform Free | remote plans/state, auditability, collaboration |
| CI | CI/CD control plane | GitHub Actions | tests, scans, build, deploy orchestration |
| SAST | Static security | CodeQL + Semgrep | source-level security findings |
| SECRETS | Secret scanning | Gitleaks | prevent secret commits |
| SCAN | Config/image scanning | Trivy | CVE + IaC/config scanning |
| SBOM | Software inventory | Syft or Trivy | SBOM for containers and deployable bundles |
| SIGN | Artifact integrity | Cosign/Sigstore; GitHub attestations when repo visibility/plan supports | verifiable supply-chain evidence |
| OBS | Central observability | Grafana Cloud Free | dashboards, SLOs, synthetics, supported OTLP telemetry |
| EDGELOG | Edge logs/traces | Cloudflare Workers Logs / native observability | short-retention edge diagnostics |
| EDGEMETRIC | Edge/release analytics | Cloudflare Workers Analytics Engine | three-month custom edge metrics + canary analysis |
| TEST-E2E | Browser tests | Playwright | user flow validation |
| TEST-LOAD | Load/perf | k6 | measured performance and release evidence |
| WX | Weather | Open-Meteo provider adapter | main weather/AQI/history source |
| WX2 | Optional provider | OpenWeather/other adapter | map/fallback where useful |
| MAIL | Email | replaceable provider adapter | notification delivery |
| PUSH | Push | Web Push / optional FCM adapter | browser notification delivery |

## 4.1 Explicit non-selected primary technologies

Not part of the primary runtime:

- GKE/Kubernetes;
- Argo CD;
- Argo Rollouts;
- managed Redis/Memorystore;
- Cloud SQL;
- Google Pub/Sub;
- always-on VMs;
- Kafka;
- service mesh;
- self-hosted Vault.

These can be discussed as alternatives, not deployed for résumé padding.

---

# 5. High-level architecture

```text
                                  USER
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
          app.<domain>                    api.<domain>
               │                               │
               ▼                               ▼
          Vercel Hobby                  Cloudflare DNS
          Next.js app                         │
               │                              ▼
               │                     Cloudflare Worker
               │                      Hono thin gateway
               │                              │
               │              ┌───────────────┼───────────────┐
               │              │               │               │
               │              ▼               ▼               ▼
               │         Cache API       R2 / Queue      Supabase Edge
               │                                               Functions
               │                                                  │
               │                                          Hono business API
               │                                                  │
               │                                   ┌──────────────┼──────────────┐
               │                                   ▼              ▼              ▼
               └─────────────────────────────► Supabase Auth   Postgres       Cron
                                                   │              │
                                                   │              ├─ RLS
                                                   │              ├─ history
                                                   │              ├─ alert state
                                                   │              └─ audit state
                                                   │
                                                   ▼
                                            authenticated user

                    HEAVY / CONTAINER ESCAPE HATCH

GitHub Actions --OIDC--> Azure
       │
       ├─ build OCI image
       ├─ Trivy
       ├─ SBOM
       ├─ Cosign/attestation
       ▼
      GHCR
       │ immutable digest
       ▼
Azure Container Apps
       ├─ historical-backfill job
       ├─ database-backup job
       ├─ analytics/export job
       └─ optional heavy HTTP service (min replicas 0)
                 │
                 ├── Supabase
                 └── R2
```

## 5.1 Observability side-channel

The runtime request path is not forced through Grafana. Edge observability is an asynchronous side-channel:

```text
Cloudflare Worker
   ├─ Workers Logs / native traces       # short-retention debugging
   └─ Workers Analytics Engine           # custom release/edge metrics, 3-month retention
                │
                ├─ GitHub Actions SQL query -> canary gate
                └─ optional Grafana query/plugin -> edge dashboard

Vercel/Supabase/Azure supported telemetry -> Grafana Cloud
Grafana Synthetics -> app/API/dependency probes
```

This is **federated observability**, not an observability gap: Grafana remains the central SLO/user-impact surface, while Cloudflare-native systems retain edge-native detail and release analytics.

## 5.2 Domain plan

Example only:

```text
app.example.com          -> Vercel production
api.example.com          -> Cloudflare production Worker
staging.example.com      -> Vercel staging/manual preview if desired
api-staging.example.com  -> Cloudflare staging Worker
assets.example.com       -> optional R2 custom domain/public bucket route
status.example.com       -> optional Grafana/Better Uptime status surface
```

Do not proxy Vercel through Cloudflare CDN merely because Cloudflare is present. Keep the edge ownership clear unless a specific feature requires otherwise.

---

# 6. Runtime placement rules

## 6.1 Placement decision matrix

| Work type | Default runtime | Reason |
|---|---|---|
| DNS/TLS/routing | Cloudflare | edge ownership |
| anonymous weather read | Worker | thin fetch/cache/rate-limit path |
| weather cache hit | Worker Cache API | cheapest/fastest path |
| auth verification + user DB logic | Supabase Edge Function | close to data; larger CPU budget |
| saved locations/preferences | Supabase Edge Function + RLS | durable personalized state |
| activity planner | Supabase Edge Function | deterministic compute may exceed Worker safety budget |
| location comparison | Supabase Edge Function | aggregation/business logic |
| alert rule CRUD | Supabase Edge Function | DB/RLS |
| scheduled alert evaluation | Supabase Cron -> Edge Function | DB-centric schedule |
| notification transport | Cloudflare Queue | async retry boundary |
| lightweight notification delivery | Queue consumer Worker | mostly network I/O |
| heavy queue consumption | Supabase EF/Azure via pull consumer | avoid Worker CPU ceiling |
| historical bulk import | Azure Container Apps Job | batch/container workload |
| DB logical backup | Azure Container Apps Job | requires CLI/container tooling |
| large export/report | Azure Container Apps Job | container/CPU/memory friendly |
| frontend rendering | Vercel | Next.js-native |

## 6.2 Worker responsibilities

The Worker MAY:

- validate basic method/path/size constraints;
- apply CORS/security headers;
- perform Turnstile verification on selected flows;
- normalize simple coordinates/query values;
- generate/propagate request IDs and W3C trace context;
- cache public weather responses;
- call Open-Meteo for lightweight public reads;
- proxy DB-heavy calls to the selected Supabase Edge Function version;
- enqueue compact notification/event messages;
- expose health/version metadata.

The Worker SHOULD NOT:

- execute complex historical aggregation;
- perform expensive crypto loops;
- parse very large payloads;
- render Next.js pages;
- run database backups;
- generate large PDFs/images;
- perform long-running workflows;
- own durable user state.

## 6.3 Supabase Edge Function responsibilities

- authenticated API routes;
- Hono middleware/routing;
- user-resource authorization context;
- business rules;
- planner scoring;
- alert rule evaluation;
- DB queries/RPC invocation;
- queue publication through a narrowly scoped Cloudflare API client when necessary;
- signed URL/metadata orchestration for R2 where required;
- telemetry export where supported and cost-effective.

## 6.4 Azure container responsibilities

Azure runs only workloads that have one or more of these properties:

- require normal Linux/container tooling;
- exceed Edge Function CPU/runtime ergonomics;
- need `pg_dump`/Supabase CLI tooling;
- process large historical ranges;
- require memory-heavy libraries;
- require long finite execution;
- are valuable for container/security/supply-chain evidence.

---

# 7. Prerequisites

## 7.1 Accounts

Required:

- GitHub account;
- GitHub Student Developer Pack if eligible;
- owned public domain;
- Cloudflare account with domain/DNS control;
- Vercel account on Hobby plan;
- Supabase account;
- Azure for Students subscription;
- HCP Terraform account;
- Grafana Cloud Free account;
- weather-provider account only when required by selected provider;
- optional email provider account.

## 7.2 Supabase project allocation

Free plan permits two active projects. Use:

```text
atmos-staging
atmos-production
```

PR tests use local Supabase in Docker/CLI rather than a third hosted branch/project.

Staging may pause due to low activity. Do not create artificial traffic purely to evade the provider's free-tier policy; restore/wake staging when needed.

## 7.3 Azure subscription safeguards

Before any Azure deployment:

- verify Azure for Students is active and record remaining credit;
- create a budget/credit alert;
- never upgrade the subscription to pay-as-you-go automatically or through an AI agent; if credit is exhausted, mark Azure tasks `BLOCKED` and keep the core serverless application operational without the container lane;
- use a dedicated resource group, e.g. `rg-atmos-prod`;
- default Container Apps min replicas to zero;
- avoid premium networking/private endpoints unless specifically justified;
- avoid ACR initially; use public GHCR for the open-source portfolio image;
- document any service that can consume student credit.

## 7.4 Local tools

Pin supported stable versions of:

```text
git
gh
node
pnpm
Docker + Docker Compose
Supabase CLI
Wrangler
Vercel CLI
Azure CLI
Terraform
HCP Terraform CLI/API tooling as needed
jq
yq
make or just
trivy
gitleaks
cosign
syft
k6
```

Recommended version pinning:

```text
mise.toml
or
.tool-versions
```

Never use “latest” as the long-term reproducibility policy in CI. For protected workflows:

- pin third-party GitHub Actions to full-length commit SHAs and annotate the intended release/version in comments;
- use lockfiles or exact/pinned tool versions where supported;
- let Dependabot/Renovate propose reviewed SHA/version updates rather than following mutable tags automatically.

## 7.5 Knowledge prerequisites

The implementer should understand:

- Git/PR/branch protection;
- HTTP, DNS, TLS and caching;
- TypeScript/Node/Deno runtime differences;
- edge/serverless execution models;
- PostgreSQL migrations and transactions;
- RLS/grants/auth JWT concepts;
- queue retry/idempotency/DLQ concepts;
- Docker/OCI image basics;
- OIDC workload federation;
- Terraform state/plan/apply;
- SLI/SLO/error budget;
- logs/metrics/traces;
- backup vs restore vs RPO/RTO.

---

# 8. Monorepo layout

```text
atmos/
├── apps/
│   └── web/                         # Next.js frontend
│
├── workers/
│   ├── gateway/                     # Cloudflare Hono gateway
│   └── notification-consumer/       # lightweight Queue consumer
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── seed.sql
│   ├── tests/                       # pgTAP + RLS tests
│   └── functions/
│       ├── _shared/
│       ├── api-template/            # source copied/versioned by release tooling
│       ├── alert-evaluator/
│       └── maintenance/
│
├── jobs/
│   ├── historical-backfill/         # Azure Container Apps Job
│   ├── database-backup/             # Supabase dump -> R2
│   ├── analytics-export/            # optional heavy export
│   └── restore-verify/               # local/CI restore validation tooling
│
├── packages/
│   ├── contracts/                   # shared request/response schemas
│   ├── domain/                      # weather/planner/alerts domain logic
│   ├── provider-openmeteo/
│   ├── provider-openweather/
│   ├── telemetry/
│   ├── security/
│   └── config/
│
├── infra/
│   └── terraform/
│       ├── modules/
│       │   ├── cloudflare-edge/
│       │   ├── cloudflare-r2/
│       │   ├── cloudflare-queues/
│       │   ├── vercel-project/
│       │   ├── supabase-platform/
│       │   ├── azure-container-apps/
│       │   ├── azure-identity/
│       │   └── observability/
│       └── environments/
│           ├── staging/
│           └── production/
│
├── tests/
│   ├── integration/
│   ├── contract/
│   ├── e2e/
│   ├── security/
│   ├── resilience/
│   └── load/
│
├── scripts/
│   ├── release/
│   ├── migration/
│   ├── backup/
│   └── evidence/
│
├── observability/
│   ├── dashboards/
│   ├── alerts/
│   ├── synthetics/
│   └── slo/
│
├── security/
│   ├── policies/
│   ├── exceptions/
│   ├── threat-model/
│   └── supply-chain/
│
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── runbooks/
│   ├── postmortems/
│   ├── evidence/
│   ├── cost/
│   └── interview/
│
├── .agent/
│   ├── tasks/
│   └── status.yaml
│
├── .github/
│   ├── workflows/
│   │   ├── pr.yml
│   │   ├── database.yml
│   │   ├── preview.yml
│   │   ├── release-backend.yml
│   │   ├── release-frontend.yml
│   │   ├── release-containers.yml
│   │   ├── security.yml
│   │   ├── backup-verify.yml
│   │   └── scheduled-security.yml
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   └── pull_request_template.md
│
├── pnpm-workspace.yaml
├── package.json
├── turbo.json                       # optional monorepo task orchestration
├── Makefile
├── .env.example
├── SECURITY.md
├── CONTRIBUTING.md
└── README.md
```

## 8.1 Monorepo rule

Keep atomic changes together:

```text
API contract + frontend consumer + migration + RLS test + Worker route
```

can be reviewed in one PR.

Do not split into extra repositories unless the project later gains independent teams/release ownership.

---

# 9. System components and dependencies

| ID | Component | Depends on | Responsibility |
|---|---|---|---|
| C-DNS | Cloudflare DNS | owned domain | authoritative DNS |
| C-WEB | Vercel Next.js | GitHub, C-DNS | frontend delivery |
| C-WORKER | CF gateway Worker | C-DNS, C-WX, C-FUNC | edge API, routing, cache |
| C-CACHE | Workers Cache API | C-WORKER | public weather cache |
| C-R2 | Cloudflare R2 | Cloudflare account | backups/exports |
| C-QUEUE | Cloudflare Queue | C-WORKER | async transport |
| C-QCON | queue consumer Worker | C-QUEUE | lightweight delivery consumer |
| C-SUPA | Supabase project | Supabase account | DB/Auth/Functions/Cron |
| C-DB | Supabase Postgres | C-SUPA | durable application data |
| C-AUTH | Supabase Auth | C-SUPA | identity |
| C-RLS | RLS policies/grants | C-DB, C-AUTH | data authorization |
| C-FUNC | Supabase Edge Functions | C-SUPA, C-DB | business API |
| C-CRON | Supabase Cron | C-DB | recurring DB-oriented tasks |
| C-WX | Weather provider adapter | external provider | normalized weather data |
| C-AZ | Azure Container Apps env | Azure student subscription | serverless container plane |
| C-AZJOB | Azure jobs | C-AZ, C-GHCR | finite heavy jobs |
| C-AZAPP | optional heavy HTTP app | C-AZ, C-GHCR | container service escape hatch |
| C-GHCR | GHCR | GitHub | OCI artifacts |
| C-AZOIDC | GitHub -> Azure OIDC | Entra app/federation | keyless Azure CI auth |
| C-AZMI | Azure managed identity | C-AZ | runtime Azure access |
| C-TF | HCP Terraform | GitHub | remote state/plans/apply |
| C-OBS | Grafana Cloud Free | telemetry producers | central dashboards/SLO/synthetics |
| C-CFLOG | Workers Logs/native traces | C-WORKER | short-retention edge diagnostics |
| C-WAE | Workers Analytics Engine | C-WORKER | custom edge/release metrics + canary SQL analysis |
| C-SYN | Grafana Synthetics | C-OBS, public endpoints | external user/dependency availability probes |

## 9.1 Hard dependency graph

```text
GitHub + domain + provider accounts
              │
              ▼
      HCP Terraform bootstrap
              │
     ┌────────┼─────────┐
     │        │         │
     ▼        ▼         ▼
Cloudflare  Supabase   Azure identity
     │        │         │
     │        │         ▼
     │        │    Container Apps env
     │        │
     ▼        ▼
 DNS/R2/    DB/Auth/
 Queues     Edge Functions
     │        │
     └────┬───┘
          ▼
   Cloudflare Worker
          │
          ▼
       API domain

Vercel project + frontend
          │
          ▼
       app domain

GitHub Actions
     ├── tests/scans
     ├── Vercel build/deploy
     ├── Supabase migration/function deploy
     ├── Worker version upload/deploy
     └── OCI build/sign -> GHCR -> Azure
```

---

# 10. Application boundaries

## 10.1 `apps/web`

Responsibilities:

- dashboard/UI;
- authentication UI;
- map/charts;
- saved location UX;
- planner UX;
- alert management UX;
- notification center;
- PWA;
- frontend telemetry;
- never contains privileged secrets.

## 10.2 `workers/gateway`

Hono routes:

```text
/public/weather/*
/public/geocode/*
/public/aqi/*
/api/*                 -> proxy selected Supabase function version
/health
/version
```

The gateway owns:

- CORS;
- request IDs;
- basic rate/size validation;
- selected Turnstile checks;
- public weather cache;
- backend version routing;
- canary boundary.

## 10.3 Supabase `api-<release>` function

Logical modules:

```text
auth
users
locations
planner
alerts
analytics
notifications
providers
telemetry
```

The deployment is release-versioned, e.g.:

```text
api-20260831-a1b2c3d
```

Old and new function names coexist during Worker gradual rollout.

Source control MUST NOT accumulate one permanent source directory per release. Keep one canonical implementation, for example:

```text
supabase/functions/api/
supabase/functions/_shared/
```

Release CI creates an **ephemeral release-named function directory/bundle** (for example `api-a1b2c3d`), deploys that exact function name with the Supabase CLI, records the function name in release metadata, then removes the temporary local directory. Supabase recommends a small number of "fat functions" and currently limits Free projects to 100 functions, so cleanup must retain only `current`, `previous`, and at least one known-good rollback target after Worker rollback references are checked.

## 10.4 `alert-evaluator`

Invoked by Supabase Cron.

Responsibilities:

- load enabled rules;
- fetch/cache required forecast inputs;
- evaluate deterministic conditions;
- write `alert_event` idempotently;
- enqueue a compact delivery event;
- emit evaluation metrics/logs.

## 10.5 `notification-consumer`

Responsibilities:

- consume Queue messages;
- use idempotency key;
- send email/push through provider adapter;
- update delivery state;
- retry transient errors;
- route poison messages to DLQ;
- remain CPU-light.

If CPU limit becomes an issue, replace push consumer with a pull consumer processed by Azure or Supabase.

## 10.6 Azure jobs

### `database-backup`

- run Supabase CLI logical dumps;
- create roles/schema/data files;
- compress;
- **encrypt before cross-provider upload** (recommended baseline: `age` with a public recipient committed as non-secret configuration and the recovery identity stored separately/escrowed);
- upload ciphertext only to a private R2 prefix using a bucket/prefix-scoped writer credential;
- write backup manifest/hash;
- prune according to retention policy.

### `historical-backfill`

- fetch a bounded historical range;
- rate-limit provider access;
- normalize data;
- bulk upsert;
- checkpoint progress;
- support safe restart.

### `analytics-export`

Optional:

- create large CSV/JSON/report exports;
- write result to R2;
- return durable job record.

---

# 11. Domain/provider architecture

## 11.1 Application-owned weather contracts

```ts
interface WeatherProvider {
  getCurrent(input: LocationInput): Promise<CurrentWeather>
  getHourly(input: ForecastInput): Promise<HourlyForecast>
  getDaily(input: ForecastInput): Promise<DailyForecast>
  getAirQuality(input: LocationInput): Promise<AirQuality>
  getHistory(input: HistoryInput): Promise<WeatherHistory>
  searchLocation(query: string): Promise<LocationResult[]>
}
```

Implementations:

```text
OpenMeteoProvider
OpenWeatherProvider         # optional
MockWeatherProvider         # deterministic CI
```

Frontend MUST NOT depend on raw upstream JSON.

## 11.2 Provider resilience

- finite connect/read timeout;
- bounded retry for retryable failures only;
- jittered backoff;
- no unbounded user-driven fan-out;
- stable internal error codes;
- cache TTL tied to provider refresh frequency;
- stale response policy explicitly encoded;
- provider name and freshness metadata returned.

Example response metadata:

```json
{
  "meta": {
    "provider": "open-meteo",
    "cached": true,
    "stale": false,
    "updated_at": "2026-08-31T08:00:00Z",
    "request_id": "..."
  }
}
```

---

# 12. Cache architecture

Redis is removed.

## 12.1 Cache keys

```text
wx:current:<latBucket>:<lonBucket>:<units>
wx:hourly:<latBucket>:<lonBucket>:<units>
wx:daily:<latBucket>:<lonBucket>:<units>
wx:aqi:<latBucket>:<lonBucket>
geo:<normalized-query>
```

## 12.2 Suggested TTLs

Initial targets only; align with provider refresh behavior:

```text
current weather     5–10 min
hourly forecast     10–15 min
daily forecast      30–60 min
AQI                 10–30 min
geocoding           1–7 days
```

## 12.3 Degradation behavior

```text
cache hit
 -> return quickly

cache miss + provider healthy
 -> fetch -> normalize -> cache -> return

provider unhealthy + stale cache inside allowed stale window
 -> return stale response with stale=true

provider unhealthy + no usable cache
 -> stable typed error + telemetry
```

## 12.4 Stampede control

Because there is no Redis lock service, prefer one of:

1. Cloudflare cache semantics + short jittered TTLs;
2. lightweight in-request duplicate suppression where possible;
3. tolerate bounded duplicate upstream calls at portfolio scale;
4. introduce a stronger coordination primitive only after evidence shows it is necessary.

Do not add Durable Objects merely for a theoretical stampede problem.

---

# 13. Database and authorization model

Core tables:

```text
profiles
user_preferences
saved_locations
alert_rules
alert_events
notifications
notification_deliveries
push_subscriptions
weather_snapshots
weather_daily_aggregates
activity_preferences
audit_events
job_runs
backup_manifests
```

## 13.1 RLS policy

Every exposed user-owned table MUST:

- have RLS enabled;
- use explicit grants;
- use policies scoped to `authenticated` where appropriate;
- enforce `auth.uid()` ownership or a tested equivalent;
- include allow tests;
- include deny/cross-user tests.

Example security invariant:

```text
User A cannot SELECT/UPDATE/DELETE User B saved_locations
through anon key, authenticated client, REST API, or RPC.
```

## 13.2 Privileged credentials

The Supabase **secret key** (`sb_secret_...`; legacy equivalent: `service_role` JWT):

- never goes to the browser;
- is not used for normal user CRUD;
- is available only to narrowly scoped server-side jobs/functions that truly need elevated access;
- bypasses RLS, so every use must be justified in code review and included in the threat model/rotation inventory.

Prefer publishable key + user JWT + RLS for normal user operations. New code MUST NOT introduce a legacy `service_role` dependency when a current secret key is available.

## 13.3 Database schema source of truth

```text
supabase/migrations/*.sql
```

Rules:

- no production Dashboard schema edits;
- `supabase db reset` must reconstruct local schema;
- migrations run in CI locally;
- `supabase db push --dry-run` is reviewed before remote apply;
- RLS tests use `supabase test db`/pgTAP.

---

# 14. Primary runtime flows

## 14.1 Public weather request

```text
Browser
  │
  ▼
api.<domain>
  │
  ▼
Cloudflare Worker
  │
  ├─ request validation
  ├─ request_id / traceparent
  │
  ▼
Cache API
  │
  ├─ HIT ───────────────► response
  │
  └─ MISS
       │
       ▼
  Open-Meteo adapter
       │
       ▼
  normalize + cache
       │
       ▼
    response
```

Required evidence:

- cache hit ratio;
- upstream call reduction;
- p95 Worker CPU below internal budget;
- provider timeout test.

## 14.2 Authenticated personalized request

```text
Next.js app
   │ Supabase Auth token
   ▼
Cloudflare Worker
   │ thin validation/routing
   ▼
selected api-<release> Supabase Edge Function
   │ verify user context
   ▼
Postgres
   │ RLS
   ▼
result
```

## 14.3 Activity planner

```text
user input
   │
   ▼
Worker
   │
   ▼
Supabase Edge Function
   │
   ├─ read normalized forecast
   ├─ run deterministic scoring
   └─ return ranked windows + explanation
```

The scoring engine lives in `packages/domain` and must be unit-testable without cloud services.

## 14.4 Alert evaluation

```text
Supabase Cron
     │
     ▼
alert-evaluator Edge Function
     │
     ├─ select active rules
     ├─ fetch relevant weather
     ├─ evaluate rules
     ├─ insert alert_event with unique idempotency key
     └─ enqueue notification reference
                    │
                    ▼
             Cloudflare Queue
```

## 14.5 Notification delivery

```text
Queue
  │
  ▼
notification-consumer Worker
  │
  ├─ load delivery record by id
  ├─ idempotency check
  ├─ email / push provider call
  ├─ update status
  └─ ack only after durable state update

transient fail -> retry
poison fail    -> DLQ
```

## 14.6 Queue reconciliation

Because free Queue retention is 24h, Atmos must be able to reconstruct pending work:

```text
Supabase Cron
    │
    ▼
query delivery rows where status=pending/retryable
and updated_at older than threshold
    │
    ▼
re-enqueue missing work
```

This makes Postgres the durable truth and Queue the transport.

## 14.7 Historical backfill

```text
manual request / admin workflow
       │
       ▼
GitHub/Azure API starts Container Apps Job
       │
       ▼
historical-backfill container
       │
       ├─ checkpoint
       ├─ provider rate limiting
       ├─ normalized batch upsert
       └─ telemetry
```

## 14.8 Database backup

```text
Azure scheduled Container Apps Job
       │
       ▼
Supabase CLI db dump
       │
       ├─ roles.sql
       ├─ schema.sql
       └─ data.sql
              │
              ▼
        compress/encrypt
              │
              ▼
          private R2
              │
              ▼
        backup manifest
```

## 14.9 Backup restore verification

```text
scheduled GitHub Action / manual game day
      │
      ▼
download latest R2 backup
      │
      ▼
ephemeral local Postgres/Supabase container
      │
      ▼
restore
      │
      ├─ row-count/invariant checks
      ├─ migration-history checks
      └─ record observed restore time
```

---

# 15. API conventions

Stable external version prefix:

```text
/api/v1
```

Example routes:

```text
GET /api/v1/weather/current
GET /api/v1/weather/hourly
GET /api/v1/weather/daily
GET /api/v1/weather/air-quality
GET /api/v1/locations/search
GET /api/v1/weather/history
GET /api/v1/dashboard

GET    /api/v1/me
PATCH  /api/v1/me
GET    /api/v1/me/locations
POST   /api/v1/me/locations
PATCH  /api/v1/me/locations/:id
DELETE /api/v1/me/locations/:id

GET    /api/v1/me/alerts
POST   /api/v1/me/alerts
PATCH  /api/v1/me/alerts/:id
DELETE /api/v1/me/alerts/:id

GET   /api/v1/me/notifications
PATCH /api/v1/me/notifications/:id

POST /api/v1/planner/recommend
POST /api/v1/planner/compare

GET /health
GET /health/dependencies
GET /version
```

`/health` checks only the edge process/configuration and MUST remain cheap. `/health/dependencies` intentionally performs a minimal, non-sensitive Supabase Edge Function + Postgres dependency check and returns only coarse component state (`ok`/`degraded`), never database details, SQL errors, credentials, row data, or internal topology.

Error envelope:

```json
{
  "error": {
    "code": "WEATHER_PROVIDER_TIMEOUT",
    "message": "Weather information is temporarily unavailable.",
    "request_id": "..."
  }
}
```

Security requirements:

- strict schema validation;
- input bounds;
- CORS allowlist;
- CSP on frontend;
- authorization per resource;
- body size bounds;
- stable/sanitized errors;
- provider credentials never exposed to browser;
- Turnstile where abuse model justifies it;
- no raw SQL from user input;
- no direct use of Supabase secret key (or legacy `service_role`) for user-scoped operations.

---

# 16. Environment model

## 16.1 Local

```text
Next.js dev
Wrangler dev
Supabase local stack
MockWeatherProvider
optional local mail sink
```

Local is the most complete developer environment.

## 16.2 Pull-request preview

Free-tier constraint: Supabase Branching is not available.

PR strategy:

```text
CI
├─ local Supabase integration tests
├─ pgTAP/RLS tests
├─ Playwright against local assembled stack
├─ Vercel preview deployment
└─ Cloudflare staging Worker version preview URL
```

Do NOT claim every PR has a fully isolated remote database.

The Worker preview uses the **staging Worker/project bindings**, never production secrets.

## 16.3 Staging

```text
Vercel preview/staging deployment
api-staging.<domain>
Cloudflare staging Worker
Supabase staging project
Azure staging job parameters/resource labels
```

Staging may be paused by Supabase Free. Wake it before demos/integration rehearsals.

## 16.4 Production

```text
app.<domain>
api.<domain>
Supabase production project
Cloudflare production Worker/R2/Queues
Azure production Container Apps environment/jobs
```

---

# 17. Git and governance

Branch model:

```text
main
 └── feature/<issue>-<description>
```

`main` protections:

- PR required;
- status checks required;
- no force push;
- no direct push;
- CODEOWNERS for security/IaC/workflow/database paths;
- dependency review;
- significant infrastructure/database changes require explicit review;
- production GitHub Environment requires approval for destructive or high-risk release operations.

Suggested CODEOWNERS areas:

```text
/.github/workflows/**        platform/security
/infra/**                    platform/security
/supabase/migrations/**      database/security
/supabase/tests/**           database/security
/workers/**                  application/security
/security/**                 security
/jobs/**                     platform/application
```

---

# 18. DevSecOps CI pipeline

## 18.0 Workflow trust baseline

Every protected workflow MUST:

- declare explicit least-privilege `permissions:` at workflow/job scope;
- pin every third-party Action to a full commit SHA (keep a version comment beside the SHA);
- use `persist-credentials: false` on checkout unless a later step demonstrably needs Git credentials;
- never execute untrusted PR-controlled scripts with production secrets or write-capable deployment credentials;
- separate PR validation from protected deployment jobs/environments;
- record the Git SHA, workflow run ID, and produced release/digest in evidence.

Treat workflow files as production code: changes under `.github/workflows/**` require CODEOWNERS/security review.

## 18.1 Stage A — developer/pre-commit

Expected commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm security:local
pnpm build
```

Recommended hooks:

- formatter;
- lint;
- typecheck;
- Gitleaks staged-file check;
- prohibited files (`.env`, dumps, state);
- migration filename/order sanity.

## 18.2 Stage B — pull request quality

### Monorepo quality

- locked dependency install;
- formatting;
- ESLint;
- TypeScript typecheck;
- unit tests;
- package boundary tests;
- Next.js production build;
- Worker bundle dry-run;
- Supabase function bundle/check;
- Docker build for changed jobs.

### Database

- start local Supabase;
- `supabase db reset`;
- pgTAP schema tests;
- RLS allow/deny tests;
- migration lint/custom checks;
- generated types diff check if types are committed.

### Integration/contract

- MockWeatherProvider contract tests;
- Open-Meteo recorded-contract tests;
- API contract tests;
- Queue message schema tests;
- idempotency tests;
- Playwright smoke against local composed environment.

## 18.3 Stage C — security gates

Required:

```text
Gitleaks
GitHub CodeQL (JS/TS)
Semgrep
GitHub dependency review / Dependabot
Trivy filesystem
Trivy IaC/config
Trivy container images
SBOM generation
```

Policy:

- high-confidence secret -> fail;
- critical exploitable dependency/image finding -> fail unless approved temporary exception;
- critical IaC public exposure -> fail;
- missing SBOM for release artifact -> fail;
- blanket scan suppression -> prohibited.

## 18.4 Stage D — IaC speculative plan

GitHub Actions performs:

```text
terraform fmt -check
terraform validate
TFLint
Trivy config / Checkov if selected
```

HCP Terraform VCS integration performs speculative plans and posts plan status to the PR.

## 18.5 Stage E — preview

After mandatory validation succeeds:

- build Vercel preview;
- upload Cloudflare staging Worker version and obtain versioned preview URL;
- smoke test both;
- attach preview URLs to PR/evidence.

Cloudflare preview URLs currently do not provide normal Worker logs, so preview smoke failures must be diagnosable from CI output and staging/local reproduction.

---

# 19. Release and deployment architecture

## 19.1 This is not GitOps

The serverless runtime has no Argo-style reconciliation controller.

Correct phrase:

> **Git-driven declarative delivery with immutable/versioned platform releases.**

Git is still the source of code/configuration truth, but runtime desired state is applied through provider APIs/CLIs and Terraform rather than continuously reconciled by a cluster controller.

## 19.2 Release identity

Use one release ID derived from Git:

```text
release = <short-git-sha>
```

Propagate it to:

- Worker version tag/message;
- Supabase Edge Function versioned name;
- Vercel deployment metadata;
- container OCI labels;
- GHCR tag and digest evidence;
- Azure revision/job image;
- logs/telemetry.

## 19.3 Database-compatible backend canary

This is the key deployment pattern.

```text
stable Worker version
      │
      └── calls Supabase api-<old-release>

candidate Worker version
      │
      └── calls Supabase api-<new-release>
```

Cloudflare gradually splits traffic between **Worker versions**, which indirectly splits requests between old/new Supabase function releases.

Workers Free does not provide external OTel export, but this does **not** block automated release analysis. Atmos uses **Workers Analytics Engine + Cloudflare native per-version metrics + Grafana Synthetics**. Once `OBS-007` and `OBS-008` are implemented and tested, percentage promotion can be API-driven from GitHub Actions. A protected human approval remains before first production exposure and for ambiguous/insufficient telemetry; deterministic gate failure triggers rollback.

### Release sequence

```text
1. Validate PR
2. Apply backward-compatible EXPAND migration if required
3. Deploy new Supabase function name: api-<new-release>
4. Upload candidate Worker version referencing api-<new-release>
5. Create a two-version deployment with stable=100% and candidate=0%
6. Smoke the candidate on the production route using `Cloudflare-Workers-Version-Overrides`
7. Require smoke success before exposing candidate to ordinary traffic
8. Protected approval -> promote to 10%
9. Wait the configured observation window and minimum sample size
10. Query WAE for candidate-vs-stable error/latency deltas and check Grafana synthetic status
11. PASS -> promote to 25%; FAIL -> automatic rollback; INSUFFICIENT DATA -> hold
12. Repeat the same gate at 25% and 50%
13. Promote to 100% only after the final gate passes
14. Retain previous Worker + Edge Function for rollback window
15. Deploy frontend if compatibility ordering requires backend first
16. Later apply CONTRACT migration only after old code is retired
```

## 19.4 Worker version affinity

During gradual rollout, use Cloudflare's documented `Cloudflare-Workers-Version-Key` mechanism for authenticated/multi-request flows where version skew could break compatibility.

Atmos default implementation:

1. the client creates/persists a random non-sensitive `atmos_version_key` identifier (never a user ID, email, JWT, or session token);
2. the key is supplied to `api.<domain>` in a cookie/header chosen by ADR;
3. a Cloudflare request-header Transform Rule maps it to `Cloudflare-Workers-Version-Key` on the zone route;
4. integration tests prove repeated requests with one key remain on the same version during a split, while different keys distribute according to the rollout percentage.

If a custom request header is chosen, include its CORS/preflight behavior in tests. The affinity identifier is routing state only, never authentication/authorization.

## 19.5 Worker rollback

If canary fails:

```text
wrangler rollback <stable-version>
```

or equivalent deployment API action.

Rollback restores the stable Worker, which still references the stable Supabase function name.

This is why old function releases and backward-compatible DB schema are retained during the rollback window.

## 19.6 Supabase function release retention

Keep at least:

```text
current
previous
one additional known-good release
```

unless function-count/storage constraints require otherwise.

Automated cleanup MUST NOT delete a function still referenced by any recent Worker rollback target.

## 19.7 Frontend release

Vercel Hobby does not provide rolling releases.

Production strategy:

```text
PR preview
 -> Playwright/smoke
 -> protected merge
 -> GitHub Actions `vercel build`
 -> optional staged production deployment with --skip-domain
 -> smoke exact deployment URL
 -> promote to production
```

Use `vercel deploy --prebuilt` where practical so CI builds the artifact once before upload.

If production fails:

```text
vercel rollback
```

Hobby rollback is limited to the immediately previous production deployment. Preserve Git revert capability as the durable recovery path.

## 19.8 Container release

```text
Git commit
   │
   ▼
Docker build
   │
   ▼
Trivy scan
   │
   ▼
SBOM
   │
   ▼
Cosign signature (+ GitHub attestation when supported)
   │
   ▼
GHCR image@sha256:...
   │
   ▼
CI verifies Cosign signature/identity on the EXACT digest
   │
   ▼
Azure Container Apps Job/App
```

Production references immutable digests. Azure deployment MUST fail if Cosign verification of the exact digest/expected GitHub Actions identity fails; signing without pre-deploy verification is not an effective gate.

For HTTP Container Apps services, multiple revisions may use 10/25/50/100 traffic splitting.

For jobs, there is no HTTP canary. Test the exact digest with staging parameters first, then promote the same digest to the production job definition.

---

# 20. Database migration strategy

## 20.1 Expand/contract is mandatory for canary-sensitive changes

Because old and new backend versions coexist:

### Expand

Examples:

- add nullable column;
- add new table;
- add new index concurrently/appropriately;
- add new enum-compatible representation;
- add new RPC/function;
- keep old field/path working.

### Migrate data

Backfill safely in bounded batches if needed.

### Switch code

Progressively deliver new backend.

### Contract

Only after:

- 100% new code;
- rollback window expired;
- old function versions retired;
- data validation complete.

Then remove old column/index/API.

## 20.2 Migration deployment gates

Production migration requires:

- `supabase db reset` passing locally;
- pgTAP/RLS tests;
- reviewed migration SQL;
- `supabase db push --dry-run` evidence;
- backup freshness check for destructive/high-risk migrations;
- documented rollback or forward-fix strategy.

## 20.3 RLS changes are security releases

Any change to:

```text
GRANT
REVOKE
CREATE POLICY
ALTER POLICY
SECURITY DEFINER function
privileged Supabase secret-key usage
```

requires security review and negative tests.

---

# 21. Asynchronous processing design

## 21.1 Queue message schema

Queue messages should be compact references:

```json
{
  "version": 1,
  "event_id": "uuid",
  "delivery_id": "uuid",
  "kind": "weather-alert",
  "attempt_hint": 0
}
```

Do not enqueue full sensitive user profiles or large forecast payloads.

## 21.2 Idempotency

Database uniqueness example:

```text
unique(alert_rule_id, evaluated_window, condition_fingerprint)
```

Delivery idempotency:

```text
notification_deliveries.id
provider_message_key
status
attempt_count
```

A duplicate queue delivery should become a no-op or safe replay.

## 21.3 Retry taxonomy

Retry:

- 429;
- network timeout;
- 5xx from notification provider;
- temporary provider outage.

Do not retry forever:

- invalid destination;
- rejected payload schema;
- permanently disabled user channel;
- authorization failure caused by configuration.

## 21.4 DLQ process

DLQ event must trigger:

- durable DB status update;
- alert/heartbeat failure;
- runbook;
- operator decision: reprocess, repair, or discard with reason.

---

# 22. Azure Container Apps design

## 22.1 Azure's purpose

Azure exists to preserve a real cloud/container/IAM/supply-chain lane without paying for an always-on cluster.

It is not allowed to become a second general backend unless workload evidence justifies it.

## 22.2 Azure resources

Minimum:

```text
Resource Group
Container Apps Environment (Consumption)
User-assigned or system-assigned managed identities where needed
Container Apps Jobs
optional Container App service
optional Key Vault for runtime secrets
budget/cost alerts
```

Avoid by default:

- dedicated workload profiles;
- private endpoints;
- VNet complexity;
- ACR if public GHCR is sufficient;
- always-on minimum replicas.

## 22.3 GitHub -> Azure authentication

Use GitHub OIDC federation:

```text
GitHub Actions
   │ OIDC
   ▼
Microsoft Entra federated credential
   │ short-lived token
   ▼
Azure RBAC-scoped principal
```

No `AZURE_CLIENT_SECRET` for normal deployments.

Restrict by repository/ref/environment claims.

## 22.4 Azure runtime identity

Use managed identity for Azure resource access such as Key Vault.

External service credentials (Supabase DB URL, R2 S3 key) remain unavoidable long-lived external credentials. Store them in a secret store, scope them narrowly, and rotate them.

## 22.5 Container health/security

HTTP service containers must define:

- startup/readiness checks supported by ACA configuration;
- non-root user where compatible;
- minimal base image;
- read-only filesystem where feasible;
- explicit CPU/memory sizing;
- `minReplicas: 0` by default;
- bounded max replicas;
- structured logs.

Jobs must:

- terminate successfully;
- checkpoint retryable work;
- avoid infinite loops;
- emit job ID/release ID;
- return non-zero on failed backup/backfill.

## 22.6 Logging and surprise-cost guardrail

Container Apps environments default to Log Analytics storage. Atmos sets the environment logs destination to **`none` by default** when central Grafana/OTel plus Azure real-time log streaming meet the requirement. This avoids creating a Log Analytics bill merely for portfolio convenience.

If Azure Log Analytics/Azure Monitor persistence is later enabled, its retention/ingestion cost MUST be added to the cost ADR and quota dashboard first.

## 22.7 Environment lifecycle

Azure may automatically delete a Container Apps environment that stays idle (no active apps/jobs) or in certain failed states for more than 90 days. Therefore:

- the environment is reconstructible from Terraform;
- durable data/backups never live only inside the ACA environment;
- the runbook documents recreation rather than keeping a paid/active workload alive solely to prevent deletion.

---

# 23. Infrastructure as Code

## 23.1 HCP Terraform structure

Recommended workspaces:

```text
atmos-edge-staging
atmos-edge-production
atmos-data-staging
atmos-data-production
atmos-azure-staging
atmos-azure-production
atmos-vercel
```

Keep total resource count well below HCP Terraform Free's 500-resource limit.

## 23.2 Provider strategy

Use pinned providers:

```text
cloudflare/cloudflare
supabase/supabase
hashicorp/azurerm
hashicorp/azuread
vercel/vercel
```

Database schema is NOT managed by Terraform. It is managed by Supabase SQL migrations.

Application code deployment is NOT managed by Terraform. Use:

- Wrangler for Worker versions/deployments;
- Supabase CLI for Edge Functions/migrations;
- Vercel CLI for frontend artifacts;
- Azure CLI/API/Terraform for Container Apps configuration.

## 23.3 HCP dynamic credentials

For Azure, configure HCP Terraform dynamic provider credentials through OIDC so plan/apply runs do not require a stored Azure client secret.

Cloudflare, Supabase, and Vercel providers may still require API tokens. Store them only as HCP sensitive variables and scope them to the minimum permissions/resources.

## 23.4 IaC change flow

```text
PR
 ├─ terraform fmt
 ├─ terraform validate
 ├─ TFLint
 ├─ Trivy/Checkov
 └─ HCP speculative plan
        │
        ▼
      review
        │
        ▼
      merge
        │
        ▼
HCP remote apply
  ├─ auto for low-risk staging if desired
  └─ manual confirmation for production
```

## 23.5 Bootstrap

Bootstrap steps that cannot yet be managed by HCP itself must be explicitly documented, minimal, and imported into Terraform where possible.

Examples:

- create HCP organization/project;
- establish initial Azure federation;
- create initial scoped provider tokens;
- connect VCS.

Never hide bootstrap as “manual magic.”

---

# 24. Secrets and identity

## 24.1 Secret categories

### Browser-safe public configuration

Examples:

- Supabase project URL;
- Supabase publishable key (`sb_publishable_...`; legacy `anon` only during migration);
- public map style URL;
- Turnstile site key.

These are not privileged secrets, but authorization must not rely on secrecy.

### Server-only secrets

Examples:

- Supabase secret key (`sb_secret_...`; legacy `service_role` only during migration);
- database direct connection URL;
- email provider secret;
- R2 S3 access key/secret;
- private weather provider key;
- Grafana OTLP token;
- Vercel deployment token;
- Cloudflare deployment API token.

## 24.2 Storage locations

| Secret type | Preferred storage |
|---|---|
| GitHub deployment token | GitHub Environment/Actions secret |
| HCP provider token | HCP sensitive variable |
| Supabase function secret | Supabase Functions secret store |
| Worker runtime secret | Wrangler/Cloudflare Worker secret |
| Azure job external secret | Azure Key Vault reference or ACA secret with documented rotation |
| Frontend public config | Vercel environment variable, explicitly non-secret |

## 24.3 Rotation

Document rotation for:

- Cloudflare API token;
- Vercel token;
- Supabase secret key / DB password where applicable (and legacy `service_role` only until removed);
- R2 S3 access keys;
- email provider key;
- Azure external secrets.

Rotation must be tested at least once for one representative credential.

---

# 25. Observability and SRE

## 25.1 Observability philosophy

This is a multi-platform serverless system. Do not pretend every provider exposes identical telemetry.

Atmos uses:

```text
central SLO + synthetic view       -> Grafana Cloud
Next.js traces/frontend telemetry  -> Vercel OTel / Grafana where configured
Supabase function app telemetry    -> OTLP/custom instrumentation where feasible
Azure containers/jobs              -> OTLP + Azure native logs
Cloudflare edge                    -> Workers Logs/native traces + Workers Analytics Engine
cross-system correlation           -> request_id + traceparent + release_id
```

Workers Free observability baseline:

- Workers Logs: currently 200,000 log events/day with 3-day retention;
- native Worker traces/logs may be viewed in Cloudflare, but external OTel export is unavailable on Free;
- OTel export of Worker metrics is not supported;
- Workers Analytics Engine stores Atmos-defined request/release metrics for three months and is queryable through SQL API;
- `worker_cpu_ms`/CPU-limit evidence comes from Cloudflare native invocation/observability fields and controlled load tests, not a fictional Prometheus exporter;
- sample logs/traces intentionally to remain within the free event allowance.

## 25.2 Edge release analytics dataset

`workers/gateway` writes a bounded WAE data point for eligible production requests using the Section 2.13 dataset contract. The version metadata binding supplies the exact Worker version ID/tag. Writes are non-blocking.

The release workflow stores a **read-only/scoped Cloudflare Analytics API token** in the protected production GitHub Environment and queries WAE SQL API. It does not reuse the broader deployment token unless scope analysis proves one token is safer and equally least-privilege.

Canary queries MUST:

- filter by exact stable/candidate version IDs and release IDs;
- use `_sample_interval` for count/rate calculations when applicable;
- normalize latency/error thresholds against stable baseline plus absolute SLO limits;
- require a minimum observation window and sample count;
- return `PASS`, `FAIL`, or `INSUFFICIENT_DATA`;
- preserve the SQL query + result JSON as release evidence.

Suggested first gate (tune from measurements; do not claim as universal SLO):

```text
FAIL if candidate 5xx/error rate > max(2%, stable + 1 percentage point)
FAIL if candidate p95 wall latency > max(2500 ms, stable * 1.5)
HOLD if candidate weighted sample count < 30 requests
PASS otherwise, provided the external dependency synthetic is healthy
```

Low traffic is addressed with a bounded candidate-targeted smoke/k6 exercise through version overrides before relying on ordinary canary traffic.

## 25.3 Correlation fields

Every server-side component should include:

```text
timestamp
service
environment
release_id
request_id
trace_id where available
route/event_kind
status/outcome
duration_ms
user_id_hash only if operationally justified
```

Never log raw user tokens.

## 25.4 Key application metrics

Logical metrics (whether emitted as OTel metrics, platform counters, or calculated DB aggregates):

```text
http_requests_total
http_request_duration_seconds
worker_cpu_ms
weather_requests_total
weather_provider_requests_total
weather_provider_errors_total
weather_provider_duration_seconds
weather_cache_hits_total
weather_cache_misses_total
planner_requests_total
alert_rules_evaluated_total
alerts_triggered_total
queue_publish_failures_total
notification_deliveries_total
notification_failures_total
notification_delivery_duration_seconds
dlq_messages_total
backup_success_total
backup_age_seconds
backup_duration_seconds
restore_verify_success_total
azure_job_failures_total
```

## 25.5 Initial SLOs

Targets are starting objectives, not CV claims.

### Public weather API

```text
availability >= 99.5%
p95 API latency < 1 s for cached/public portfolio traffic
provider-backed p95 < 2.5 s
```

### Authenticated API

```text
availability >= 99.0% on free-tier portfolio environment
p95 < 2.5 s
```

### Notification pipeline

```text
99% of durable pending notifications are processed or moved to explicit failure state within 5 min
0 silent-loss target: every failed delivery has durable state
```

### Backup

```text
RPO objective: <= 24 h
backup freshness alert: > 30 h
restore verification: at least monthly during active project development
```

The free-tier environment cannot honestly claim enterprise HA/SLA.

## 25.6 Dashboards

### Dashboard A — Product/API

- request rate;
- p50/p95/p99 where data exists;
- error rate;
- release annotations;
- synthetic availability.

### Dashboard B — Weather/cache

- provider calls;
- provider errors;
- cache hit ratio;
- stale serves;
- upstream calls saved.

### Dashboard C — Alerts/queue

- rules evaluated;
- alerts created;
- pending deliveries;
- retries;
- DLQ;
- delivery latency.

### Dashboard D — Backup/jobs

- last successful backup;
- backup duration/size;
- restore verification age;
- Azure job executions/failures;
- historical backfill progress.

## 25.7 Synthetics

Use Grafana Cloud Synthetics as the external/user-impact source of truth. Initial checks:

```text
GET https://app.<domain>/                                      # frontend availability
GET https://api.<domain>/health                              # Cloudflare edge availability
GET https://api.<domain>/health/dependencies                 # Worker -> Supabase EF -> Postgres
GET https://api.<domain>/api/v1/weather/current?...          # end-to-end weather/provider path
```

Recommended portfolio baseline: one public probe every 15 minutes for the dependency check, plus suitably spaced app/API checks. At one probe, a 15-minute single API check is about 2,880 one-minute test executions in a 30-day month, far below Grafana's current 100,000 Free API-test allowance; always confirm the UI usage calculator before enabling more probes/checks.

`/health/dependencies` must execute a real cheap user-database query (or an equivalent minimal function/RPC) so it detects a paused/unavailable Supabase project rather than returning a static 200. Supabase documents that Free projects can pause after low activity over seven days and that normal connected-application/API database activity contributes to remaining active. The synthetic is justified primarily as **real dependency availability monitoring**; keeping a genuinely monitored production dependency active is a side effect, not fake traffic created only to evade pausing. Pausing is still treated as possible and the runbook remains mandatory.

Synthetics provide central user-visible availability even when provider log retention is short.

---

# 26. Security gates

| Gate | Stage | Fail condition | Evidence |
|---|---|---|---|
| SEC-001 | PR | real secret detected | Gitleaks report |
| SEC-002 | PR | critical/high-confidence SAST issue | CodeQL/Semgrep |
| SEC-003 | PR | unacceptable dependency vulnerability | dependency report |
| SEC-004 | PR | critical Terraform/serverless misconfig | Trivy/Checkov |
| SEC-005 | PR | RLS deny test fails | pgTAP output |
| SEC-006 | PR | migration cannot reconstruct DB | `supabase db reset` |
| SEC-007 | Build | container critical CVE policy fail | Trivy image report |
| SEC-008 | Build | SBOM missing | workflow failure |
| SEC-009 | Build/Deploy | Cosign signature missing **or verification of the exact digest/expected identity fails**; GitHub attestation missing only when enabled/supported | workflow failure + verification log |
| SEC-010 | Deploy | unauthorized Azure OIDC claim | Azure auth denial |
| SEC-011 | Deploy | Worker candidate smoke fails | deployment blocked |
| SEC-012 | Canary | error/latency threshold fails | Worker rollback |
| SEC-013 | Runtime | cross-user RLS access succeeds | security test failure |
| SEC-014 | Runtime | backup too old | SLO alert |
| SEC-015 | Runtime | queue/DLQ unresolved | alert/runbook |

## 26.1 Security exception format

```yaml
exception_id: SEC-EX-001
finding: <rule/CVE>
owner: <owner>
reason: <why accepted>
mitigation: <compensating control>
expiry: YYYY-MM-DD
tracking_issue: <issue>
```

No permanent undocumented allowlists.

## 26.2 Threat highlights

- stolen platform API token;
- malicious workflow edit;
- dependency compromise;
- Supabase secret-key leakage (including legacy `service_role`);
- RLS misconfiguration;
- broken object-level authorization;
- XSS;
- unsafe Server Action/API input;
- queue replay/duplicate processing;
- notification spam;
- provider quota exhaustion;
- Worker CPU-exhaustion DoS;
- R2 backup exposure;
- Azure OIDC trust too broad;
- Azure Student credit exhaustion/decommissioning;
- container supply-chain compromise;
- database migration data loss;
- free-tier project pause;
- third-party platform outage.

---

# 27. Reliability/game-day exercises

## R-001 — Weather provider timeout

Inject provider delay/error.

Expected:

- finite timeout;
- stale cache if policy permits;
- typed error otherwise;
- no runaway retries;
- telemetry evidence.

## R-002 — Worker CPU budget regression

Create a test route or controlled build that exceeds the internal CPU safety budget.

Expected:

- perf test detects regression before production where possible;
- route is moved/offloaded rather than raising paid plan silently;
- ADR documents placement change.

## R-003 — Supabase function failure

Candidate function returns 5xx.

Expected:

- Worker gradual rollout shows elevated errors;
- release aborts/rolls back;
- stable Worker continues referencing stable function.

## R-004 — Bad Worker canary

Deploy intentionally failing candidate to 10%.

Expected:

- monitoring/smoke identifies failure;
- `wrangler rollback` restores stable version;
- old Supabase function remains available;
- incident evidence recorded.

## R-005 — RLS escape attempt

Authenticate as User A and attempt User B resources.

Expected:

- denied at DB layer;
- test remains in CI forever.

## R-006 — Queue duplicate

Deliver same event twice.

Expected:

- no duplicate user notification or duplicate state mutation;
- idempotency metric/evidence.

## R-007 — Poison message

Use invalid permanent delivery payload.

Expected:

- bounded retries;
- DLQ;
- durable failed state;
- runbook.

## R-008 — Queue retention/reconciliation

Simulate undelivered pending event beyond expected processing window.

Expected:

- DB reconciliation finds it;
- safely re-enqueues;
- no silent loss.

## R-009 — Supabase project/data loss simulation

Do not destroy production. Use a local/staging restore drill.

Expected:

- latest R2 logical backup restores;
- invariants pass;
- observed RTO documented.

## R-010 — Azure job failure

Force backup/backfill job to fail mid-run.

Expected:

- non-zero job status;
- checkpoint or safe restart;
- partial output is not marked successful;
- alert/evidence exists.

## R-011 — Frontend bad deployment

Deploy controlled broken preview or test production rehearsal.

Expected:

- preview tests catch it, or Hobby rollback returns immediately to previous production;
- Git revert provides durable recovery.

## R-012 — External platform outage tabletop

Tabletop failure of Cloudflare, Supabase, or Vercel.

Document:

- user impact;
- what still works;
- status communication;
- recovery dependence on vendor;
- portability escape path.

---

# 28. Required implementation order

## Phase 0 — Governance and architecture

- master plan v2;
- architecture diagram;
- ADR template;
- naming convention;
- threat model skeleton;
- cost/quota policy;
- branch protection.

## Phase 1 — Monorepo/app baseline

- Next.js shell;
- Hono contracts;
- domain package;
- OpenMeteoProvider;
- MockWeatherProvider;
- local Supabase;
- base dashboard.

## Phase 2 — Data/auth security

- migrations;
- Supabase Auth;
- profiles/preferences;
- RLS;
- pgTAP security tests;
- generated types.

## Phase 3 — Edge/API split

- Cloudflare gateway;
- public weather routes;
- cache;
- Supabase `api-template` function;
- authenticated routes;
- CPU budget tests.

## Phase 4 — Product features

Incrementally add:

- charts;
- saved locations;
- map;
- AQI;
- planner;
- comparison;
- history;
- alerts;
- notification center;
- PWA;
- optional advanced features.

## Phase 5 — Async

- Cloudflare Queue;
- delivery table/idempotency;
- lightweight consumer;
- retry/DLQ;
- reconciliation job.

## Phase 6 — CI foundation

- PR workflow;
- local Supabase CI;
- Playwright;
- database tests;
- Worker/Vercel build checks;
- branch protection.

## Phase 7 — DevSecOps

- Gitleaks;
- CodeQL;
- Semgrep;
- dependency review;
- Trivy;
- SBOM;
- Cosign/attestations;
- exception process.

## Phase 8 — Terraform/HCP

- HCP org/project/workspaces;
- Cloudflare IaC;
- Supabase platform IaC;
- Vercel project IaC;
- Azure federation/IaC;
- remote plans/applies.

## Phase 9 — Preview environments

- Vercel preview from GitHub Actions;
- Worker preview versions on staging Worker;
- preview evidence comments;
- local full-stack E2E.

## Phase 10 — Observability + release-analysis baseline

- request/release IDs;
- Grafana Cloud base;
- Cloudflare native logs/traces;
- Workers Analytics Engine dataset + version metadata;
- app/API/Supabase dependency synthetics;
- WAE SQL canary query/gate;
- initial SLO/error/latency thresholds.

## Phase 11 — Progressive backend release

- release-versioned Supabase functions;
- Worker 0% candidate + version-override smoke;
- gradual 10/25/50/100 split;
- WAE + synthetic PASS/FAIL/HOLD gates;
- version affinity;
- rollback;
- release cleanup safety.

## Phase 12 — Azure container lane

- GHCR;
- hardened Docker image;
- Azure Container Apps env;
- backup job;
- historical backfill job;
- OIDC deployment;
- optional HTTP canary demo;
- Azure OTel.

## Phase 13 — Backup/DR

- scheduled logical backup;
- private R2;
- checksums/manifests;
- retention;
- restore CI/game day;
- RPO/RTO evidence.

## Phase 14 — Reliability + SRE evidence

- Vercel/Supabase/Azure supported telemetry completion;
- dashboards and alert tuning;
- provider outage;
- CPU budget exercise;
- RLS attack test;
- queue duplicate/DLQ;
- bad Worker canary;
- Azure job failure;
- restore drill;
- postmortem.

## Phase 15 — Portfolio polish

- README architecture;
- cost table;
- demo video;
- CI/security screenshots;
- gradual rollout screenshot;
- RLS test evidence;
- backup/restore evidence;
- Azure revision/job evidence;
- Grafana/SLO screenshot;
- measured k6 results;
- interview script.

---

# 29. Agent-ready dependency backlog

Status values:

```text
TODO
PLANNED
IN_PROGRESS
BLOCKED
REVIEW
DONE
```

| ID | Work item | Depends on | Primary output |
|---|---|---|---|
| GOV-001 | naming/env/tag conventions | — | ADR/docs |
| GOV-002 | threat-model skeleton | GOV-001 | threat model |
| GOV-003 | free-tier quota policy | GOV-001 | cost/quota doc |
| REPO-001 | initialize monorepo/pnpm | GOV-001 | repo skeleton |
| REPO-002 | CI ownership/protection files | REPO-001 | CODEOWNERS/templates |
| DOM-001 | weather domain contracts | REPO-001 | package contracts |
| DOM-002 | planner/alert domain models | DOM-001 | domain package |
| WX-001 | WeatherProvider interface | DOM-001 | provider contract |
| WX-002 | MockWeatherProvider | WX-001 | deterministic tests |
| WX-003 | OpenMeteoProvider | WX-001 | live adapter |
| WX-004 | Open-Meteo usage/attribution/quota guard | WX-003, GOV-003 | licence + provider-budget evidence |
| WEB-001 | Next.js shell | REPO-001 | apps/web |
| WEB-002 | dashboard core | WEB-001, WX-002 | UI baseline |
| SUPA-001 | local Supabase init | REPO-001 | supabase config |
| DB-001 | base schema migrations | SUPA-001, DOM-001 | SQL migrations |
| DB-002 | seed/test fixtures | DB-001 | seed |
| AUTH-001 | Supabase Auth frontend | WEB-001, SUPA-001 | auth UI/session |
| RLS-001 | RLS baseline | DB-001, AUTH-001 | policies |
| RLS-002 | pgTAP RLS tests | RLS-001 | security tests |
| FUNC-001 | Hono Edge Function template | SUPA-001, DOM-001 | api-template |
| FUNC-002 | authenticated profile API | FUNC-001, RLS-001 | API routes |
| EDGE-001 | Wrangler staging/prod setup | REPO-001 | Worker config |
| EDGE-002 | Hono gateway skeleton | EDGE-001 | gateway |
| EDGE-003 | request IDs/CORS/security headers | EDGE-002 | middleware |
| EDGE-004 | public weather route | EDGE-002, WX-003, WX-004 | API |
| CACHE-001 | Cache API weather caching | EDGE-004 | cache layer |
| PERF-001 | Worker CPU measurement gate | EDGE-004 | perf evidence |
| ROUTE-001 | Worker -> versioned Supabase proxy | FUNC-001, EDGE-002 | split runtime |
| FEAT-LOC-001 | saved locations | FUNC-002, RLS-002 | feature |
| FEAT-CHART-001 | charts | WEB-002 | feature |
| FEAT-AQI-001 | AQI | WX-003, WEB-002 | feature |
| FEAT-MAP-001 | map | WEB-002 | feature |
| FEAT-PLAN-001 | deterministic planner | DOM-002, FUNC-001 | feature |
| FEAT-CMP-001 | comparison | FEAT-PLAN-001 | feature |
| HIST-001 | snapshot schema | DB-001 | data tables |
| ALERT-001 | alert rule schema/RLS | DB-001, RLS-001 | alert model |
| ALERT-002 | evaluator Edge Function | ALERT-001, WX-003 | evaluation |
| CRON-001 | Supabase Cron trigger | ALERT-002 | schedule |
| QUEUE-001 | Cloudflare Queue IaC/config | EDGE-001 | queue |
| QUEUE-002 | durable delivery schema | DB-001 | delivery table |
| QUEUE-003 | publish path | ALERT-002, QUEUE-001, QUEUE-002 | producer |
| QUEUE-004 | consumer Worker | QUEUE-003 | consumer |
| QUEUE-005 | retry/DLQ config | QUEUE-004 | reliability |
| QUEUE-006 | DB reconciliation job | QUEUE-002, CRON-001 | recovery |
| CI-001 | PR quality workflow | REPO-001 | workflow |
| CI-002 | local Supabase CI | CI-001, SUPA-001 | DB CI |
| CI-003 | Playwright local stack | CI-001, WEB-002, EDGE-002 | E2E |
| CI-004 | Actions least-permission + full-SHA pinning | CI-001, REPO-002 | workflow trust baseline |
| SEC-001 | Gitleaks | CI-001 | secret gate |
| SEC-002 | CodeQL/Semgrep | CI-001 | SAST |
| SEC-003 | dependency review | CI-001 | dependency gate |
| SEC-004 | Trivy source/config | CI-001 | config gate |
| SBOM-001 | serverless/package SBOM | SEC-004 | SBOM |
| TF-001 | HCP Terraform org/project | GOV-001 | remote IaC |
| TF-002 | provider pinning/modules | TF-001 | Terraform base |
| CF-IAC-001 | DNS/R2/Queue resources | TF-002 | Cloudflare IaC |
| SUPA-IAC-001 | Supabase project settings | TF-002 | Supabase IaC |
| VERCEL-IAC-001 | Vercel project/domain | TF-002 | Vercel IaC |
| AZ-001 | Azure Student guardrails/budget | GOV-003 | Azure baseline |
| AZ-OIDC-001 | GitHub -> Azure OIDC | AZ-001 | federation |
| AZ-TF-OIDC-001 | HCP Terraform -> Azure OIDC | AZ-001, TF-001 | dynamic IaC auth |
| AZ-IAC-001 | Container Apps environment | AZ-OIDC-001, TF-002 | Azure IaC |
| PREVIEW-001 | Vercel preview workflow | CI-001 | preview |
| PREVIEW-002 | Worker staging preview version | CI-001, EDGE-001 | preview |
| REL-001 | release ID/version metadata | CI-001 | release convention |
| REL-002 | versioned Supabase function deploy | REL-001, FUNC-001 | candidate backend |
| REL-003 | Worker 0%-candidate deployment + version-override smoke | REL-002, ROUTE-001 | production-route candidate proof |
| REL-004 | Worker 10/25/50/100 rollout with WAE + synthetic PASS/FAIL/HOLD gates | REL-003, OBS-008, SLO-001 | canary |
| REL-005 | `Cloudflare-Workers-Version-Key` affinity + Transform Rule test | REL-004 | skew control |
| REL-006 | Worker rollback automation | REL-004 | rollback |
| REL-007 | old function cleanup guard | REL-006 | lifecycle |
| DBREL-001 | expand/contract migration policy | DB-001 | migration safety |
| FRONTREL-001 | Vercel prebuilt production flow | PREVIEW-001 | frontend release |
| GHCR-001 | GHCR container publishing | CI-001 | registry |
| CTR-001 | hardened job Dockerfile | GHCR-001 | OCI artifact |
| CTR-002 | Trivy image + SBOM + Cosign | CTR-001 | signed supply chain artifact |
| CTR-003 | verify Cosign identity/signature on exact GHCR digest before Azure deploy | CTR-002 | deploy gate evidence |
| AZJOB-001 | backup Container Apps Job | AZ-IAC-001, CTR-003 | backup job |
| R2BACK-001 | private R2 backup bucket/prefix | CF-IAC-001 | backup storage |
| BACKUP-001 | logical dump -> encrypt -> private R2 | AZJOB-001, R2BACK-001 | encrypted backup pipeline |
| BACKUP-002 | retention/checksum manifest | BACKUP-001 | backup policy |
| RESTORE-001 | ephemeral restore verification | BACKUP-001 | DR evidence |
| AZJOB-002 | historical backfill job | AZ-IAC-001, CTR-003, HIST-001 | batch job |
| OBS-001 | correlation/request IDs | EDGE-003, FUNC-001 | telemetry base |
| OBS-002 | Grafana Cloud base | OBS-001 | central obs |
| OBS-003 | Vercel OTel | OBS-002, WEB-001 | frontend/server trace |
| OBS-004 | Supabase app telemetry | OBS-002, FUNC-001 | function telemetry |
| OBS-005 | Azure job telemetry | OBS-002, AZJOB-001 | job telemetry |
| OBS-006 | Cloudflare native logs/traces docs/dashboard | EDGE-002 | edge diagnostics |
| OBS-007 | Workers Analytics Engine binding + bounded request dataset + version metadata | EDGE-002, REL-001 | edge/release metrics |
| OBS-008 | WAE SQL release queries with sampling-aware PASS/FAIL/HOLD result | OBS-007 | canary analysis engine |
| SLO-001 | Grafana app/API/Supabase dependency synthetics | OBS-002, ROUTE-001 | external availability + dependency monitoring |
| SLO-002 | SLOs/alerts | SLO-001 | SRE controls |
| LOAD-001 | k6 public API baseline | EDGE-004 | performance evidence |
| GAME-001 | provider outage | CACHE-001, OBS-001 | resilience evidence |
| GAME-002 | Worker bad canary | REL-006, OBS-006, OBS-008, SLO-001 | rollout evidence |
| GAME-003 | RLS attack test | RLS-002 | security evidence |
| GAME-004 | duplicate queue | QUEUE-004 | idempotency evidence |
| GAME-005 | DLQ exercise | QUEUE-005 | async evidence |
| GAME-006 | backup restore | RESTORE-001 | DR evidence |
| GAME-007 | Azure job mid-failure | AZJOB-001 | batch resilience |
| DOC-001 | runbooks | SLO-002 | ops docs |
| DOC-002 | postmortem | GAME-002 | incident doc |
| PORT-001 | architecture/evidence README | FRONTREL-001, REL-006, SLO-002, GAME-003, GAME-006, CTR-003 | portfolio |
| PORT-002 | interview demo package | PORT-001 | CV/interview evidence |

---

# 30. AI-agent task schema

Each substantial task should have:

```yaml
task:
  id: "<BACKLOG-ID>"
  title: "<short title>"
  status: TODO
  objective: "<one concrete outcome>"

  depends_on:
    - "<task id>"  # ALL listed IDs must be DONE; no prose, `or`, or aliases

  external_policy_checks:
    - "<licence/quota/plan requirement or none>"

  runtime_placement:
    allowed:
      - cloudflare-worker
      - supabase-edge-function
      - azure-container-app-job
      - vercel-nextjs
      - postgres
    selected: "<one>"
    reason: "<why this runtime fits CPU/state/duration/cost>"

  scope:
    include:
      - "<paths/resources>"
    exclude:
      - "<explicit non-goals>"

  inputs:
    required_config:
      - "<name only>"
    required_secrets:
      - "<secret name only; never value>"

  outputs:
    files:
      - "<path>"
    terraform_resources:
      - "<resource>"
    database_changes:
      - "<migration or none>"
    deployed_units:
      - "<unit>"

  compatibility:
    requires_expand_contract: false
    stable_version_compatible: true
    rollback_window: "<duration>"

  validation:
    commands:
      - "pnpm lint"
      - "pnpm typecheck"
      - "pnpm test"
    expected:
      - "<assertion>"

  security_checks:
    - gitleaks
    - codeql_or_semgrep
    - trivy_if_applicable
    - rls_tests_if_applicable

  budget_checks:
    worker_cpu_budget_ms: 7
    creates_paid_resource: false
    requires_student_credit: false

  telemetry:
    metrics:
      - "<metric or none>"
    logs:
      - "<event>"
    traces:
      - "<span or reason unavailable>"

  evidence:
    - "<artifact/screenshot/report>"

  rollback:
    strategy: "<how to undo safely>"

  human_approval:
    required: false
    reason: ""
```

## 30.1 Agent stop conditions

An agent must STOP and request human approval when:

- a `depends_on` value is not an exact canonical backlog ID or one of its dependencies is not `DONE`;
- a step may create a paid resource;
- a step may consume meaningful Azure student credit;
- production Terraform has a destructive plan;
- a DB migration drops/rewrites data;
- a secret must be created/rotated;
- a Cloudflare Worker route cannot meet CPU budget;
- a proposed design requires Workers Paid;
- a proposed design adds a new infrastructure vendor;
- a production rollback would be impaired;
- an existing RLS policy would be weakened;
- backup freshness is outside policy before a destructive DB change.

---

# 31. Backup, retention, and disaster recovery

## 31.1 Why Atmos owns backups

Supabase Free currently has no automatic backups/PITR. Supabase itself recommends regular CLI exports for free projects.

Atmos must therefore demonstrate:

```text
backup
restore
verification
retention
RPO/RTO measurement
```

not merely produce dump files.

## 31.2 Backup format

Use Supabase CLI rather than raw unrestricted `pg_dump` where possible.

For Azure/GitHub IPv4-only execution, set `DB_URL` to the Supabase **session pooler** (`:5432`) connection string by default. Use the direct database endpoint only when the runtime has verified IPv6 reachability (or a deliberately purchased IPv4 add-on). Do not use the transaction pooler for logical backup tooling.

```bash
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

If recovery must preserve migration history, dump `supabase_migrations` schema/data separately as documented by Supabase. If Atmos customizes `auth` or `storage` schema objects (triggers/RLS/etc.), generate and test a separate diff/restore path for those customizations.

Package:

```text
atmos-backup-YYYYMMDDTHHMMZ/
├── roles.sql
├── schema.sql
├── data.sql
├── migration-history/      # when required
├── manifest.json
└── sha256sums.txt
```

Then:

1. calculate checksums on the plaintext dump set;
2. compress;
3. encrypt locally before upload (`age` is the recommended baseline);
4. upload **ciphertext only** to a private R2 prefix with a writer credential scoped to that bucket/prefix;
5. restore verification uses a separate read credential where practical;
6. keep the decryption recovery identity outside Git and outside the backup bucket, with an explicitly tested recovery/escrow procedure.

R2 provider-side encryption is useful but does not replace client-side encryption for a cross-provider database dump containing user data.

## 31.3 Retention example

Within R2 free capacity, start with:

```text
daily   7
weekly  4
monthly 3
```

Adjust based on observed DB size.

## 31.4 Recovery objectives

Portfolio targets:

```text
RPO <= 24h
RTO measured from restore drill; do not invent target until first drill
```

Record actual restore duration and failure points.

---

# 32. Cost and quota control

## 32.1 Target steady-state recurring cost

Target:

```text
$0/month out-of-pocket
```

while inside:

- Vercel Hobby;
- Workers Free;
- R2 Free;
- Queues Free;
- Supabase Free;
- HCP Terraform Free;
- Grafana Cloud Free;
- Azure Container Apps monthly free grants + Azure Student credit safety margin.

This is a target, not a guarantee.

## 32.2 Quota dashboard/doc

Maintain:

```text
docs/cost/quota-budget.md
```

Track at least:

| Platform | Quota to watch | Internal warning |
|---|---|---|
| Workers | 100k requests/day | 70% |
| Worker CPU | 10ms/request | p95 7ms |
| Queues | 10k ops/day | 70% |
| R2 | 10GB + operations | 70% |
| Supabase DB | 500MB | 70% |
| Supabase EF | 500k invocations/mo | 70% |
| Supabase egress | current free allowance | 70% |
| Vercel | CPU/invocations/transfer | 70% |
| Azure | remaining student credit + ACA free grants | 70%; hard STOP before credit exhaustion |
| HCP TF | 500 resources | 70% |
| Grafana | telemetry quotas | 70% |
| Open-Meteo | 600/min, 5k/hour, 10k/day, 300k/month + non-commercial licence | 70% |
| Workers Logs | 200k events/day, 3-day retention | 70% |
| Workers Analytics Engine | 100k writes/day, 10k SQL reads/day, 3-month retention; billing status is time-sensitive | 70% |
| Grafana Synthetics | 100k API + 10k browser executions/month | 70% |

## 32.3 Cost regression rule

A PR that changes infrastructure must state:

```text
cost_effect:
  current: "..."
  proposed: "..."
  free_tier_impact: "..."
```

If the project starts requiring a permanent paid subscription, create an ADR before enabling it.

Azure-specific cost invariant: the ACA environment defaults to log destination `none`; enabling Log Analytics/Azure Monitor persistence is a cost-bearing design change and requires an ADR/quota update.

Open-Meteo-specific licence invariant: public deployment must retain required attribution and non-commercial status while using the Free endpoint.

---

# 33. Runbooks required

```text
docs/runbooks/
├── high-api-error-rate.md
├── high-api-latency.md
├── weather-provider-outage.md
├── worker-cpu-limit.md
├── supabase-project-paused.md
├── supabase-function-failure.md
├── rls-authorization-incident.md
├── queue-backlog.md
├── notification-dlq.md
├── failed-worker-canary.md
├── worker-analytics-gate-insufficient-data.md
├── supabase-dependency-synthetic-failure.md
├── vercel-rollback.md
├── azure-job-failure.md
├── azure-student-credit-exhaustion.md
├── backup-failure.md
├── restore-database.md
├── stale-backup.md
├── r2-access-incident.md
├── credential-rotation.md
└── third-party-platform-outage.md
```

Runbook format:

```text
Summary
User impact
Detection
Relevant dashboards/logs
Immediate mitigation
Diagnosis
Recovery
Rollback
Security considerations
Escalation
Evidence to preserve
Post-incident follow-up
```

---

# 34. Threat model minimum coverage

## Assets

- user accounts;
- saved locations;
- alert preferences;
- notification destinations;
- database;
- RLS policies;
- Supabase secret keys / legacy `service_role` credentials;
- R2 backups;
- GitHub repository/workflows;
- Terraform state;
- Cloudflare/Vercel/Supabase API tokens;
- Azure federated identities;
- OCI artifacts;
- deployment metadata.

## Trust boundaries

```text
browser -> Vercel
browser -> Cloudflare
Cloudflare -> Supabase
Cloudflare -> weather provider
Supabase -> Cloudflare Queue
Queue -> notification provider
Azure -> Supabase/R2
GitHub/HCP -> cloud control planes
```

## Required threat mappings

Each identified threat must map to:

```text
control
verification/test
evidence
residual risk
owner
```

Threat model prose without executable/testable mitigations is incomplete.

---

# 35. Interview evidence plan

## 35.1 Recommended 12-minute demo

### Minute 0–2 — Product

Show:

- polished weather dashboard;
- saved locations;
- planner;
- one alert rule.

### Minute 2–4 — Architecture decision

Explain:

```text
Vercel frontend
Cloudflare edge/cache
Supabase Postgres/Auth/Functions
Cloudflare Queue/R2
Azure scale-to-zero containers
```

Then explain why GKE was removed: workload economics and operational proportionality.

### Minute 4–6 — CI/DevSecOps

Show one PR:

```text
lint/typecheck
unit/integration
local Supabase
RLS tests
SAST
secret scan
IaC scan
SBOM
container scan
HCP Terraform plan
```

### Minute 6–8 — Progressive backend delivery

Show:

```text
stable Worker -> api-old
candidate Worker -> api-new
10% traffic split
version/release IDs
rollback
```

Explain expand/contract DB migration compatibility.

### Minute 8–10 — Data reliability/security

Show:

- RLS cross-user deny test;
- Queue duplicate/DLQ test;
- latest R2 backup manifest;
- successful restore drill.

### Minute 10–12 — Containers + observability

Show:

- GHCR immutable digest;
- Trivy/SBOM/Cosign evidence;
- Azure Container Apps Job execution;
- Grafana SLO/dependency-synthetic dashboard;
- Cloudflare Analytics Engine candidate-vs-stable query/result;
- one failure postmortem.

## 35.2 Questions you must be able to answer

- Why Worker + Supabase Edge Function instead of one backend?
- What happens when a Worker exceeds 10ms CPU?
- Why not pay $5 for Workers Paid?
- Why not Kubernetes?
- Why R2 instead of Supabase Storage for backups?
- Why Cloudflare Queue instead of Supabase Queue?
- What happens when queue retention expires?
- How do you prevent duplicate alerts?
- How does RLS differ from API authorization?
- Why are Supabase secret keys (and legacy `service_role`) dangerous?
- How do DB migrations work while old/new functions both serve traffic?
- How does Worker canary cover a Supabase function release?
- Why can't you claim Vercel canary on Hobby?
- What is the frontend rollback limitation on Hobby?
- Why Azure Container Apps if the main app is serverless elsewhere?
- Why public GHCR?
- How does GitHub authenticate to Azure?
- Where do Cloudflare/Supabase/Vercel Terraform credentials live?
- What is your actual RPO/RTO from the last restore test?
- What fails if Supabase pauses?
- Which telemetry cannot be exported natively from Workers Free, and how do Workers Analytics Engine + Grafana Synthetics mitigate that limitation?
- What would make you upgrade to Workers Paid/Supabase Pro/Vercel Pro?
- What would make Kubernetes justified later?

---

# 36. “Substance” checklist — avoid résumé theater

Disallowed patterns:

- saying “microservices” because there are multiple serverless functions;
- saying “GitOps” without reconciliation;
- saying “zero downtime” without tested evidence;
- saying “HA” on free-tier single-project managed services;
- saying “distributed tracing” if Cloudflare spans are not actually exported/correlated;
- adding Kafka for notifications;
- adding Redis when Cache API is sufficient;
- adding D1 merely because Cloudflare offers it while PostgreSQL is the chosen source of truth;
- adding both Supabase Queue and Cloudflare Queue without different requirements;
- creating an Azure always-on API merely to list Azure;
- deploying a Kubernetes cluster merely to list Kubernetes;
- using Terraform to manage SQL schema;
- enabling paid observability just for screenshots;
- storing backups in Git;
- claiming supply-chain security when signatures are never verified/inspected;
- generating an SBOM but never attaching it to a release/evidence trail;
- using security scanners only in advisory mode forever;
- claiming cost efficiency without tracking free-tier quota and Azure credit usage.

A component must earn its existence through a requirement, risk reduction, measurable performance benefit, or explicit educational objective.

---

# 37. Migration map from v1 GKE plan

| v1 | v2 replacement | Status |
|---|---|---|
| React/Vite | Next.js/TypeScript on Vercel | replace |
| FastAPI/Python | Hono/TypeScript | replace |
| GKE | CF Workers + Supabase EF + Azure ACA | remove primary cluster |
| Cloud SQL | Supabase Postgres | replace |
| Memorystore | Cloudflare Cache API | replace |
| Pub/Sub | Cloudflare Queues | replace |
| Cloud Scheduler/CronJob | Supabase Cron / ACA Jobs | replace |
| GCS objects | R2 | replace |
| Artifact Registry | GHCR | replace |
| Argo CD | GitHub Actions + provider deployments | remove |
| Argo Rollouts | Worker gradual deploy + ACA revisions | replace |
| Binary Authorization | CI signature/attestation + protected release | reduced/replace |
| GCP WIF | GitHub/Azure + HCP/Azure OIDC | replace |
| Secret Manager | platform secrets + optional Azure Key Vault | replace |
| Managed Prometheus/Cloud Trace | Grafana Cloud + platform-native logs/OTel | replace |
| Cloud Armor | Cloudflare edge controls/Turnstile | replace |
| Helm/K8s manifests | Wrangler/Supabase/Vercel/ACA config | remove |

## 37.1 Concepts deliberately preserved

- PR governance;
- CI quality gates;
- SAST/secret/dependency/IaC scanning;
- immutable release identity;
- SBOM/signing/attestation;
- least-privilege cloud identity;
- IaC;
- progressive delivery;
- rollback;
- environment separation;
- observability/SLOs;
- queues/retries/DLQ;
- backup/restore;
- game days/postmortems;
- cost controls;
- evidence-based CV claims.

---

# 38. CV evidence / claim rules

Never use a number on a résumé unless the repository contains reproducible evidence.

Good patterns after measurement:

```text
Designed a serverless-first multi-cloud delivery architecture using
Cloudflare Workers, Supabase, Vercel, and Azure Container Apps,
reducing idle compute requirements while preserving progressive delivery,
IaC, security gates, and disaster-recovery testing.
```

```text
Implemented progressive backend delivery by coupling Cloudflare Worker
version traffic splits with release-versioned Supabase Edge Functions and
expand/contract PostgreSQL migrations, enabling tested rollback during mixed-version traffic.
```

```text
Built a DevSecOps pipeline with RLS security tests, CodeQL/Semgrep,
Gitleaks, Trivy, SBOM generation, Cosign signing, Terraform plans,
and immutable container promotion.
```

Measured claim template:

```text
Reduced upstream weather-provider calls by X% using edge caching while
maintaining p95 latency of Y ms at Z RPS in a reproducible k6 workload.
```

Only fill `X/Y/Z` from recorded evidence.

---

# 39. Research references

Primary sources used for v2 architecture (revalidate periodically):

## Cloudflare

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Worker versions/deployments: https://developers.cloudflare.com/workers/versions-and-deployments/
- Worker preview URLs: https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/
- Worker gradual deployments: https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/
- Worker version affinity: https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/version-affinity/
- Worker version overrides: https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/
- Worker rollbacks: https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
- Worker logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Worker OTel export limitations: https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/
- Workers Analytics Engine: https://developers.cloudflare.com/analytics/analytics-engine/
- Workers Analytics Engine pricing: https://developers.cloudflare.com/analytics/analytics-engine/pricing/
- Workers Analytics Engine limits/retention: https://developers.cloudflare.com/analytics/analytics-engine/limits/
- Workers Analytics Engine SQL API: https://developers.cloudflare.com/analytics/analytics-engine/sql-api/
- Workers Analytics Engine Grafana integration: https://developers.cloudflare.com/analytics/analytics-engine/grafana/
- Worker version metadata binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/
- Queues: https://developers.cloudflare.com/queues/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- Pull consumers: https://developers.cloudflare.com/queues/configuration/pull-consumers/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Turnstile plans: https://developers.cloudflare.com/turnstile/plans/

## Supabase

- Pricing: https://supabase.com/pricing
- Billing/free project limits: https://supabase.com/docs/guides/platform/billing-on-supabase
- Free project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Edge Function limits: https://supabase.com/docs/guides/functions/limits
- Database migrations: https://supabase.com/docs/guides/deployment/database-migrations
- API keys: https://supabase.com/docs/guides/getting-started/api-keys
- API-key migration: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- Database connectivity/poolers: https://supabase.com/docs/guides/database/connecting-to-postgres
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Database tests/pgTAP: https://supabase.com/docs/guides/local-development/testing/overview
- Scheduling Edge Functions: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase Cron: https://supabase.com/docs/guides/cron
- Supabase Queues: https://supabase.com/docs/guides/queues
- Backups: https://supabase.com/docs/guides/platform/backups
- CLI backup/restore: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Automated backup example: https://supabase.com/docs/guides/deployment/ci/backups
- Terraform provider: https://supabase.com/docs/guides/deployment/terraform

## Vercel

- Hobby plan: https://vercel.com/docs/plans/hobby
- Limits: https://vercel.com/docs/limits
- Git deployments/previews: https://vercel.com/docs/git
- GitHub Actions deployment: https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel
- `vercel build`: https://vercel.com/docs/cli/build
- `vercel deploy --prebuilt`: https://vercel.com/docs/cli/deploy
- rollback: https://vercel.com/docs/cli/rollback
- rolling releases (paid limitation): https://vercel.com/docs/rolling-releases
- OpenTelemetry instrumentation: https://vercel.com/docs/tracing/instrumentation

## Azure

- Azure for Students: https://learn.microsoft.com/en-us/azure/education-hub/about-azure-for-students
- Azure Education/student credit exhaustion FAQ: https://learn.microsoft.com/en-us/azure/education-hub/azure-dev-tools-teaching/program-faq
- Container Apps pricing/billing: https://learn.microsoft.com/en-us/azure/container-apps/billing
- Container Apps logging options: https://learn.microsoft.com/en-us/azure/container-apps/log-options
- Container Apps environment lifecycle: https://learn.microsoft.com/en-us/azure/container-apps/environment
- Container Apps revisions: https://learn.microsoft.com/en-us/azure/container-apps/revisions
- Container Apps jobs: https://learn.microsoft.com/en-us/azure/container-apps/jobs
- Container Apps networking/traffic splitting: https://learn.microsoft.com/en-us/azure/container-apps/networking
- Container Apps secrets/Key Vault: https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets
- GitHub OIDC to Azure: https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure

## Terraform/HCP

- HCP Terraform plans/features: https://developer.hashicorp.com/terraform/cloud-docs/overview
- HCP dynamic provider credentials: https://developer.hashicorp.com/terraform/cloud-docs/dynamic-provider-credentials
- HCP Azure dynamic credentials: https://developer.hashicorp.com/terraform/cloud-docs/dynamic-provider-credentials/azure-configuration
- Vercel Terraform provider: https://registry.terraform.io/providers/vercel/vercel/latest

## GitHub Actions / supply chain

- Actions workflow hardening: https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats
- Artifact attestations: https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations

## Weather provider

- Open-Meteo pricing/limits: https://open-meteo.com/en/pricing
- Open-Meteo terms/non-commercial limits: https://open-meteo.com/en/terms
- Open-Meteo API/data attribution: https://open-meteo.com/

## Observability

- Grafana Cloud pricing/free tier: https://grafana.com/pricing/
- Grafana Synthetic Monitoring usage/pricing: https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/synthetic-monitoring/
- Grafana Cloud OpenTelemetry ingest: https://grafana.com/docs/opentelemetry/ingest/
- Next.js Grafana instrumentation: https://grafana.com/docs/grafana-cloud/observe-and-act/monitor-applications/frontend-observability/get-started/instrument-nextjs/

## Secondary community input

Community discussions were used only as secondary qualitative input. Recurring themes included:

- Workers + Postgres/Supabase is a common lightweight edge architecture;
- Supabase Edge Functions can be useful for DB-adjacent and background tasks but some developers report latency variability, reinforcing the decision to keep public fast-path traffic at Cloudflare;
- edge functions are best for short stateless work, with long-running jobs moved elsewhere;
- overbuilding Kubernetes for small portfolio traffic can create more operational cost than value.

Community reports are not treated as platform guarantees.

---

# 40. Final architecture invariants

## 40.1 Final DevSecOps blocker assessment

**Final validation status: `GO` — zero known red DevSecOps blockers.**

The remaining constraints are accepted platform/free-tier boundaries, not workflow blockers:

| Constraint | Status | Mitigation |
|---|---|---|
| Workers Free cannot natively export Worker telemetry over OTLP | ACCEPTED | Workers Logs/native traces + Workers Analytics Engine + request/release correlation + Grafana Synthetics |
| Supabase Free has no remote DB branch per PR and may pause | ACCEPTED | local Supabase for PR DB tests + staging project + real external dependency synthetic + pause runbook |
| Some SaaS deploy APIs require scoped static API tokens | ACCEPTED | protected environments/HCP sensitive vars, least scope, rotation, OIDC wherever supported (Azure) |
| Free tiers do not provide enterprise multi-region HA/SLA | ACCEPTED | honest portfolio SLOs, managed failure-domain separation, backups/restore, documented commercial upgrade path |

None of these prevents Atmos from demonstrating modern hybrid DevSecOps: gated CI, IaC, supply-chain verification, federated identity where available, RLS security testing, immutable/versioned releases, progressive delivery with automated analysis, async retry/DLQ/idempotency, SLO/synthetic monitoring, disaster recovery, cost controls, and incident evidence.

The following statements must remain true unless superseded by an ADR:

1. **TypeScript/Hono** is the backend language/framework baseline.
2. **One monorepo** is the source repository.
3. **Vercel Hobby** serves the Next.js frontend.
4. **Cloudflare Workers Free** is a thin edge/gateway/cache layer, not the heavy business-compute layer.
5. **Supabase Edge Functions** host authenticated/DB-heavy business API logic.
6. **Supabase Postgres + RLS** is the durable application data and authorization core.
7. **Cloudflare Queues** is transport; Postgres remains durable notification truth.
8. **Cloudflare R2** stores backups/large exports.
9. **Azure Container Apps/Jobs** is the scale-to-zero container escape hatch.
10. **GitHub OIDC** is used for Azure deployment authentication.
11. **HCP Terraform Free** owns Terraform state/remote plans; SQL schema is migrations, not Terraform.
12. Backend progressive delivery uses **Cloudflare Worker versions + release-versioned Supabase functions**.
13. Database deployment uses **expand/contract** when old and new code coexist.
14. Frontend Hobby deployment is preview/staged/rollback, **not canary**.
15. Free-tier limitations are documented rather than hidden.
16. Backups are externally generated and restore-tested because Supabase Free has no automatic backups.
17. The project does not call itself GitOps unless a future reconciliation controller is actually introduced.
18. No technology is added solely as a CV keyword.
19. Open-Meteo Free use remains **non-commercial, quota-aware, and visibly attributed** until the provider contract changes.
20. Azure deploys verify the **Cosign signature/expected identity on the exact immutable GHCR digest** before deployment.
21. Protected GitHub workflows use explicit least permissions and pin third-party Actions to full commit SHAs.
22. Supabase new code uses **publishable/secret keys**, not newly introduced legacy `anon`/`service_role` dependencies.
23. Workers Free observability limitations are stated honestly: native logs/traces + Workers Analytics Engine + external synthetics provide real edge/release observability, with no false claim of native external OTel export.
24. Backup archives are encrypted before R2 upload and restore-tested using a recoverable key-management procedure.
25. The Azure Student container lane is optional/recreatable; exhausted credit blocks Azure tasks and never triggers an automatic pay-as-you-go upgrade.
26. Production Worker promotion requires WAE/synthetic `PASS`; `FAIL` rolls back and `INSUFFICIENT_DATA` holds rather than auto-promoting.
27. `/health/dependencies` exercises the real Supabase dependency and exposes only coarse health, never sensitive diagnostics.

---

# End of master plan
