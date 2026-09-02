"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import { readEmployeeSpreadsheet } from "@/lib/import/employees";
import { actionError } from "@/lib/action-result";
export type ImportRowResult = {
  row: number;
  nationalId: string;
  name: string;
  outcome: "CREATED" | "UPDATED" | "SKIPPED";
  reason?: string;
  notes?: string[];
};
export type EmployeeImportState = {
  error?: string;
  errorDetail?: string;
  missingColumns?: string[];
  foundColumns?: string[];
  dryRun?: boolean;
  headerRow?: number;
  summary?: {
    created: number;
    updated: number;
    skipped: number;
    total: number;
  };
  rows?: ImportRowResult[];
};
export async function importEmployeesAction(
  _prev: EmployeeImportState,
  form: FormData,
): Promise<EmployeeImportState> {
  const user = await requirePermission("employee.write"),
    file = form.get("file"),
    dryRun = form.get("mode") !== "commit";
  if (!(file instanceof File) || !file.size)
    return { error: "common.required" };
  if (file.size > 3 * 1024 * 1024) return { error: "v2.fileTooLarge" };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { error: "v2.invalid" };
  try {
    const buffer = await file.arrayBuffer(),
      parsed = await readEmployeeSpreadsheet(buffer, file.name);
    const results: ImportRowResult[] = [];
    let created = 0,
      updated = 0,
      skipped = 0;
    await db.$transaction(
      async (tx) => {
        if (!dryRun)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('employee-spreadsheet-import'))`;
        for (const row of parsed.rows) {
          const result: ImportRowResult = {
            row: row.row,
            nationalId: row.nationalId,
            name: row.name,
            outcome: "SKIPPED",
            notes: row.notes,
          };
          results.push(result);
          if (row.reason || !row.data) {
            result.reason = row.reason;
            skipped++;
            continue;
          }
          if (!dryRun)
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"national:" + row.nationalId}))`;
          let existing = await tx.employee.findUnique({
            where: { nationalId: row.nationalId },
          });
          if (existing && !dryRun) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"employee:" + existing.id}))`;
            existing = await tx.employee.findUnique({
              where: { nationalId: row.nationalId },
            });
          }
          if (existing?.isArchived) {
            result.reason = "v2.importArchived";
            skipped++;
            continue;
          }
          if (existing) {
            const changes: Record<string, unknown> = {};
            let conflicts = false;
            for (const [key, value] of Object.entries(row.data)) {
              if (key === "name" || value === null || value === "") continue;
              const before = existing[key as keyof typeof existing];
              if (before === null || before === "") changes[key] = value;
              else if (
                String(
                  before instanceof Date ? before.toISOString() : before,
                ) !==
                String(value instanceof Date ? value.toISOString() : value)
              )
                conflicts = true;
            }
            if (conflicts) result.notes?.push("v2.importConflict");
            if (!Object.keys(changes).length) {
              result.reason = "v2.importNoChange";
              skipped++;
              continue;
            }
            if (!dryRun) {
              const employee = await tx.employee.update({
                where: { id: existing.id },
                data: changes as Prisma.EmployeeUpdateInput,
              });
              if (
                ["department", "jobTitle", "employeeNo"].some(
                  (k) => k in changes,
                )
              ) {
                await tx.employmentHistory.updateMany({
                  where: { employeeId: existing.id, effectiveTo: null },
                  data: { effectiveTo: new Date() },
                });
                await tx.employmentHistory.create({
                  data: {
                    employeeId: existing.id,
                    status: employee.employmentStatus,
                    department: employee.department,
                    jobTitle: employee.jobTitle,
                    employeeNo: employee.employeeNo,
                  },
                });
              }
              await writeAudit(
                {
                  user,
                  action: "UPDATE",
                  entity: "Employee",
                  entityId: existing.id,
                  summary: "استكمال بيانات من ملف الموظفين",
                  meta: { sourceRow: row.row, fields: Object.keys(changes) },
                },
                tx,
              );
            }
            result.outcome = "UPDATED";
            updated++;
          } else {
            if (!dryRun) {
              const employee = await tx.employee.create({
                data: {
                  nationalId: row.nationalId,
                  ...row.data,
                  createdById: user.id,
                },
              });
              await tx.employmentHistory.create({
                data: {
                  employeeId: employee.id,
                  status: "ACTIVE",
                  department: employee.department,
                  jobTitle: employee.jobTitle,
                  employeeNo: employee.employeeNo,
                },
              });
              await writeAudit(
                {
                  user,
                  action: "CREATE",
                  entity: "Employee",
                  entityId: employee.id,
                  summary: "إنشاء ملف من جدول الموظفين",
                  meta: { sourceRow: row.row },
                },
                tx,
              );
            }
            result.outcome = "CREATED";
            created++;
          }
        }
        if (!dryRun) {
          const sha256 = createHash("sha256")
            .update(Buffer.from(buffer))
            .digest("hex");
          const value = JSON.stringify({
            at: new Date().toISOString(),
            sha256,
            created,
            updated,
            skipped,
            total: results.length,
            issues: results
              .filter(
                (r) =>
                  (r.reason && r.reason !== "v2.importNoChange") ||
                  r.notes?.length,
              )
              .map((r) => ({
                row: r.row,
                reason: r.reason || null,
                notes: r.notes || [],
              }))
              .slice(0, 200),
          });
          await tx.setting.upsert({
            where: { key: "employees.import.latest" },
            create: { key: "employees.import.latest", value },
            update: { value },
          });
          await writeAudit(
            {
              user,
              action: "IMPORT_COMMIT",
              entity: "EmployeeSpreadsheet",
              summary: "استيراد بيانات الموظفين",
              meta: { sha256, created, updated, skipped },
            },
            tx,
          );
        }
      },
      { timeout: 120000 },
    );
    if (!dryRun)
      for (const path of [
        "/employees",
        "/portal",
        "/reports",
        "/due",
        "/dashboard",
      ])
        revalidatePath(path, "layout");
    return {
      dryRun,
      headerRow: parsed.headerRow,
      summary: { created, updated, skipped, total: results.length },
      rows: results.slice(0, 200),
    };
  } catch (e) {
    if (e instanceof Error && /^(empimp\.|v2\.)/.test(e.message))
      return { error: e.message };
    return actionError(e);
  }
}
