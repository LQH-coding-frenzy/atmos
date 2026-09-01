# Gateway Worker Guidance

Applies to `workers/gateway`.

- The Worker is a thin Hono gateway for routing, cache, input bounds, CORS, security headers, and correlation IDs.
- Keep measured p95 Worker CPU at or below 7 ms. Move heavy or DB-adjacent work to Supabase Edge Functions or Azure jobs.
- Return typed, sanitized errors; never log credentials, JWTs, cookies, or sensitive user data.
- Do not add durable user state to the Worker.

Start with the target route and direct tests. Run the Worker test or bundle dry-run before broader validation.
