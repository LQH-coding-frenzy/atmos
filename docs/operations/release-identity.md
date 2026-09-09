# Release Identity

Atmos uses one release ID derived from the exact Git commit being delivered:

```text
release_id = first 12 lowercase hexadecimal characters of the full Git SHA
```

Run `corepack pnpm release:id` to resolve the ID. The command uses `GITHUB_SHA`, then `VERCEL_GIT_COMMIT_SHA`, and otherwise the local repository `HEAD`. It fails rather than accepting partial or malformed commit metadata.

Deployment tasks must derive the ID once and propagate that exact value to Worker version metadata and `RELEASE_ID`, versioned Supabase function names, Vercel deployment metadata, OCI labels and tags, Azure revisions/jobs, and telemetry. Non-local `/version` responses must identify the deployed release rather than report `local`.

Rollback selects an immutable prior platform version and preserves its original release ID. It must never relabel rebuilt code as an earlier release.
