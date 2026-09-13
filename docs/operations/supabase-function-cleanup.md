# Supabase Function Cleanup

REL-007 removes only versioned Edge Functions that no retained Worker version can reference. The guard treats Cloudflare's complete retained version inventory as authoritative and maps each canonical `workers/tag` release to `api-<release>`.

## Plan

Fetch and evaluate fresh production inventories without printing credentials:

```bash
corepack pnpm release:cleanup plan
```

The guard fails closed unless:

- every retained Worker has a canonical 12-character release tag;
- every deployment reference appears in the retained version inventory;
- `api-v1` and every tag-mapped function are active;
- at least three distinct tag-mapped functions remain for current, previous, and additional known-good recovery.

Non-release functions are ignored. A candidate must exactly match `api-<12 lowercase hex characters>` and must not map to any retained Worker.

## Delete One Candidate

Execute one exact candidate. The command fetches all three inventories again, authorizes the target, and passes that same validated name to the production Supabase delete command without an intervening manual step:

```bash
corepack pnpm release:cleanup execute api-<release> "DELETE api-<release>"
```

Re-plan after every deletion. Stop if provider inventory changes, the candidate disappears, a protected function is missing or inactive, or the retained release count falls below three. Do not bypass the guard with a direct provider deletion command.

## Rollback

No database data or schema is changed. If an unreferenced wrapper must be restored, check out its protected Git release, run `corepack pnpm release:supabase:stage`, and deploy that exact generated function name. Never delete `api-v1` or a function mapped by a retained Worker tag.
