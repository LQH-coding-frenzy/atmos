# Hosted Supabase Auth

Atmos uses Supabase Auth from the browser for optional email/password sign-up, sign-in, Google OAuth,
password recovery, and sign-out.
Only public configuration is available to the browser:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<key>
```

Do not expose a Supabase secret or service-role key through `NEXT_PUBLIC_` variables. Email/password
must be enabled in hosted Supabase Auth. Configure the deployed application URL as the Site URL and
an allowed redirect before production email confirmation. Google sign-in uses the owner-configured
Google provider. Google Cloud requires the exact Supabase callback URL
`https://<project-ref>.supabase.co/auth/v1/callback`; the Supabase Auth redirect allow-list may use
`https://rainify.dpdns.org/**` for app paths.

After sign-in, saved-location requests go through the Cloudflare gateway with the user's access token.
The versioned Supabase Edge Function verifies the token and relies on the caller-scoped client and
database RLS policies. The browser never receives a privileged key. The dashboard's public weather
journey remains available without authentication.

## Self-service account deletion

Account deletion requires a recent sign-in, exact email confirmation, and typing `DELETE`. The
versioned `api-v1` function validates the bearer JWT and derives the target only from that verified
user. It uses the owner-configured current Supabase Secret Key through the server-only
`PROJECT_SECRET_KEY` Edge Function environment variable to call Auth Admin. The key is never sent to
the browser or written to logs. Existing foreign keys cascade the profile, saved places, weather
history, and alert data when Supabase Auth removes the user. No service-role key, schema migration,
or RLS policy change is used.
