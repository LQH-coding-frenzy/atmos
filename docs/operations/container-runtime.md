# Hardened Container Job Runtime

CTR-001 provides the finite runtime contract used to validate Atmos container execution before backup or historical-backfill logic exists. It performs no network request, database access, filesystem write, retry, or long-running loop.

## Image Boundary

`jobs/runtime-probe/Dockerfile` uses the official `node:24.14.1-alpine3.23` image pinned by OCI index digest. It installs no package, copies only `job.mjs`, runs as the built-in `node:node` user, and starts through an exec-form entrypoint. The process works with a read-only filesystem, no Linux capabilities, no network, and `no-new-privileges`.

The image accepts only:

- `ATMOS_JOB_ID`: 1 to 128 ASCII letters, digits, `.`, `_`, `:`, or `-`, beginning with a letter or digit;
- `ATMOS_RELEASE_ID`: exactly 12 lowercase hexadecimal characters.

These identifiers are operational metadata, not authorization or user identity. Never place a token, database URL, user identifier, email address, or payload in either value.

## Logs And Exit Status

A valid invocation emits exactly two single-line JSON events, `job_started` and `job_completed`, containing only job ID, release ID, fixed job type, and coarse status. It exits zero.

Missing or malformed identity emits one fixed `job_configuration_invalid` event and exits non-zero. The invalid value is never reflected. Provider or secret values are not read.

Local hardened execution:

```bash
docker build \
  --build-arg SOURCE_URL=https://github.com/LQH-coding-frenzy/atmos \
  --build-arg REVISION=<full-git-sha> \
  --tag atmos-jobs:validation \
  jobs/runtime-probe

docker run --rm --read-only --network=none --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --env ATMOS_JOB_ID=local-validation \
  --env ATMOS_RELEASE_ID=<12-character-release> \
  atmos-jobs:validation
```

## Release And Rollback

The protected container workflow builds the same context and publishes only `sha-<full-git-sha>`. Record and consume the returned digest, not the tag, after CTR-002 and CTR-003 add image-policy and signature gates.

Retain the prior GHCR-001 bootstrap digest and each hardened image digest. If a runtime regression occurs, select a previously verified digest or revert through protected Git; never overwrite an existing tag. No image is approved for Azure until the canonical signing and exact-digest verification tasks are complete.
