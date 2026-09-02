import type { Prisma } from "@prisma/client";
export async function notifyEmployee(
  tx: Prisma.TransactionClient,
  employeeId: string,
  titleAr: string,
  titleEn: string,
  href = "/portal",
) {
  const account = await tx.user.findUnique({
    where: { employeeId },
    select: { id: true, isActive: true },
  });
  if (account?.isActive)
    await tx.notification.create({
      data: { userId: account.id, titleAr, titleEn, href },
    });
}
export async function notifyClinic(
  tx: Prisma.TransactionClient,
  titleAr: string,
  titleEn: string,
  href: string,
) {
  const users = await tx.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "STAFF"] } },
    select: { id: true },
  });
  if (users.length)
    await tx.notification.createMany({
      data: users.map((user) => ({ userId: user.id, titleAr, titleEn, href })),
    });
}
