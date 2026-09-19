# Atmos CV Showcase Completion Handoff

Updated: 2026-09-13 11:28 UTC

## Scope Override

The owner changed Atmos from an end-to-end production-completion effort to a CV showcase on 2026-09-20. This document's earlier production-continuation directive is superseded.

Keep the deployed application and existing evidence, but do not pursue recurring backup schedules, R2 lifecycle retention, continuous DR operations, additional paid-resource work, or remaining production-only Section 29 tasks unless the owner explicitly reopens production hardening.

The showcase includes a successful encrypted R2 archive and an ephemeral Supabase restore drill. Temporary restore resources and sensitive handoffs were deleted after verification.

## Historical Continuation Directive

Continue canonical Atmos master-plan execution until the project is a complete live production service. Do not stop after ordinary task completion or milestones. Stop only for a master-plan hard stop, a genuine external blocker, or an explicit owner pause.

Before editing a Section 29 task:

1. Read `AGENTS.md` and `.opencode/continuation-policy.md`.
2. Load the `atmos-task` skill.
3. Read the master-plan front matter and Sections 0, 4, 6, 7, 18, 19, 20, 23, 28, and the selected Section 29 row.
4. Confirm every exact dependency is `DONE` in `.agent/status.yaml`.
5. Implement one canonical task at a time, validate it, preserve evidence, and merge through protected `main`.

The owner explicitly authorized continued end-to-end production completion on 2026-09-13. This does not override hard stops for paid resources, meaningful Azure credit, secret creation/rotation, destructive production Terraform or database work, weakened RLS/security, impaired rollback, new vendors, stale backup policy before destructive data work, or Worker p95 CPU above 7 ms.

Provider dashboard rule: ask the owner before any provider web-dashboard interaction. Do not use Playwright for provider dashboards.

Never read or print secret values, `.env` contents, JWTs, cookies, provider credentials, or user payloads. Secret and variable names are safe to inventory.

## Safe Current Production State

- Git branch: `main`
- Protected `main` SHA: `2e9ab6c3c0a1d92bcaa61736c784bc8fec75a25e`
- Latest commits:
  - `2e9ab6c` Merge PR #138, fixed Worker rollback for changed version secrets
  - `2de6909` Merge PR #137, added controlled GAME-002 canary failure
  - `bcc48a3` Merge PR #136, blocked truncated REL-007 Worker inventories
  - `61f0b43` Merge PR #135, finalized REL-007 evidence
- Production Worker URL: `https://atmos-gateway.rainify.workers.dev`
- Current deployment: `e5d82173-6362-45d3-9fd2-5e88ab465b57`
- Current deployment time: `2026-09-13T11:27:35.143152Z`
- Current traffic: stable Worker `57d8764d-c7e2-41d2-9e46-00c74f17f4c6` at 100 percent, no candidate traffic
- Current stable release: `a794b540e4dc`
- Post-rollback verification:
  - `/health`: HTTP 200, `status=ok`
  - `/health/dependencies`: HTTP 200, database `ok`
  - `/version`: `a794b540e4dc`
  - public weather: HTTP 200
  - unauthenticated `/api/v1/me`: HTTP 401
  - Grafana synthetic gate: `PASS`; frontend, edge, dependencies, and weather were all fresh and successful
- Protected rollback run `34754470476` succeeded from exact SHA `2e9ab6c3c0a1d92bcaa61736c784bc8fec75a25e`.
- Rollback run job: `https://github.com/LQH-coding-frenzy/atmos/actions/runs/34754470476/job/103716402620`

Production is safe at handoff. Do not re-expose the GAME-002 candidate merely to collect more evidence.

## Current Task: GAME-002

`.agent/status.yaml` and `.agent/tasks/game-002.yaml` currently say `GAME-002: IN_PROGRESS`.

GAME-002 has completed the live exercise. Remaining work is source cleanup, evidence, task status, protected checks, and merge.

### Identities

- Stable Worker: `57d8764d-c7e2-41d2-9e46-00c74f17f4c6`
- Stable release/function: `a794b540e4dc` / `api-a794b540e4dc`
- Exercised candidate Worker: `5ed169c2-8263-42d3-bde7-8a9148d4f2ff`
- Candidate release/function: `2de69093b70d` / `api-2de69093b70d`
- Candidate function is active and release-matched.
- Unused first upload: Worker `73813673-c218-4f42-9bc7-cd9c12a2a258`, also tagged `2de69093b70d`. It inherited the prior backend URL, was never deployed, and must not be confused with the exercised candidate.

