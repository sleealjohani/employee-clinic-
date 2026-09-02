import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
/** A small driver pool per warm function. node-postgres uses unnamed statements,
 * compatible with the Supabase transaction pooler. Migrations use DIRECT_URL. */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 20000,
  keepAlive: true,
});
export const db =
  globalForPrisma.prisma ?? new PrismaClient({ adapter, log: ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
