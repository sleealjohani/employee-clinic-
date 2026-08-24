import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Runtime connection policy for Supabase + Vercel:
 * - DATABASE_URL uses Supavisor transaction mode on port 6543.
 * - pgbouncer=true disables prepared statements, which transaction mode does not support.
 * - A tiny Prisma pool is still useful because several server-rendered screens issue
 *   independent queries in parallel. One connection was too restrictive and caused
 *   P2024 pool timeouts under normal navigation/prefetch traffic.
 * - DIRECT_URL is intentionally untouched; migrations use the Session Pooler on 5432.
 */
function runtimeDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    const isSupabaseTransactionPooler =
      url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543";

    if (isSupabaseTransactionPooler) {
      // Supavisor transaction mode does not support Prisma named prepared statements.
      url.searchParams.set("pgbouncer", "true");

      // Three connections per warm function is a conservative step up from 1 and
      // is enough for this app's modest parallel query load without opening a large pool.
      url.searchParams.set("connection_limit", "3");
      url.searchParams.set("pool_timeout", "30");
      url.searchParams.set("connect_timeout", "20");
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
