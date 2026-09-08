import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { Alert, LinkButton, PageHeader } from "@/components/ui";
import { PersonalHealthFileHost } from "@/components/employee/PersonalHealthFileHost";

export const dynamic = "force-dynamic";

type StoredFileRow = {
  data: unknown;
  revision: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function dateOnly(value: Date | null): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

function compactRecord(
  entries: Array<[string, unknown]>,
): Record<string, unknown> {
  return Object.fromEntries(
    entries.filter(([, value]) => {
      if (value === null || value === undefined) return false;
      return typeof value !== "string" || value.trim().length > 0;
    }),
  );
}

export default async function PersonalHealthFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePath("/employees");
  const { id } = await params;

  const [employee, stored] = await Promise.all([
    db.employee.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        nationalId: true,
        dob: true,
        gender: true,
        phone: true,
        employeeNo: true,
        department: true,
        jobTitle: true,
        hireDate: true,
        nationality: true,
        bloodType: true,
        isArchived: true,
      },
    }),
    db.$queryRaw<StoredFileRow[]>`
      SELECT "data", "revision"
      FROM "PersonalHealthFile"
      WHERE "employeeId" = ${id}
    `,
  ]);

  if (!employee) notFound();

  // The booklet can contain HIV/hepatitis screening and the complete clinical
  // history, so opening it is recorded as a sensitive-view event.
  await writeAudit({
    user,
    action: "VIEW_SENSITIVE",
    entity: "PersonalHealthFile",
    entityId: employee.id,
    summary: `تصفح الملف الصحي: ${employee.name}`,
  });

  const saved = stored[0];
  const seed = compactRecord([
    ["nationalId", employee.nationalId],
    ["fullName", employee.name],
    ["birthDate", dateOnly(employee.dob)],
    ["nationality", employee.nationality],
    [
      "gender",
      employee.gender === "MALE"
        ? "ذكر"
        : employee.gender === "FEMALE"
          ? "أنثى"
          : undefined,
    ],
    ["bloodGroup", employee.bloodType],
    ["employeeNo", employee.employeeNo],
    ["jobTitle", employee.jobTitle],
    ["department", employee.department],
    ["hireDate", dateOnly(employee.hireDate)],
    ["mobile", employee.phone],
  ]);

  // Once the nurse has saved the booklet, that JSON is authoritative. Do not
  // silently merge changing profile fields into it; the printed record must
  // round-trip exactly as the clinic last saved it.
  const initialData = saved && isRecord(saved.data) ? saved.data : seed;
  const revision = saved?.revision ?? 0;
  const editable = can(user.role, "clinical.write") && !employee.isArchived;

  return (
    <>
      <PageHeader
        title={`الملف الصحي — ${employee.name}`}
        subtitle="Personal Health File · عيادة صحة العاملين"
        actions={
          <LinkButton href={`/employees/${employee.id}`}>
            العودة إلى ملف الموظف
          </LinkButton>
        }
      />

      {employee.isArchived && (
        <div className="mb-4">
          <Alert tone="neutral">
            ملف الموظف مؤرشف؛ يمكن تصفح وطباعة الملف الصحي، لكن التعديل والحفظ متوقفان.
          </Alert>
        </div>
      )}

      <PersonalHealthFileHost
        employeeId={employee.id}
        initialData={initialData}
        initialRevision={revision}
        editable={editable}
      />
    </>
  );
}
