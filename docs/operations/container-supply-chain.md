# Container Supply Chain

CTR-002 applies the container release controls to `ghcr.io/lqh-coding-frenzy/atmos-jobs`. The protected workflow builds the job image, scans that local image with Trivy, generates and validates a CycloneDX SBOM, then publishes the same local image config under its one full-SHA tag.

The runtime base is `node:24.21.0-alpine3.23@sha256:159fe64649038c30f8cc1ec4be3af3a6e93e3648678c31294e2c5058dbeb99f3`. This patched base replaces the prior `24.14.1` pin after the first exact-image policy scan found a critical bundled `tar` dependency finding. A single deterministic remediation layer upgrades only `libcrypto3` and `libssl3` to their fixed Alpine versions and removes unused npm/corepack tooling; it does not add an application package or runtime package-management capability.

## Policy

- Trivy scans image vulnerabilities, secrets, and misconfigurations at `HIGH,CRITICAL`; a finding fails the workflow before GHCR login and publication. `ignore-unfixed` remains false and no exception or suppression is configured.
- Trivy uses its primary public GHCR vulnerability database endpoint. The database is intentionally current at scan time so newly disclosed findings block a release instead of relying on a stale cache.
- Trivy generates a CycloneDX SBOM from the scanned image. The workflow rejects an invalid, non-container, or empty SBOM and retains the validated file as a 14-day GitHub Actions artifact.
- After push, the workflow obtains the remote manifest digest and confirms its config digest equals the config digest that was scanned locally. The tag and digest are both recorded in the workflow summary.
- The protected `main` publish job alone has `packages: write` and `id-token: write`. Cosign v3.0.6 uses that ephemeral GitHub OIDC token to keylessly sign `image@sha256:<digest>` and attach a CycloneDX attestation to the same exact digest. No signing key, password, or personal access token exists.
- Sigstore public transparency logs retain signing identity metadata. Do not place user data, secrets, or sensitive values in image labels, SBOM metadata, or signing annotations.

## Release Boundary

Pull requests build, scan, generate, and structurally validate a non-published image with only `contents: read`. A merge to protected `main` repeats those controls for the tagged image, verifies local-versus-remote config identity, publishes its SBOM artifact, and signs the immutable digest.

An unsuccessful Cosign step can leave a scanned but unsigned GHCR digest. It is not deployable: CTR-003 owns signature and identity verification on the exact digest as a mandatory Azure deployment gate. Never substitute a tag, rerun against an existing SHA tag, or deploy an artifact missing either signature or SBOM attestation.

## Recovery

Keep the workflow run, SBOM artifact, and immutable digest for investigation. Correct the source or workflow in a new protected commit; do not suppress a finding, delete an existing tag, or overwrite an artifact. Recover a later deployment only by selecting a previously retained digest that satisfies CTR-003 verification.
