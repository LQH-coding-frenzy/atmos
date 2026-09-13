# Worker Bad Canary Rollback Postmortem

- Date: 2026-09-13
- Status: Resolved
- Classification: Controlled production game-day control failure
- Affected control: Protected Cloudflare Worker rollback

## Executive Summary

During GAME-002, Atmos intentionally exposed a Worker candidate that returned sanitized HTTP 503 responses for public weather requests. Workers Analytics Engine (WAE) detected the candidate failure as designed. The initial protected rollback then failed because it used a one-version `wrangler versions deploy` operation, which Cloudflare rejected with code `10220` after the candidate changed the versioned `SUPABASE_FUNCTION_URL` binding.

The stable target itself remained healthy and available through a version override. The operator used the documented Cloudflare `wrangler rollback --yes` recovery primitive, restoring stable-only traffic 3 minutes 15 seconds after the first 10 percent exposure began. The protected workflow was corrected and regression-tested in PR #138, then the same bounded 90/10 exercise was repeated. WAE again returned the expected `FAIL`, and protected rollback run `34754470476` restored the stable Worker at 100 percent in 3 minutes 45 seconds.

No data loss, authorization failure, credential exposure, schema change, or confirmed user report occurred. Requests routed to the intentionally failing candidate weather path could receive HTTP 503 during the two bounded exposure windows. Aggregate telemetry does not identify affected users, so this review does not claim a user count.

## Impact

- First exposure: candidate at 10 percent from `2026-09-13T11:13:35Z` to `2026-09-13T11:16:50Z`.
- First mitigation time: 3 minutes 15 seconds from exposure to emergency stable-only deployment.
- Verification exposure: candidate at 10 percent from `2026-09-13T11:23:50Z` to `2026-09-13T11:27:35Z`.
- Verification rollback time: 3 minutes 45 seconds from exposure to protected stable-only deployment.
- Affected behavior: candidate public weather requests returned sanitized HTTP 503 `WEATHER_UNAVAILABLE`; stable weather remained HTTP 200.
- Unaffected controls: health, dependency health, release identity, unauthenticated authorization behavior, database schema, RLS, queues, and frontend deployment.
- Security and data impact: none observed. No user payload or credential value was included in telemetry or evidence.

The first WAE pre-exposure gate reported 54 stable samples with 0 error rate and 945 ms p95 wall duration; candidate had 45 samples with 0.9111111111111111 error rate and 0 ms p95 wall duration. During the corrected exercise, stable had 63 samples with 0 error rate and 874 ms p95 wall duration; candidate had 45 samples with 0.9111111111111111 error rate and 0 ms p95 wall duration. The allowed error rate was 0.02.

## Detection

The release-analysis control worked as intended:

- Candidate override smoke proved the fault was isolated to candidate weather requests before ordinary exposure.
- WAE run `34753803679` returned `FAIL` while candidate traffic remained at zero percent.
- WAE run `34753896861` returned deterministic `FAIL` during the first 10 percent exposure.
- WAE run `34754362450` returned deterministic `FAIL` during the verification exposure.
- Stable-target override smoke passed before both rollback attempts.

The incident was not a monitoring failure. It was a mismatch between the selected rollback mutation and Cloudflare's versioned-binding semantics.

## Timeline

All timestamps are UTC. Where provider evidence preserves sequence but not a trustworthy wall-clock time, this timeline deliberately omits an invented timestamp.

| Time               | Event                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before 11:13:35    | Candidate function health and release identity passed. Candidate override weather returned the intended sanitized HTTP 503 while stable weather returned HTTP 200. Forty bounded weather samples were generated for each version at zero percent candidate traffic. |
| Before 11:13:35    | WAE run `34753803679` returned expected `FAIL` before exposure.                                                                                                                                                                                                     |
| 11:13:35           | Deployment `a9c24e9c-142b-4e9a-bc48-08fb16d63fba` began serving stable at 90 percent and candidate at 10 percent.                                                                                                                                                   |
| After exposure     | WAE run `34753896861` returned expected deterministic `FAIL`.                                                                                                                                                                                                       |
| After detection    | Protected rollback run `34753940171` passed identity planning and stable-target smoke, then Cloudflare rejected `versions deploy` with code `10220`.                                                                                                                |
| 11:16:50           | Documented emergency `wrangler rollback --yes` created stable-only deployment `803b4e4a-e699-4986-8aab-ff87f9257333`; recovery smoke passed.                                                                                                                        |
| After recovery     | PR #138 replaced the mutation with `wrangler rollback`, added regression coverage, passed protected checks, and merged as `2e9ab6c`.                                                                                                                                |
| 11:23:50           | Deployment `b46934b6-cc69-4c01-b8fe-03e3cf31f3ff` repeated the bounded 90/10 split to verify the corrected protected path.                                                                                                                                          |
| After exposure     | WAE run `34754362450` returned expected deterministic `FAIL`.                                                                                                                                                                                                       |
| 11:27:35           | Protected run `34754470476` created stable-only deployment `e5d82173-6362-45d3-9fd2-5e88ab465b57`; deployment verification, recovery smoke, and Grafana synthetics passed.                                                                                          |
| After verification | PR #139 removed the temporary source fault hook, preserved evidence, passed all protected checks, and merged as `2a42416`. Production was not redeployed because the stable Worker never contained the hook.                                                        |

## Root Cause

