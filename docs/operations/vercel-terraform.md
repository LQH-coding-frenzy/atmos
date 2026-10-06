# Vercel Terraform boundary

The `atmos-vercel` HCP workspace uses remote execution and manual apply. The VERCEL-IAC-001 root manages only the existing `rainify.dpdns.org` project-domain association; project settings, environment variables, deployments, aliases, and DNS remain outside this root.

## Provider variables

The protected `Configure Vercel Terraform variables` workflow is manually dispatched from `main` with confirmation `CONFIGURE_VERCEL_IAC_VARIABLES`. It sources the existing non-secret `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` Production variables and the existing team-scoped `VERCEL_TOKEN` secret. It stores the IDs as Terraform variables (`team_id`, `project_id`) and the token as sensitive environment variable `VERCEL_API_TOKEN` in `atmos-vercel`.

The script is idempotent for matching variables and refuses to overwrite mismatched IDs or an existing sensitive token. It logs only variable names/counts and HTTP status codes; it never prints API bodies or credential values. It does not change workspace execution mode, auto-apply, Vercel resources, or deployment state.

The Vercel token is scoped to the project-owning team and expires December 11, 2026. Token creation or rotation is outside this task and requires separate owner approval. Update both GitHub and HCP stores only after that approval.

## Domain import and apply

The Terraform root imports the existing domain with a destroy guard. Dispatch the variable workflow only after owner approval. Review the HCP plan; if it proposes project/domain creation, domain reassignment, redirect changes, or any deployment/DNS changes, stop. HCP auto-apply remains disabled. A separate owner decision is required before confirming the import/apply run.
