# Atmos Agent Guide

Atmos is a TypeScript pnpm monorepo for a serverless-first weather platform.

## Repository Map

- `apps/web` - Next.js dashboard.
- `workers/gateway` - Cloudflare Worker and Hono edge gateway.
- `packages` - shared contracts, domain rules, and provider adapters.
- `supabase` - migrations, RLS tests, and Edge Function source.
- `docs` - architecture, operations, evidence, and AI-cost references.

## Core Commands

- Install: `corepack pnpm install --frozen-lockfile`
- Lint: `corepack pnpm lint`
- Typecheck: `corepack pnpm typecheck`
- Unit tests: `corepack pnpm test`
- Browser tests: `corepack pnpm test:e2e`
- Database tests: `corepack pnpm test:db`

Prefer the smallest owning-package or file-local check first. Run repository-wide validation only for cross-cutting changes or when explicitly requested.

## Universal Rules

- Search first, then read the smallest useful file set. Do not recursively explore the repository or preload architecture documentation.
- Expand context only to resolve a concrete question. Stop once ownership, control flow, affected files, tests, and invariants are known.
- Preserve existing APIs and avoid unrelated refactors.
- Never commit secrets, `.env` values, Terraform state, database dumps, backups, JWTs, or provider credentials.
- Remote production mutations, paid-resource changes, secret creation/rotation, destructive migrations, and Terraform applies require explicit owner approval.
- Do not use the old Vite reference project as the application runtime or source of commands.

## Canonical Tasks

`docs/architecture/atmos-devsecops-master-plan.md` is authoritative. For a Section 29 task, load the `atmos-task` skill before editing. It contains the mandatory dependency, safety, and evidence workflow.

## Context Maintenance

Keep this file limited to rules useful for nearly every task. Put subsystem invariants in nested `AGENTS.md`, specialized procedures in skills, and detailed background in normal documentation.