The protected workflow used `wrangler versions deploy <stable>@100` as if creating a one-version deployment were equivalent to rolling back to that version. Cloudflare treats these as different operations when versioned secret bindings changed. Because the candidate referenced a different `SUPABASE_FUNCTION_URL`, Cloudflare required the explicit rollback primitive to restore the target version and its prior bindings. The deployment request therefore failed closed with code `10220` instead of changing traffic.

The intentional candidate HTTP 503 was not the root cause; it was the injected condition that correctly activated the release gate. The stable Worker, its mapped Supabase function, WAE detection, exact-identity validation, and pre-rollback smoke were all healthy.

## Contributing Factors

- REL-006 had live evidence for plan mode but had not yet executed a rollback across Worker versions with different versioned bindings.
- Preflight validated identities, retained history, target health, and desired post-deployment shape, but it did not model whether the chosen Cloudflare mutation could restore changed bindings.
- Unit tests verified the rollback plan and resulting stable-only inventory, not the exact Wrangler command used by the workflow.
- The master plan allowed `wrangler rollback` or an equivalent deployment API action. The implementation treated a one-version deployment as equivalent without evidence for changed-secret behavior.
- Provider CLI semantics were stricter than the local inventory model. This was an integration gap, not an individual operator error.

## Response Analysis

### What Worked

- The candidate was held at zero percent until identity, health, authorization, and deterministic failure checks passed.
- Exposure remained bounded to 10 percent with a known-good stable target retained.
- WAE distinguished candidate failure from stable behavior with sufficient samples and returned `FAIL` each time.
- The protected rollback stopped on provider rejection rather than claiming success or bypassing verification.
- Stable-target override smoke established that emergency recovery was safe before traffic changed.
- The documented native rollback command restored service without a database, RLS, secret, or artifact mutation.
- Post-rollback health, dependency, release, weather, authorization, and synthetic checks confirmed recovery.

### What Did Not Work

- The initial protected mutation could not restore a target whose versioned binding differed from the current candidate.
- Plan-only evidence created confidence in validation logic but did not prove execute-mode provider compatibility.
- The test suite did not assert use of Cloudflare's dedicated rollback primitive before the incident.

### Response Risks Avoided

- The operator did not raise candidate traffic above 10 percent.
- The failed workflow was not weakened, retried with unreviewed identities, or bypassed through a one-off deployment configuration.
- No old Worker or Supabase function was deleted during diagnosis.
- No secret was printed, recreated, or rotated to work around the provider error.

## Corrective Actions

| Action                                                                                                                           | Owner               | Status               | Verification                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Replace one-version deployment with `wrangler rollback <stable-version> --yes` after protected identity and target-smoke gates.  | Release engineering | Complete             | PR #138; workflow lines are regression-tested; protected run `34754470476` passed.                          |
| Reject regression to `wrangler versions deploy <stable>@100` in the rollback workflow.                                           | Test owner          | Complete             | `scripts/worker-rollback.test.mjs` asserts the native primitive is present and the old command is absent.   |
| Document code `10220` and changed-version-binding behavior in rollback and game-day procedures.                                  | Operations          | Complete             | `docs/operations/worker-rollback.md` and `docs/operations/worker-bad-canary-game-day.md`.                   |
| Prove the corrected protected path under the same bounded failure conditions.                                                    | Release owner       | Complete             | WAE run `34754362450`, rollback run `34754470476`, final deployment `e5d82173-6362-45d3-9fd2-5e88ab465b57`. |
| Remove the deployment-only fault hook from normal source after evidence capture.                                                 | Gateway owner       | Complete             | PR #139 merged as `2a42416`; protected checks passed.                                                       |
| Retain failed Worker/function artifacts through this review, then allow deletion only through the REL-007 fresh-inventory guard. | Release owner       | Pending review merge | A future cleanup plan must protect every retained Worker mapping and fail closed on truncated inventory.    |

## Prevention And Verification

Future Worker rollback changes must preserve all of these controls:

1. Exercise or explicitly model changed versioned bindings; same-binding rollback evidence is insufficient.
2. Use Cloudflare's rollback primitive rather than inferring equivalence from the desired deployment shape.
3. Smoke the exact retained target through `Cloudflare-Workers-Version-Overrides` before execute mode.
4. Verify Cloudflare created a new stable-only 100-percent deployment after the command.
5. Smoke the ordinary recovered path and require fresh Grafana synthetic results.
6. Keep command-selection regression coverage in protected CI.
7. Retain current, previous, and one additional known-good release function while rollback references exist.

## Residual Risk

- Cloudflare CLI and API behavior can change. Atmos pins Wrangler, protects workflow changes, and requires live game-day evidence rather than treating local tests as complete provider proof.
- Wrangler version inventory is capped at 10 entries. REL-007 blocks cleanup when that cap is reached so a truncated inventory cannot authorize deletion.
- Aggregate WAE telemetry supports release decisions but cannot establish an exact affected-user count. User-level identifiers are intentionally excluded.
- Emergency owner-authenticated rollback remains necessary if the protected control plane itself fails. The same exact-identity, target-smoke, stable-only verification, and evidence rules still apply.

## Final State

Production deployment `e5d82173-6362-45d3-9fd2-5e88ab465b57` serves stable Worker `57d8764d-c7e2-41d2-9e46-00c74f17f4c6` and release `a794b540e4dc` at 100 percent. Health, dependency health, public weather, unauthenticated authorization, and Grafana synthetics were all successful after recovery. The corrected rollback workflow is the protected recovery path, and the temporary candidate fault hook is absent from current source.

Primary evidence: [`docs/evidence/game-002/2026-09-13.md`](../evidence/game-002/2026-09-13.md).
