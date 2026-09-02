import { cache } from "react";
import { db } from "@/lib/db";
import {
  clinicConfigSchema,
  DEFAULT_CLINIC_CONFIG,
  type ClinicConfig,
} from "@/lib/clinic-config";
import type { Prisma } from "@prisma/client";

export async function readClinicConfig(
  client: Prisma.TransactionClient = db,
): Promise<ClinicConfig> {
  const row = await client.setting.findUnique({
    where: { key: "clinic.config.v2" },
  });
  if (!row) return DEFAULT_CLINIC_CONFIG;
  try {
    const parsed = clinicConfigSchema.safeParse({
      ...DEFAULT_CLINIC_CONFIG,
      ...JSON.parse(row.value),
    });
    if (parsed.success) return parsed.data;
  } catch {
    /* Fall back to bounded defaults for damaged configuration. */
  }
  console.error("[settings] Invalid clinic configuration; using defaults");
  return DEFAULT_CLINIC_CONFIG;
}
export const getClinicConfig = cache(() => readClinicConfig());
