/** Bootstrap an empty database with an administrator only. Existing accounts are never changed. */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 1 }),
});
async function main() {
  if (await db.user.count()) {
    console.log("Users already exist. Bootstrap skipped.");
    return;
  }
  const username = process.env.SEED_ADMIN_USERNAME?.trim().toLowerCase(),
    password = process.env.SEED_ADMIN_PASSWORD;
  if (
    !username ||
    !password ||
    password.length < 12 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  )
    throw new Error(
      "Set SEED_ADMIN_USERNAME and a strong SEED_ADMIN_PASSWORD of at least 12 characters.",
    );
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-bootstrap'))`;
    if (await tx.user.count()) return;
    const user = await tx.user.create({
      data: {
        username,
        name: process.env.SEED_ADMIN_NAME || "مدير عيادة الموظفين",
        role: "ADMIN",
        passwordHash,
        mustChangePassword: true,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: "USER_MANAGE",
        entity: "User",
        entityId: user.id,
        summary: "Bootstrap administrator",
      },
    });
  });
  console.log("Administrator created; password change required at sign-in.");
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
