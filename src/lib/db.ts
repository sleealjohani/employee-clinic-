import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Prisma works with Supabase's transaction pooler on port 6543, but PgBouncer
 * transaction mode must not rely on prepared statements. Normalise the runtime
 * URL here so a correctly copied Supabase Transaction Pooler URL also gets the
 * Prisma/PgBouncer flags required on Vercel serverless functions.
 *
 * DIRECT_URL is intentionally not touched here: Prisma migrations use it as a
 * session connection on port 5432 via prisma/schema.prisma.
 */
function runtimeDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    const isSupabaseTransactionPooler =
      url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543";

    if (isSupabaseTransactionPooler) {
      if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
      if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
      if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    }

    return url.toString();
  } catch {
    // Let Prisma surface a useful connection-string error rather than hiding it.
    return raw;
  }
}

const datasourceUrl = runtimeDatabaseUrl();
const log = process.env.NODE_ENV === "development" ? (["warn", "error"] as const) : (["error"] as const);

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: [...log],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
