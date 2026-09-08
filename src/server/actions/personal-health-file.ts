"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import { actionError, ClinicError } from "@/lib/action-result";

export type PersonalHealthFileSaveResult = {
  ok?: boolean;
  error?: string;
  revision?: number;
};

type RevisionRow = { revision: number };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Persist the booklet as one lossless DATA-shaped JSON document.
 *
 * The revision is optimistic concurrency control for two nurses editing the
 * same employee at once. An advisory transaction lock makes the check + write
 * atomic without putting any persistence logic inside the standalone HTML.
 */
export async function savePersonalHealthFileAction(
  employeeId: string,
  data: unknown,
  revision: number,
): Promise<PersonalHealthFileSaveResult> {
  const user = await requirePermission("clinical.write");

  if (
    !employeeId ||
    !isPlainRecord(data) ||
    !Number.isInteger(revision) ||
    revision < 0
  ) {
    return { error: "v2.invalid" };
  }

  let json: string;
  try {
    json = JSON.stringify(data);
  } catch {
    return { error: "v2.invalid" };
  }

  // The eight-page form is normally only a few KB. Keep a generous ceiling
  // while preventing an accidental/pasted payload from becoming a DB blob.
  if (Buffer.byteLength(json, "utf8") > 512 * 1024) {
    return { error: "v2.invalid" };
  }

  try {
    const nextRevision = await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`personal-health-file:${employeeId}`})
        )
      `;

      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, isArchived: true },
      });
      if (!employee || employee.isArchived) {
        throw new ClinicError("v2.invalid");
      }

      const current = await tx.$queryRaw<RevisionRow[]>`
        SELECT "revision"
        FROM "PersonalHealthFile"
        WHERE "employeeId" = ${employeeId}
      `;

      const currentRevision = current[0]?.revision ?? 0;
      const exists = current.length > 0;
      if ((exists && currentRevision !== revision) || (!exists && revision !== 0)) {
        throw new ClinicError("v2.conflict");
      }

      const next = currentRevision + 1;

      await tx.$executeRaw`
        INSERT INTO "PersonalHealthFile"
          ("employeeId", "data", "revision", "updatedAt", "updatedById")
        VALUES
          (${employeeId}, CAST(${json} AS jsonb), ${next}, CURRENT_TIMESTAMP, ${user.id})
        ON CONFLICT ("employeeId") DO UPDATE SET
          "data" = EXCLUDED."data",
          "revision" = EXCLUDED."revision",
          "updatedAt" = CURRENT_TIMESTAMP,
          "updatedById" = EXCLUDED."updatedById"
      `;

      await writeAudit(
        {
          user,
          action: "UPDATE",
          entity: "PersonalHealthFile",
          entityId: employeeId,
          summary: "حفظ الملف الصحي",
          meta: { revision: next },
        },
        tx,
      );

      return next;
    });

    revalidatePath(`/employees/${employeeId}`);
    revalidatePath(`/employees/${employeeId}/health-file`);
    return { ok: true, revision: nextRevision };
  } catch (error) {
    return actionError(error) as PersonalHealthFileSaveResult;
  }
}
