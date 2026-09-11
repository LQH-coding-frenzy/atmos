# WAE Release Gate

OBS-008 evaluates exact stable and candidate Worker identities from the bounded Analytics Engine contract. The protected manual workflow reads only `atmos_worker_requests_staging`; it cannot upload Workers, change deployments, or mutate a dataset.

## Decisions

- `INSUFFICIENT_DATA`: either exact release has fewer than 30 weighted samples or no matching row. Hold traffic; never promote.
- `FAIL`: candidate weighted 5xx rate is above `max(2%, stable + 1 percentage point)`, or candidate weighted p95 wall duration is above `max(2500 ms, stable * 1.5)`. REL-006 owns rollback automation.
- `PASS`: both sample minimums and both metric limits pass. REL-004 must still require the configured external synthetic before promotion.

Counts and error rates use `_sample_interval`. The p95 uses `quantileExactWeighted(0.95)(double1, _sample_interval)`. Queries filter both exact Worker version UUID and exact 12-character release ID within a bounded time window.

## Credential

GitHub environment `Staging` is restricted to protected branches and contains:

- secret `CLOUDFLARE_ANALYTICS_TOKEN`: user token scoped to the Atmos account with `Account Analytics Read` only, expiring December 12, 2026;
- variable `CLOUDFLARE_ACCOUNT_ID`: the non-secret account identifier.

Rotate the token before expiry. Never reuse a Worker deployment token for SQL reads.

## Invocation

Dispatch `WAE release gate` from `main` with distinct stable/candidate Worker UUIDs and release IDs. The job summary records the decision, weighted samples, error rates, p95 values, and computed limits without printing the credential.
