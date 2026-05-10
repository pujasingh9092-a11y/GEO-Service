# GEO Service

A web-based workspace for managing GEO service plans, client workspaces, task ownership, links, and progress tracking.

## Supabase database setup

The app is wired to Supabase and syncs each user's workspace state by email.

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Paste the contents of `supabase-schema.sql`.
4. Click **Run**.
5. Reload the app, log in with an email, and changes will sync to the `geo_app_states` table.

This is the first database-backed version. It still uses the app's email login field for prototype testing; before production, replace the permissive prototype policies with Supabase Auth policies.
