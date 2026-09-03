# Hosted Supabase Auth

Atmos uses Supabase Auth from the browser with only public configuration:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<key>
```

Do not expose a Supabase secret or service-role key through `NEXT_PUBLIC_` variables. Enable email/password and Google in the hosted Supabase Auth settings, and register the deployed application URL as an allowed redirect URL before production sign-in.
