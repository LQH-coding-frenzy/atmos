# ADR 0004: Application role authority

## Status

Accepted by the owner on 2026-10-21 for the owner/user role source and bootstrap-only assignment model. The initial assignment was owner-reported complete on 2026-10-22.

## Context

Group O permits only `owner` and `user` roles, with no admin tier and no client-controlled privilege assignment. The repository has no existing role authority or initial-owner assignment. The profile/preferences slice is complete without adding roles.

## Decision

- Supabase Auth `app_metadata.atmos_role` is the trusted source for the Atmos application role. The only supported values are `owner` and `user`; a missing value means `user`.
- `app_metadata` is managed by trusted server-side Auth Admin operations. `user_metadata`, OAuth profile fields, email addresses, Cloudflare account identity, request bodies, and browser state are not authorization sources.
- There is one initial owner. New or unassigned accounts are users. The application has no in-app role manager, promotion, or demotion feature.
- The initial owner must be identified by the exact Supabase Auth user UUID explicitly confirmed by the owner. A standalone, dry-run-default bootstrap uses the existing server-only `PROJECT_SECRET_KEY` through Auth Admin, requires explicit project-ref confirmation and `--apply`, and refuses to create a second owner.
- Existing user-owned data remains protected by its current per-user RLS policies. The `owner` application role does not, by itself, grant access to another user's rows.
- Any future RLS policy that depends on this role must use a verified token claim, include allow/deny tests, and account for JWT refresh after role changes. No Auth Hook, role-management API/UI, hosted metadata assignment, or new secret is introduced by this decision.

## Alternatives considered

- **`user_metadata`:** rejected because users can edit it; Supabase explicitly advises against using it for authorization.
- **Email or OAuth profile allowlist:** rejected because those values are not the stable Auth identity and can change; the bootstrap is keyed to the owner-confirmed Auth UUID.
- **Client-submitted role or profile column:** rejected because the client must never assign its own privileges and it would add a second role source.

## Consequences

- The owner reports that the initial bootstrap succeeded on 2026-10-22; the UUID is intentionally omitted from this ADR. The manual one-time check-and-set is not safe to run concurrently. Ownership transfer or a second owner would require a separate decision and task.
- Supabase Auth Admin changes are server-only. Supabase documents that updating a user's `app_metadata` does not notify existing browser sessions; clients must refresh their session before relying on updated claims.
- The initial production Auth metadata update followed explicit owner approval. Any future Auth metadata change requires separate explicit approval.

## References

- [Supabase Auth users and metadata](https://supabase.com/docs/guides/auth/users)
- [Supabase custom claims and RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac)
- [Supabase Auth Admin `updateUserById`](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
