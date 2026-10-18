# FEAT-LOC-002 — account-synced saved-place preferences and search

Status: **REVIEW**, implemented and locally verified on 2026-10-18. No production
migration or application was performed.

## Behavior

- Saved places persist favorite, Home/Work/University/Travel category, order and one
  default per account. Users can save at most 100 places; this owner-selected cap keeps
  the complete preference update bounded.
- The legacy device-only order/default migrate once when the server initialization marker
  is false. Thereafter authenticated server metadata is authoritative; a local mirror
  remains for compatibility/recovery.
- The authenticated API validates the complete preference set against the caller's
  saved-location IDs, then invokes an atomic `SECURITY INVOKER` RPC. Existing saved-place
  RLS remains the ownership boundary. The database enforces one default per user.
- Search keeps at most eight selected places in clearable browser storage. It stores
  resolved selections rather than raw queries; device-GPS locations are explicitly
  excluded and recents are never account-synced or sent to analytics.
- The coordinate form validates latitude/longitude and loads weather directly, without a
  geocoding request. Account management explains that place preferences sync to the
  account. The Privacy Policy documents local recent storage and account-owned settings.
- Owner role remains owner/users only. No admin functionality was introduced.

## Migration strategy

Two new additive migrations add saved-place metadata and an account preference-init
marker, backfill deterministic order, create a one-default partial index and add an
invoker-security RPC. The second migration corrects `WITH ORDINALITY` JSON expansion
found while resetting the local database. The original migration remains immutable; the
follow-up correction applies to clean/replayed installs.

No user data is dropped, recents are not persisted server-side, and existing columns or
API response fields are retained. Apply the expansion before the new Edge Function/API.
Do not remove preference data during rollback.

## Verification

- `supabase db reset` plus `supabase test db`: 144 pgTAP assertions passed across nine
  files, including owner access, cross-user denials, transactional preference replacement,
  default/category/duplicate validation, and the unique-default constraint.
- Full `corepack pnpm test`: 148 Vitest tests and 78 script tests passed.
- Full browser suite across dashboard/AQI/charts/location preferences: 33 passed serially.
- `deno check --node-modules-dir=auto` passed for `api-v1` and the new preference parser test.
- TypeScript, ESLint, Prettier, and the Next.js production build passed.
- Browser checks cover first-login local preference migration, server-authoritative
  favorites/categories/order/default, recent cap/deduplication/clear, GPS exclusion,
  valid coordinate selection and out-of-range latitude rejection. Desktop and mobile
  saved-place layouts were visually inspected without horizontal overflow.

## Remaining gates

Protected PR review/security scans and production deployment are pending. Production
schema changes must use the protected additive migration workflow; do not apply them manually.
