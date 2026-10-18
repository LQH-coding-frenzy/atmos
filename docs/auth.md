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

After sign-in, saved-location and account-synced place-preference requests go through the Cloudflare
gateway with the user's access token. The versioned Supabase Edge Function verifies the token and
relies on the caller-scoped client and database RLS policies. The browser never receives a privileged
key. The dashboard's public weather journey remains available without authentication. Recent place
selections remain in a bounded, clearable browser-local list, separate from account data.

## Self-service account deletion

Account deletion requires a recent sign-in, exact email confirmation, and typing `DELETE`. The
versioned `api-v1` function validates the bearer JWT and derives the target only from that verified
user. It uses the owner-configured current Supabase Secret Key through the server-only
`PROJECT_SECRET_KEY` Edge Function environment variable to call Auth Admin. The key is never sent to
the browser or written to logs. Existing foreign keys cascade the profile, saved places, weather
history, and alert data when Supabase Auth removes the user. No service-role key, schema migration,
or RLS policy change is used.

## Google OAuth brand verification

The browser calls Supabase Google OAuth without adding custom Google API scopes. Supabase's web
Google setup uses `openid`, `https://www.googleapis.com/auth/userinfo.email`, and
`https://www.googleapis.com/auth/userinfo.profile`; Atmos does not request Gmail, Drive, Calendar,
or other Google API access. Keep the Data Access list limited to those identity scopes unless the
application functionality changes.

For the production app, use these Branding URLs in Google Auth Platform after the policy routes are
deployed and publicly accessible:

| Field                              | Value                               |
| ---------------------------------- | ----------------------------------- |
| Application name                   | Atmos                               |
| Application home page              | `https://rainify.dpdns.org/`        |
| Privacy policy                     | `https://rainify.dpdns.org/privacy` |
| Terms of service                   | `https://rainify.dpdns.org/terms`   |
| User support and developer contact | `jach96443@gmail.com`               |
| Authorized app domain              | `rainify.dpdns.org`                 |

The Web OAuth client must retain `https://rainify.dpdns.org` as its production JavaScript origin
and the exact Supabase callback `https://oxgwprvkotfvyacpqayx.supabase.co/auth/v1/callback` as an
authorized redirect URI. The wildcard redirect `https://rainify.dpdns.org/**` belongs in Supabase
Auth's redirect allow-list, not in the Google OAuth client.

### Verify ownership before submitting

Google requires Search Console ownership for authorized domains. The Public Suffix List includes
`dpdns.org`, so the top private domain for this deployment is `rainify.dpdns.org`. In Google Search
Console, create a Domain property for `rainify.dpdns.org`, add the exact TXT record Google provides
at the DNS provider that controls this host, and verify it. The Google account that owns the
Search Console property must also be an Owner or Editor on the Google Cloud project used by this
OAuth client. Do not claim ownership of the shared `dpdns.org` or `supabase.co` domains.

After the public policy pages are live and ownership is verified, review the OAuth app's Audience,
Branding, and Data Access sections. Submit Branding verification, wait for the status to become
Ready to publish, then publish the branding and set the intended external audience to production.
Check Verification Center for any additional review requested by Google; the current implementation
uses only basic identity scopes and has no feature that needs Gmail, Drive, Calendar, or contacts.
If the console says the Supabase callback host itself needs ownership verification, pause rather
than claiming the shared `supabase.co` domain; resolve the callback-domain requirement with the
project's Auth-domain configuration before resubmitting.