### Exercise Timeline

- PR #137 merged the deployment-only fault hook as `2de6909` after every protected check passed.
- Production `api-2de69093b70d` was deployed and returned health HTTP 200 plus exact release `2de69093b70d`.
- Deployment `2f12b184-0e71-4342-bee6-25fc27e07050` held stable at 100 percent and candidate at zero percent.
- Candidate override smoke passed health, dependency health, release identity, and unauthenticated 401 checks. Its weather route returned the intended sanitized HTTP 503 `WEATHER_UNAVAILABLE`; ordinary stable weather remained HTTP 200.
- Generated 40 stable override samples and 40 candidate override samples at zero percent. The failing branch does not call Open-Meteo.
- WAE run `34753803679` returned expected `FAIL` before exposure:
  - stable: 54 samples, error rate 0, p95 wall 945 ms
  - candidate: 45 samples, error rate 0.9111111111111111, p95 wall 0 ms
  - allowed error rate: 0.02
- First 90/10 deployment `a9c24e9c-142b-4e9a-bc48-08fb16d63fba` ran from `2026-09-13T11:13:35Z` until emergency rollback deployment `803b4e4a-e699-4986-8aab-ff87f9257333` at `11:16:50Z`.
- WAE run `34753896861` returned the expected deterministic `FAIL` at 10 percent.
- Initial protected rollback run `34753940171` passed plan and stable-target smoke but failed deployment with Cloudflare code `10220`: `versions deploy` cannot restore a prior version after `SUPABASE_FUNCTION_URL` changed.
- Documented emergency `wrangler rollback --yes` restored stable-only deployment `803b4e4a-e699-4986-8aab-ff87f9257333`. All recovery smoke passed.
- PR #138 changed the protected workflow to Cloudflare's dedicated `wrangler rollback` primitive, added a regression test, and merged as `2e9ab6c` after every protected check passed.
- Second 90/10 deployment `b46934b6-cc69-4c01-b8fe-03e3cf31f3ff` ran from `2026-09-13T11:23:50Z` until protected rollback deployment `e5d82173-6362-45d3-9fd2-5e88ab465b57` at `11:27:35Z`.
- The second deployment's provider message is accidentally `GAME-nub?/not`; the immutable deployment ID, split, identities, gate run, and rollback run are authoritative. Preserve this fact rather than rewriting history.
- WAE run `34754362450` returned expected `FAIL`:
  - stable: 63 samples, error rate 0, p95 wall 874 ms
  - candidate: 45 samples, error rate 0.9111111111111111, p95 wall 0 ms
  - allowed error rate: 0.02
- Fixed protected rollback run `34754470476` passed plan, target smoke, rollback, deployment verification, and recovered-path smoke.
- Final deployment `e5d82173-6362-45d3-9fd2-5e88ab465b57` is stable-only 100 percent.

### Immediate Next Changes

Create a completion branch from current `main`, for example `docs/game-002-finalize`, then:

1. Remove `GAME_DAY_FAILURE_MODE` from `Bindings` in `workers/gateway/src/index.ts`.
2. Remove the controlled failure branch from the weather handler.
3. Remove the GAME-002 fault-hook unit test from `workers/gateway/src/index.test.ts`.
4. Update `docs/operations/worker-bad-canary-game-day.md` to state that the source hook was removed after the exercise and must be reintroduced only through a new protected game-day PR.
5. Add `docs/evidence/game-002/2026-09-13.md` with the exact timeline and metrics above, including the first failed rollback and corrective PR #138.
6. Mark GAME-002 `DONE` in `.agent/status.yaml` and `.agent/tasks/game-002.yaml`.
7. Validate focused gateway/analytics tests, gateway dry-run build, root lint/typecheck, formatting, runbook validation, and `git diff --check`.
8. Open a PR, wait for all protected checks, and merge. Do not redeploy the fault-hook removal just for the exercise; current stable production never contains the hook.

