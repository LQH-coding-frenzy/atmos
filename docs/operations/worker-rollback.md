# Worker Production Rollback

`Worker production rollback` is the Git-owned REL-006 recovery path for restoring one retained Cloudflare Worker version at 100 percent. It runs only from protected `main` in the GitHub `Production` environment and never changes the database or deletes Worker/Supabase releases.

## Identity and permission

The Production environment stores `CLOUDFLARE_API_TOKEN`, scoped to the Atmos account for Worker script changes, and non-secret variable `CLOUDFLARE_ACCOUNT_ID`. The owner approved their creation on 2026-09-13. Never print, pass as an input, or reuse the token for analytics reads.

Every dispatch supplies distinct immutable stable/failed Worker UUIDs and their 12-character Git release tags. The workflow reads Cloudflare's deployment and version inventories and fails unless:

- both UUIDs and release IDs are syntactically valid;
- each UUID has the supplied release tag;
- the failed version is receiving traffic in the latest deployment;
- the stable version appears in retained deployment history;
- `plan` uses `PLAN` and `execute` uses `ROLLBACK` confirmation.

## Plan-only validation

Use plan mode before an incident exercise or when selecting a rollback target. It validates Production authentication and inventory without changing traffic:

```bash
gh workflow run worker-rollback.yml --ref main \
  -f mode=plan \
  -f stable_version_id=<retained-stable-worker-uuid> \
  -f stable_release_id=<stable-release-id> \
  -f failed_version_id=<current-worker-uuid> \
  -f failed_release_id=<current-release-id> \
  -f confirmation=PLAN
```

The workflow targets the retained version through `Cloudflare-Workers-Version-Overrides` and smokes its health, release, weather, and unauthenticated protected route without changing ordinary traffic. Review the run summary and exact identities before execution. GAME-002 owns the controlled production rollback exercise.

## Execute rollback

Dispatch `mode=execute` with the same reviewed identities and `confirmation=ROLLBACK`. The workflow creates a stable-only 100-percent deployment, verifies Cloudflare created a new exact deployment, and smokes:

Execution uses `wrangler rollback`, not a one-version `wrangler versions deploy`. Cloudflare requires its rollback primitive to explicitly confirm restoration when a versioned secret binding such as `SUPABASE_FUNCTION_URL` changed after the target was active. The workflow reaches that confirmation only after exact version/release validation and override smoke, and `--yes` keeps the protected run non-interactive.

- `GET /health` returns status `ok`;
- `GET /version` returns the stable release ID;
- the bounded public weather route returns Open-Meteo data;
- unauthenticated `GET /api/v1/me` remains HTTP 401.

After execution, confirm fresh Grafana edge, dependency, and weather synthetics. A missing sample is insufficient evidence, not success. Preserve the workflow run, deployment ID, release/version IDs, smoke result, and incident timeline.

## Failure and recovery

If validation fails, do not bypass it or substitute a different version. If deployment succeeds but smoke fails, keep the failed run and dispatch another explicitly reviewed known-good retained Worker/function pair; automatically restoring the version declared failed would be unsafe.

Keep additive database schema and all referenced Supabase functions during recovery. Revert the workflow through protected Git if its control logic is defective. Revoking or replacing its Cloudflare token requires separate owner approval and successful replacement validation.
