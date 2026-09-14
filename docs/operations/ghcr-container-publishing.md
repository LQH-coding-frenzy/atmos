# GHCR Container Publishing

GHCR-001 established `ghcr.io/lqh-coding-frenzy/atmos-jobs` as Atmos's repository-linked OCI package with a non-deployable `scratch` bootstrap artifact. CTR-001 replaces that context with the hardened runtime probe documented in `container-runtime.md`; `container-supply-chain.md` documents CTR-002 image scanning, SBOM generation, and signing; CTR-003 owns exact-digest signature verification before Azure deployment.

## Trust Boundary

`Container release` validates the image on pull requests with only `contents: read`. The publish job is excluded from pull requests, requires `refs/heads/main`, and alone receives `packages: write`. It authenticates with the automatic per-run `GITHUB_TOKEN`; no personal registry token is created or stored.

All third-party actions are pinned to full commit SHAs, checkout credentials are not persisted, and concurrent runs on one ref are serialized. Workflow or job changes remain covered by CODEOWNERS and protected repository checks.

## Immutable Identity

The only publication tag is `sha-<full-git-sha>`. The workflow sets `latest=false`, verifies the generated tag ends in the exact protected commit, and fails before build/push if that tag already exists. It records and remotely inspects the returned `sha256` digest.

The OCI metadata includes:

- `org.opencontainers.image.source=https://github.com/LQH-coding-frenzy/atmos`;
- `org.opencontainers.image.revision=<full-git-sha>`;
- `org.opencontainers.image.licenses=MIT`.

The source label links the package to this repository before its first publication so repository permissions are inherited. Package visibility is separate from repository visibility.

## First Publication

A protected push that changes the workflow or `jobs/**` runs validation and publication automatically. Manual dispatch is also allowed only from `main`; dispatching another ref runs validation but skips publishing.

After the first successful push, verify package visibility without credentials. If anonymous inspection fails, the owner must set the package visibility to public in GitHub's package settings; agents must not interact with that provider dashboard. Until an unauthenticated exact-digest inspection succeeds, do not claim the image is public or usable by Azure without credentials.

Verify public access without registry credentials:

```bash
docker logout ghcr.io
docker buildx imagetools inspect ghcr.io/lqh-coding-frenzy/atmos-jobs@sha256:<digest>
```

Record the workflow run ID, protected Git SHA, exact tag, digest, package visibility verification, and image size in `docs/evidence/ghcr-001/`. Do not record `GITHUB_TOKEN` output or authorization headers.

## Failure And Rollback

- Existing tag: stop. Never overwrite or delete it merely to make a rerun pass; publish from a new protected commit.
- Build or push failure: preserve the run, correct source through a new PR, and do not create a mutable fallback tag.
- Digest mismatch or anonymous pull failure: block downstream container tasks until registry identity or package visibility is corrected.
- Defective workflow: revert it through protected Git. Retain published digest-addressed artifacts unless a separately reviewed lifecycle change proves no consumer references them.