After GAME-002 is `DONE`, implement `DOC-002` as the blameless postmortem for this incident. Include the Cloudflare `10220` discovery, why preflight did not model changed version secrets, the emergency recovery, the workflow correction, and prevention/tests. `DOC-002` depends only on GAME-002.

## REL-006 Worker Rollback

REL-006 is `DONE`.

- PR #132 merged protected plan/execute rollback automation as `78b55ce`.
- Plan run `34751091484` validated production credentials and retained target inventory without changing traffic.
- PR #133 finalized evidence as `65dc1cb`.
- Production secret name `CLOUDFLARE_API_TOKEN` and variable `CLOUDFLARE_ACCOUNT_ID` are configured in GitHub environment `Production`; values were never read or committed.
- PR #138 corrected execution to `wrangler rollback` so versioned secret changes are restored safely.
- Relevant files:
  - `.github/workflows/worker-rollback.yml`
  - `scripts/worker-rollback.mjs`
  - `scripts/worker-rollback.test.mjs`
  - `docs/operations/worker-rollback.md`
  - `docs/evidence/rel-006/2026-09-13.md`

## REL-007 Function Cleanup

REL-007 is `DONE`.

- PR #134 merged a live fail-closed cleanup guard as `5703f08`.
- The guard protects `api-v1` plus every release function mapped by retained Worker tags, requires at least three retained release functions, validates deployment/version consistency, accepts only exact lowercase release slugs, and combines fresh planning with exact deletion.
- Removed only unreferenced production functions `api-1163da002bf4` and `api-536fd3697b60`.
- Final probes returned HTTP 404 for both removed functions and HTTP 200 for every protected health route.
- PR #135 finalized evidence as `61f0b43`.
- Wrangler documents that `versions list` returns only 10 recent versions. PR #136 added a fail-closed limit: cleanup blocks if 10 versions are returned rather than risking a truncated rollback inventory.
- Production now has five retained Worker versions, so the guard remains usable. Two Workers share candidate tag `2de69093b70d`; this maps conservatively to one retained function.
- Current active production functions:
  - `api-v1`
  - `api-763e8c651218`
  - `api-43ba87155532`
  - `api-a794b540e4dc`
  - `api-2de69093b70d`
- Retain `api-2de69093b70d` through GAME-002 and DOC-002 review.
- Relevant files:
  - `scripts/supabase-function-cleanup.mjs`
  - `scripts/supabase-function-cleanup.test.mjs`
  - `docs/operations/supabase-function-cleanup.md`
  - `docs/evidence/rel-007/2026-09-13.md`

## Other Recently Completed Production Work

- SLO-001 merged through PR #126 as `a6106d8`; production frontend, edge, dependency, and weather synthetics exist.
- REL-004 progressive production rollout completed and finalized through PR #128.
- SLO-002 implementation merged through PR #129 and final evidence through PR #130 as `49693be`:
  - availability SLO UUID `jcmsyyihfk6uhgi19d5m7`
  - client latency SLO UUID `evgiwsqi2ipq6tgr2p4nm`
  - 30 generated rules healthy; burn alerts inactive at validation
  - final one-hour availability and latency-success ratios were both 1.0
- DOC-001 merged through PR #131 as `e50af11`:
  - 21 required production incident runbooks
  - every runbook has all 12 required sections
  - `scripts/validate-runbooks.mjs` is enforced by formatting checks
- `.agent/status.yaml` is authoritative for the broader completed task set. Governance, repository baseline, domain, auth/RLS, Supabase APIs, product features, Worker/cache/performance/load, async queues, CI/security, previews, release baseline, observability baseline, SLOs, and GAME-001/003/004/005 are marked `DONE`.

## Configured Provider Control Names

GitHub `Production` environment:

