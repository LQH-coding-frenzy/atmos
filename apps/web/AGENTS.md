# Web Application Guidance

Applies to `apps/web`.

- Use the App Router and existing dashboard visual language.
- Keep browser state component-local unless shared UI state genuinely requires a store.
- Do not expose server-only keys through `NEXT_PUBLIC_` variables.
- Keep public data access behind the gateway contracts; do not couple UI code to raw provider responses.
- Preserve keyboard access, focus states, responsive layouts, and reduced-motion support.

For UI work, start with the affected route or component and its nearest test. Use the `targeted-verification` skill for validation selection.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
