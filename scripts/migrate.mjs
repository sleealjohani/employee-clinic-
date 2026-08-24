#!/usr/bin/env node
/**
 * Applies pending migrations during a deploy.
 *
 * Prisma's `directUrl` must resolve to a non-empty string whenever it appears in
 * the schema, which makes DIRECT_URL a hard requirement even for deployments
 * that do not use a connection pooler and have nothing to point it at. This
 * wrapper makes it optional: when DIRECT_URL is missing or empty, migrations run
 * over DATABASE_URL, which is the right connection for any non-pooled database.
 *
 * Set DIRECT_URL when the app connects through a pooler (Neon, Supabase,
 * PgBouncer): migrations need a direct session for advisory locks and DDL.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const database = process.env.DATABASE_URL?.trim();
if (!database) {
  console.error("[migrate] DATABASE_URL is not set — cannot apply migrations.");
  process.exit(1);
}

const direct = process.env.DIRECT_URL?.trim();
console.log(
  direct
    ? "[migrate] using DIRECT_URL for migrations"
    : "[migrate] DIRECT_URL not set — falling back to DATABASE_URL",
);

// Resolve the local binary rather than trusting PATH, so this works whether it
// is run through npm or invoked directly.
const local = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
const command = existsSync(local) ? local : "prisma";

const result = spawnSync(command, ["migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DIRECT_URL: direct || database },
  shell: command === "prisma",
});

if (result.error) {
  console.error("[migrate] failed to run prisma:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
