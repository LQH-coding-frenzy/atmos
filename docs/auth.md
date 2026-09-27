# Hosted Supabase Auth

Atmos uses Supabase Auth from the browser for optional email/password sign-up, sign-in, and sign-out.
Only public configuration is available to the browser:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<key>
```

Do not expose a Supabase secret or service-role key through `NEXT_PUBLIC_` variables. Email/password
must be enabled in hosted Supabase Auth. Configure the deployed application URL as the Site URL and
an allowed redirect before production email confirmation. Google OAuth is not part of the current UI.

After sign-in, saved-location requests go through the Cloudflare gateway with the user's access token.
The versioned Supabase Edge Function verifies the token and relies on the caller-scoped client and
database RLS policies. The browser never receives a privileged key. The dashboard's public weather
journey remains available without authentication.
