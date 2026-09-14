# HCP Terraform Bootstrap

`Bootstrap HCP Terraform` is a manually dispatched, protected-main workflow that creates the fixed Atmos HCP Terraform control-plane structure:

- organization: `atmos_uit`;
- project: `atmos-platform`;
- workspaces: `atmos-edge-staging`, `atmos-edge-production`, `atmos-data-staging`, `atmos-data-production`, `atmos-azure-staging`, `atmos-azure-production`, and `atmos-vercel`.

Every workspace is created with remote execution and manual apply. The bootstrap neither connects VCS nor configures provider variables, so it cannot apply provider infrastructure by itself.

## Credential Boundary

The protected-main GitHub Actions secret `TF_ORG_TOKEN` is injected only into the bootstrap job. It must be an HCP Terraform organization token limited to creating and reading the approved project and workspaces. The workflow never prints the token or response bodies.

Rotate or remove the bootstrap token after the workspaces are established. Later provider credentials belong in HCP Terraform sensitive variables with minimum scopes; they do not belong in Terraform files or GitHub logs.

## Operation And Recovery

Dispatch the workflow only from protected `main`. It is idempotent: missing approved names are created, while existing approved project/workspaces are reconciled to remote execution, manual apply, and the `atmos-platform` project. No resource or remote state is deleted.

If it fails, correct organization-token permissions and dispatch it again. Do not create alternate workspace names, enable auto-apply, or attach VCS as a workaround. Delete no HCP Terraform state or workspace to retry.