- secret `CLOUDFLARE_API_TOKEN`
- secret `VERCEL_TOKEN`
- variable `CLOUDFLARE_ACCOUNT_ID=50f15456a2d4abf3186c504f406da3fe`
- variable `PRODUCTION_URL=https://rainify.dpdns.org`
- variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_SCOPE`

GitHub `Staging` environment:

- secret `CLOUDFLARE_ANALYTICS_TOKEN`
- the WAE workflow has a working `CLOUDFLARE_ACCOUNT_ID` variable

The current shell has working `GRAFANA_URL` and `GRAFANA_SERVICE_ACCOUNT_TOKEN` environment entries. Test only for presence and run the sanitized gate; do not print their values.

## Remaining Production Gaps And Blockers

Use the Section 29 backlog and exact dependency checks rather than treating this list as a replacement plan.

- `DOC-002`: ready immediately after GAME-002 becomes `DONE`.
- `REL-005`: blocked by absent production custom hostname and Cloudflare request-header Transform Rule. It requires provider/DNS ownership and must follow the provider-dashboard rule.
- Frontend live-data activation is unfinished: `apps/web/app/page.tsx` still uses `MockWeatherProvider`. Final production must switch the dashboard to the live gateway with contract, failure, responsive, build, E2E, and protected Vercel production evidence.
- `TF-001`, `TF-002`, `CF-IAC-001`, `SUPA-IAC-001`, and `VERCEL-IAC-001`: HCP Terraform organization/workspaces and credentials are unavailable.
- `GHCR-001`, `CTR-001`, `CTR-002`, and `CTR-003`: not started. These are likely the next safe local/protected-CI chain after DOC-002 because they can establish immutable container publishing, hardening, image scan/SBOM, signing, and exact-digest verification before Azure exists.
- `AZ-001`, `AZ-OIDC-001`, `AZ-TF-OIDC-001`, `AZ-IAC-001`, `AZJOB-001`, `AZJOB-002`, `OBS-005`, and `GAME-007`: blocked until Azure for Students status, remaining credit, budget alert, and tooling are verified. Never upgrade to pay-as-you-go.
- `R2BACK-001`, `BACKUP-001`, `BACKUP-002`, `RESTORE-001`, and `GAME-006`: Cloudflare R2 is disabled with provider error `10042`; Azure backup execution is also unavailable. Supabase Free has no automatic backup, so this remains a production-completion blocker.
- `OBS-003` Vercel OTel and `OBS-004` Supabase app telemetry are not started; `OBS-005` depends on Azure.
- Grafana alerts are visible in Grafana but no approved external notification receiver/contact point exists.
- `PORT-001` and `PORT-002` remain blocked by container supply-chain and backup/restore dependencies.
- Production API still uses the `workers.dev` hostname; custom API DNS/TLS and version-affinity controls are absent.
- Open-Meteo Free use must remain non-commercial with attribution and quota controls.
- Private vulnerability reporting remains disabled.
- An unintended Supabase project `axcigtnxaulqcbegmqhw` was previously observed and is not confirmed deleted. Provider dashboard action requires owner involvement.

## Recommended Task Order

1. Finalize GAME-002 without re-exposure.
2. Complete DOC-002 postmortem.
3. Re-evaluate all dependency-ready tasks from Section 29.
4. Prefer safe GHCR/container supply-chain work while HCP, Azure, R2, custom-domain, and external-alert blockers remain.
5. Complete live frontend gateway activation and protected Vercel production promotion.
6. Ask the owner only when a hard-stop dependency or provider dashboard action is actually reached.
7. At the true permitted end, report completed production capabilities and exact externally blocked items.

## Git And Workspace Safety

Current branch is `main`. There are no active Atmos feature PRs; only older Dependabot PRs are open.

Preserve these unrelated local items exactly; do not stage, edit, delete, or revert them:

- modified `.opencode/continuation-policy.md`
- untracked `.playwright-mcp/`
- untracked `weather-dashboard-image-example.png`
- untracked `weather-dashboard-rough-design-example/`

This handoff file, `PRODUCTION-CONTINUATION.md`, is intentionally created for the next chat and may also be untracked. Stage only canonical task files when committing.

Configured reviewer/task-planner subagents currently fail with `Model not found: openrouter/z-ai/glm-5.2:free`. Attempt required reviews when appropriate, then perform a documented manual review and rely on protected CodeQL, Gitleaks, Semgrep, Trivy, SBOM, database, quality, and Playwright checks if the subagent remains unavailable.

Protected `main` checks currently include `quality`, `database`, `playwright`, `secret-scan`, `codeql (javascript-typescript)`, `semgrep`, `trivy`, `sbom`, plus Vercel checks. Do not merge task work until required checks pass.
