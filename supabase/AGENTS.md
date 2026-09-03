# Supabase Guidance

Applies to `supabase`.

- `supabase/migrations` is the schema source of truth. Do not modify deployed migrations.
- User-owned tables require RLS, explicit grants, and allow/deny tests.
- Normal user operations must use publishable key plus user JWT and RLS, not a privileged secret key.
- Use expand/contract migration sequencing when old and new backend versions can overlap.

Load the `database-migration` skill before changing migrations, policies, grants, RPCs, or persisted data shape.
