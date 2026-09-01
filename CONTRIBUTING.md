# Contributing

1. Choose one canonical backlog item from the master plan.
2. Confirm every `depends_on` task is marked `DONE` in `.agent/status.yaml`.
3. Create a branch named `feature/<issue>-<backlog-id>-<description>`.
4. Include tests, security implications, observability implications, evidence, and rollback details in the pull request.
5. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before requesting review.

Never commit secrets, provider credentials, Terraform state, database dumps, or backup archives.
