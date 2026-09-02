import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ClinicError } from "@/lib/action-result";
import {
  OHC_KEY,
  OHC_SOURCE_PREFIX,
  renderOHC,
  type OHCRegister,
} from "@/lib/import/ohc";

export async function lockOHC(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ohc-register'))`;
}
export async function getOHC(
  tx: Prisma.TransactionClient = db,
): Promise<OHCRegister | null> {
  const stored = await tx.setting.findUnique({ where: { key: OHC_KEY } });
  return stored ? (JSON.parse(stored.value) as OHCRegister) : null;
}
export async function sourceOHC(
  register: OHCRegister,
  tx: Prisma.TransactionClient = db,
) {
  const stored = await tx.setting.findUnique({
    where: { key: OHC_SOURCE_PREFIX + register.sha256 },
  });
  if (!stored) throw new ClinicError("ohc.sourceMissing");
  return Buffer.from(stored.value, "base64");
}
/** Called inside the SAME transaction as a dose write or void. A failed Excel
 * update rolls the clinical write back too; the user is never told it synced. */
export async function synchronizeOHC(tx: Prisma.TransactionClient) {
  const register = await getOHC(tx);
  if (!register) return;
  const source = await sourceOHC(register, tx);
  const doses = await tx.vaccination.findMany({
    where: { status: "ACTIVE" },
    include: { employee: { select: { name: true, nationalId: true } } },
    orderBy: [{ givenAt: "asc" }, { id: "asc" }],
  });
  const rendered = await renderOHC(source, register, doses);
  register.updatedAt = new Date().toISOString();
  register.doseCount = doses.length;
  register.extraCount = rendered.extraCount;
  await tx.setting.upsert({
    where: { key: "ohc.current" },
    create: { key: "ohc.current", value: rendered.bytes.toString("base64") },
    update: { value: rendered.bytes.toString("base64") },
  });
  await tx.setting.update({
    where: { key: OHC_KEY },
    data: { value: JSON.stringify(register) },
  });
}
