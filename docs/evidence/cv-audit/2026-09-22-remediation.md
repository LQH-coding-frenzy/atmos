# CV Audit Remediation Evidence

Result: complete. The live CV dashboard, release gates, weather normalization, workflow safety,
and retained-resource controls identified by the 2026-09-22 audit were remediated without a
database migration, a queue/Azure recreation, a backup credential rotation, or paid-resource work.

## Protected Changes

- PR [#223](https://github.com/LQH-coding-frenzy/atmos/pull/223) merged as
  `96dc5f96274c7950f83799ebeefeb646730f00f1`. It made the dashboard dynamic, validated
  Open-Meteo response shape and Unix timestamps, selected future hourly forecasts, canonicalized
  weather cache keys, hardened API proxy errors, added a normal Edge Runtime release workflow,
  protected retained Terraform resources, and corrected operational documentation.
- PR [#224](https://github.com/LQH-coding-frenzy/atmos/pull/224) merged as
  `94bb2a922f48aeab58d5c249d5f3050f10d18619`. Vercel production SSR now uses the verified
  Workers hostname and retains `ATMOS_GATEWAY_URL` only for local and CI overrides.
- PR [#225](https://github.com/LQH-coding-frenzy/atmos/pull/225) merged as
  `495be8777fb60f020f3ac0f9ed4cd95cd67df789`. The credential-free public content smoke runs
  every 15 minutes and rejects an HTTP-200 unavailable page.

## Release And Provider Verification

- `Release Edge Runtime` run
  [`35716196806`](https://github.com/LQH-coding-frenzy/atmos/actions/runs/35716196806)
  succeeded from `96dc5f96274c`: versioned Supabase candidate smoke, zero-percent Worker
  candidate smoke, Worker promotion, and canonical API update all completed.
- The initial content-aware Vercel run
  [`35716347087`](https://github.com/LQH-coding-frenzy/atmos/actions/runs/35716347087)
  correctly blocked its candidate before promotion because it lacked live-weather content.
- Vercel production release
  [`35717427236`](https://github.com/LQH-coding-frenzy/atmos/actions/runs/35717427236)
  successfully built, content-smoked, and promoted `94bb2a922f48`; both candidate and public
  domain contained live weather content.
- `Live showcase content smoke` run
  [`35718524348`](https://github.com/LQH-coding-frenzy/atmos/actions/runs/35718524348)
  succeeded on GitHub-hosted infrastructure.
- HCP Terraform plans
  [`run-thMyguXPz84WL3sq`](https://app.terraform.io/app/atmos_uit/atmos-edge-production/runs/run-thMyguXPz84WL3sq)
  and
  [`run-KRLdeg97ejwQzVKm`](https://app.terraform.io/app/atmos_uit/atmos-azure-production/runs/run-KRLdeg97ejwQzVKm)
  reported no changes after adding `prevent_destroy` to the retained custom domain, R2 archive,
  and backup Container Instance.

## Final Public Checks

- `https://rainify.dpdns.org/` returned live Berlin weather HTML, did not contain the unavailable
  fallback, and rendered with no browser-console errors at desktop and 390 px mobile widths.
- Mobile verification found no horizontal overflow; the closed drawer began keyboard focus at the
  visible menu control and the opened drawer reported its expanded state.
- `https://api.rainify.dpdns.org/health/dependencies` returned healthy database status.
- Worker `/version` returned release `96dc5f96274c`.
- The public weather response reported a UTC observation instant, seven daily entries, and an hourly
  sequence beginning after the current observation. Equivalent requests with ignored query parameters
  shared the canonical cache key and returned a cache hit.

## Operating Boundary

- The staging Worker is explicitly not maintained as a dependency-ready release lane; it was not
  recreated or represented as healthy.
- The encrypted R2 archive and verified ephemeral restore remain one-time CV evidence. Recurring
  backup freshness, restore exercises, paging, percentage-based canaries, and new paid resources
  remain deferred by the CV showcase profile.
- Backup bootstrap and ephemeral restore cleanup were not run. Their new Production-environment,
  typed-confirmation, role, and provenance safeguards were validated in protected CI only.
