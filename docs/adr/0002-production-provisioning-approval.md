# ADR 0002: Production provisioning approval boundary

## Status

Accepted on 2026-09-01.

## Decision

Production resource provisioning is deferred until the foundation milestone is complete and the owner grants separate explicit approval.

## Consequences

- The foundation may create local files, run local containers, and establish source control.
- It must not create or mutate production Cloudflare, Supabase, Vercel, Azure, HCP Terraform, or Grafana resources.
- The Section 0.6 provider preflight must be recorded before any remote platform mutation.
