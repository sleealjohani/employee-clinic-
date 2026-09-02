"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { writeAudit } from "@/lib/audit";
import { actionError, ClinicError } from "@/lib/action-result";
import {
  OHC_KEY,
  OHC_SOURCE_PREFIX,
  digest,
  readOHC,
  type OHCRegister,
  type OHCRow,
  type OHCIssue,
  type OHCDose,
} from "@/lib/import/ohc";
import {
  getOHC,
  lockOHC,
  sourceOHC,
  synchronizeOHC,
} from "@/server/ohc-register";
import { VACCINE_BY_CODE } from "@/lib/catalog/vaccines";

export type OHCState = {
  error?: string;
  ok?: boolean;
  preview?: {
    version: string;
    filename: string;
    rows: OHCRow[];
    issues: OHCIssue[];
    doses: OHCDose[];
  };
  imported?: number;
};
const refresh = () => {
  for (const path of [
    "/vaccinations",
    "/employees",
    "/dashboard",
    "/due",
    "/reports",
    "/portal",
  ])
    revalidatePath(path, "layout");
};
export async function importOHCAction(
  _previous: OHCState,
  form: FormData,
): Promise<OHCState> {
  const user = await requirePermission("import.run");
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    !/\.xlsx$/i.test(file.name) ||
    file.size > 3 * 1024 * 1024
  )
    return { error: "ohc.invalidFile" };
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await db.$transaction(
      async (tx) => {
        await lockOHC(tx);
        if (await getOHC(tx)) throw new ClinicError("ohc.alreadyAttached");
        const employees = await tx.employee.findMany({
          select: { id: true, name: true, nationalId: true, isArchived: true },
        });
        const parsed = await readOHC(bytes, employees);
        const version = digest(
          JSON.stringify({
            sha256: parsed.sha256,
            rows: parsed.rows,
            doses: parsed.doses,
          }),
        );
        if (form.get("mode") !== "commit")
          return {
            preview: {
              version,
              filename: file.name,
              rows: parsed.rows,
              issues: parsed.issues,
              doses: parsed.doses,
            },
          };
        if (form.get("confirm") !== "yes" || version !== form.get("version"))
          throw new ClinicError("ohc.changed");
        const now = new Date().toISOString();
        const register: OHCRegister = {
          version: 1,
          filename: file.name,
          sha256: parsed.sha256,
          importedAt: now,
          updatedAt: now,
          rows: parsed.rows,
          issues: parsed.issues,
          layout: parsed.layout,
          claimedCells: [],
          importedDoses: 0,
          doseCount: 0,
          extraCount: 0,
        };
        for (const dose of parsed.doses) {
          if (parsed.issues.some((i) => i.cell === dose.cell)) continue;
          const employee = await tx.employee.findUnique({
            where: { id: dose.employeeId },
          });
          if (!employee || employee.isArchived)
            throw new ClinicError("ohc.changed");
          const givenAt = new Date(`${dose.day}T00:00:00.000Z`);
          const existing = await tx.vaccination.findFirst({
            where: {
              employeeId: dose.employeeId,
              vaccineCode: dose.code,
              doseNumber: dose.dose,
              givenAt: {
                gte: givenAt,
                lt: new Date(givenAt.getTime() + 86400000),
              },
              status: "ACTIVE",
            },
          });
          register.claimedCells.push(dose.cell);
          if (existing) continue;
          const created = await tx.vaccination.create({
            data: {
              employeeId: dose.employeeId,
              vaccineCode: dose.code,
              vaccineName: VACCINE_BY_CODE[dose.code].nameEn,
              doseNumber: dose.dose,
              givenAt,
              createdById: user.id,
              notes: `OHC source ${parsed.sha256}; Data Base!${dose.cell}`,
            },
          });
          await writeAudit(
            {
              user,
              action: "CREATE",
              entity: "Vaccination",
              entityId: created.id,
              summary: "استيراد جرعة موثقة من سجل التحصينات",
              meta: {
                source: parsed.sha256,
                cell: dose.cell,
                employeeId: dose.employeeId,
              },
            },
            tx,
          );
          register.importedDoses++;
        }
        register.claimedCells = [...new Set(register.claimedCells)];
        await tx.setting.create({
          data: {
            key: OHC_SOURCE_PREFIX + register.sha256,
            value: bytes.toString("base64"),
          },
        });
        await tx.setting.create({
          data: { key: OHC_KEY, value: JSON.stringify(register) },
        });
        await synchronizeOHC(tx);
        await writeAudit(
          {
            user,
            action: "IMPORT_COMMIT",
            entity: "OHCRegister",
            entityId: register.sha256,
            summary: "اعتماد ملف التحصينات المرجعي",
            meta: {
              rows: register.rows.length,
              matched: register.rows.filter((r) => r.employeeId).length,
              imported: register.importedDoses,
              issues: register.issues.length,
            },
          },
          tx,
        );
        return { ok: true, imported: register.importedDoses };
      },
      { timeout: 60000 },
    );
    if (result.ok) refresh();
    return result;
  } catch (error) {
    return actionError(error);
  }
}

export async function linkOHCRowAction(
  _previous: OHCState,
  form: FormData,
): Promise<OHCState> {
  const user = await requirePermission("import.run");
  const rowNumber = Number(form.get("row")),
    employeeId = String(form.get("employeeId") ?? ""),
    reason = String(form.get("reason") ?? "").trim();
  if (
    !Number.isInteger(rowNumber) ||
    !employeeId ||
    reason.length < 5 ||
    reason.length > 1000 ||
    form.get("confirm") !== "yes"
  )
    return { error: "ohc.linkConfirm" };
  try {
    await db.$transaction(
      async (tx) => {
        await lockOHC(tx);
        const register = await getOHC(tx),
          employee = await tx.employee.findUnique({
            where: { id: employeeId },
          });
        const row = register?.rows.find((r) => r.row === rowNumber);
        if (
          !register ||
          !row ||
          row.employeeId ||
          !employee ||
          employee.isArchived ||
          register.rows.some((r) => r.employeeId === employeeId)
        )
          throw new ClinicError("ohc.changed");
        // Manual identity resolution does not silently approve clinical source data.
        const parsed = await readOHC(await sourceOHC(register, tx), [
          {
            id: employeeId,
            nationalId: row.nationalId,
            name: employee.name,
            isArchived: false,
          },
        ]);
        if (parsed.doses.some((d) => d.row === rowNumber))
          throw new ClinicError("ohc.linkHasDoses");
        row.employeeId = employeeId;
        delete row.reason;
        register.issues = register.issues.filter(
          (i) => !(i.row === rowNumber && !i.cell),
        );
        await tx.setting.update({
          where: { key: OHC_KEY },
          data: { value: JSON.stringify(register) },
        });
        await synchronizeOHC(tx);
        await writeAudit(
          {
            user,
            action: "UPDATE",
            entity: "OHCRegister",
            entityId: register.sha256,
            summary: "تأكيد ربط صف الموظف في سجل التحصينات",
            meta: {
              row: rowNumber,
              employeeId,
              reason,
              sourceNationalId: row.nationalId,
              employeeNationalId: employee.nationalId,
            },
          },
          tx,
        );
      },
      { timeout: 60000 },
    );
    refresh();
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
