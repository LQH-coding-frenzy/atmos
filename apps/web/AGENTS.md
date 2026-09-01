# Web Application Guidance

Applies to `apps/web`.

- Use the App Router and existing dashboard visual language.
- Keep browser state component-local unless shared UI state genuinely requires a store.
- Do not expose server-only keys through `NEXT_PUBLIC_` variables.
- Keep public data access behind the gateway contracts; do not couple UI code to raw provider responses.
- Preserve keyboard access, focus states, responsive layouts, and reduced-motion support.

For UI work, start with the affected route or component and its nearest test. Use the `targeted-verification` skill for validation selection.
