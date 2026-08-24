# Supabase deployment notes

This project uses Supabase as a PostgreSQL provider through Prisma. It does not currently use the Supabase JavaScript client, so the public Supabase URL/key are not required by the application code.

## Vercel environment variables

Use values from Supabase → Connect:

- `DATABASE_URL`: **Transaction pooler**, port `6543`.
- `DIRECT_URL`: **Session pooler**, port `5432`.
- `AUTH_SECRET`: application-generated random secret, at least 32 characters.
- `SETUP_TOKEN`: application-generated long random token used only to create the first administrator.
- `ANTHROPIC_API_KEY`: optional; required only for assisted lab-report import.

Never commit real `AUTH_SECRET`, `SETUP_TOKEN`, database passwords, or API keys to GitHub.

The Prisma runtime client automatically adds the PgBouncer-safe options required by Supabase transaction pooling on port 6543. Migrations continue to use `DIRECT_URL` on port 5432.

## Database migrations

Vercel executes:

```text
prisma generate && node scripts/migrate.mjs && next build
```

`node scripts/migrate.mjs` runs `prisma migrate deploy`, so the schema is created automatically during deployment. Do not paste the initial Prisma migration into Supabase SQL Editor after a successful deploy; doing so would attempt to recreate existing PostgreSQL types/tables and can create migration drift.

To verify the database from Supabase SQL Editor, run `supabase/verify.sql`.

A successful first deployment should show migration `00000000000000_init` in `public."_prisma_migrations"` and the application tables in the `public` schema.

## First administrator

After deployment, open `/setup`. The submitted token must exactly match the `SETUP_TOKEN` configured in Vercel. Once the first user is created, `/setup` closes permanently and redirects to `/login`.
