import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { ageFrom, formatDate } from "@/lib/format";
import { profileCompletion } from "@/lib/clinic-config";
import { getClinicConfig } from "@/server/queries/settings";
import { safePage } from "@/components/ui/Pagination";
import { LinkButton } from "@/components/ui";
import {
  IconEmployees,
  IconImport,
  IconPlus,
  IconSearch,
} from "@/components/layout/icons";
import {
  EmployeeDirectoryWorkspace,
  type DirectoryEmployee,
} from "@/components/employee/EmployeeDirectoryWorkspace";

export const metadata = { title: "الموظفون" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 36;

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    archived?: string;
    page?: string;
    dept?: string;
  }>;
}) {
  const user = await requirePath("/employees");
  const t = await getT();
  const params = await searchParams;

  const q = (params.q ?? "").trim();
  const showArchived = params.archived === "1";
  const page = safePage(params.page);
  const config = await getClinicConfig();
  const dept = (params.dept ?? "").trim();

  const where: Prisma.EmployeeWhereInput = {
    isArchived: showArchived ? undefined : false,
    ...(dept ? { department: dept } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { nameEn: { contains: q, mode: "insensitive" } },
            { nationalId: { contains: q } },
            { employeeNo: { contains: q } },
          ],
        }
      : {}),
  };

  const [total, employees, departments] = await Promise.all([
    db.employee.count({ where }),
    db.employee.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { visits: true, labResults: true } },
        allergies: {
          where: { allergyStatus: "ACTIVE", status: "ACTIVE" },
          select: { id: true, severity: true },
        },
        visits: {
          orderBy: { visitDate: "desc" },
          take: 1,
          select: { visitDate: true },
        },
      },
    }),
    db.employee.findMany({
      where: { isArchived: false, department: { not: null } },
      distinct: ["department"],
      select: { department: true },
      orderBy: { department: "asc" },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canWrite = can(user.role, "employee.write");
  const ar = t.locale === "ar";

  const directoryEmployees: DirectoryEmployee[] = employees.map((employee) => {
    const recordCompleteness = profileCompletion(
      employee,
      config.requiredProfileFields,
    ).percent;
    const severeAllergy = employee.allergies.some(
      (allergy) =>
        allergy.severity === "SEVERE" ||
        allergy.severity === "LIFE_THREATENING",
    );

    return {
      id: employee.id,
      name: employee.name,
      nameEn: employee.nameEn,
      nationalId: employee.nationalId,
      employeeNo: employee.employeeNo,
      department: employee.department,
      jobTitle: employee.jobTitle,
      bloodType: employee.bloodType,
      age: ageFrom(employee.dob),
      isArchived: employee.isArchived,
      completeness: recordCompleteness,
      visitsCount: employee._count.visits,
      labsCount: employee._count.labResults,
      allergyCount: employee.allergies.length,
      severeAllergy,
      lastVisit: employee.visits[0]
        ? formatDate(employee.visits[0].visitDate, t.locale)
        : null,
    };
  });

  const visibleAttention = directoryEmployees.filter(
    (employee) => employee.severeAllergy,
  ).length;
  const visibleIncomplete = directoryEmployees.filter(
    (employee) => employee.completeness < 100,
  ).length;

  const linkWith = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = {
      q,
      archived: showArchived ? "1" : undefined,
      dept: dept || undefined,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged))
      if (value) sp.set(key, value);
    const query = sp.toString();
    return query ? `/employees?${query}` : "/employees";
  };

  return (
    <>
      <section
        className="glass-strong mb-4 overflow-hidden rounded-[1.6rem] border p-4 sm:p-5"
        style={{ borderColor: "var(--glass-border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
              style={{
                color: "var(--accent-text)",
                background: "var(--accent-soft)",
              }}
            >
              <IconEmployees size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="mt-1 text-xl font-black sm:text-2xl">
                {ar ? "مركز ملفات الموظفين" : "Employee record center"}
              </h1>
            </div>
          </div>

          {canWrite && (
            <div className="flex flex-wrap gap-2 no-print">
              <LinkButton href="/employees/import">
                <IconImport size={15} /> Excel
              </LinkButton>
              <LinkButton href="/employees/new" variant="primary">
                <IconPlus /> {t("emp.new")}
              </LinkButton>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div
            className="rounded-2xl border px-3 py-2.5"
            style={{
              background: "color-mix(in srgb, var(--surface) 72%, transparent)",
              borderColor: "var(--border)",
            }}
          >
            <span
              className="text-[0.61rem] font-bold"
              style={{ color: "var(--text-faint)" }}
            >
              {ar ? "النتائج" : "Results"}
            </span>
            <strong className="num mt-1 block text-lg">{total}</strong>
          </div>
          <div
            className="rounded-2xl border px-3 py-2.5"
            style={{
              background: "color-mix(in srgb, var(--surface) 72%, transparent)",
              borderColor: "var(--border)",
            }}
          >
            <span
              className="text-[0.61rem] font-bold"
              style={{ color: "var(--text-faint)" }}
            >
              {ar ? "تنبيهات حساسية بالصفحة" : "Allergy alerts on page"}
            </span>
            <strong
              className="num mt-1 block text-lg"
              style={{
                color: visibleAttention ? "var(--danger)" : "var(--text)",
              }}
            >
              {visibleAttention}
            </strong>
          </div>
          <div
            className="rounded-2xl border px-3 py-2.5"
            style={{
              background: "color-mix(in srgb, var(--surface) 72%, transparent)",
              borderColor: "var(--border)",
            }}
          >
            <span
              className="text-[0.61rem] font-bold"
              style={{ color: "var(--text-faint)" }}
            >
              {ar ? "ملفات تحتاج استكمال" : "Records needing completion"}
            </span>
            <strong
              className="num mt-1 block text-lg"
              style={{
                color: visibleIncomplete ? "var(--warn)" : "var(--text)",
              }}
            >
              {visibleIncomplete}
            </strong>
          </div>
        </div>
      </section>

      <form
        method="get"
        className="glass mb-3 flex flex-wrap items-end gap-2.5 rounded-[1.25rem] p-3 no-print"
      >
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="q">
            {t("action.search")}
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute top-1/2 -translate-y-1/2"
              style={{
                insetInlineStart: "0.72rem",
                color: "var(--text-faint)",
              }}
            >
              <IconSearch size={16} />
            </span>
            <input
              id="q"
              className="input"
              name="q"
              defaultValue={q}
              placeholder={t("emp.searchPlaceholder")}
              style={{ paddingInlineStart: "2.2rem" }}
            />
          </div>
        </div>

        <div className="w-48 max-w-full">
          <label className="label" htmlFor="dept">
            {t("emp.department")}
          </label>
          <select id="dept" className="select" name="dept" defaultValue={dept}>
            <option value="">{t("common.all")}</option>
            {departments.map((department) => (
              <option
                key={department.department}
                value={department.department ?? ""}
              >
                {department.department}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={showArchived}
          />
          {t("emp.showArchived")}
        </label>

        <button type="submit" className="btn btn-primary">
          {t("action.filter")}
        </button>
        {(q || dept || showArchived) && (
          <Link href="/employees" className="btn btn-ghost">
            {ar ? "مسح" : "Clear"}
          </Link>
        )}
      </form>

      {directoryEmployees.length === 0 ? (
        <div className="glass rounded-[1.25rem] p-8 text-center">
          <p className="text-sm font-bold">{t("common.empty")}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
            {t("common.emptyHint")}
          </p>
          {canWrite && (
            <div className="mt-3">
              <LinkButton href="/employees/new">{t("emp.new")}</LinkButton>
            </div>
          )}
        </div>
      ) : (
        <EmployeeDirectoryWorkspace
          employees={directoryEmployees}
          locale={t.locale}
        />
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2 no-print">
          {page > 1 && (
            <Link
              href={linkWith({ page: String(page - 1) })}
              className="btn btn-ghost btn-sm"
            >
              {t("action.prev")}
            </Link>
          )}
          <span className="num text-xs" style={{ color: "var(--text-muted)" }}>
            {t("common.page")} {page} {t("common.of")} {pages}
          </span>
          {page < pages && (
            <Link
              href={linkWith({ page: String(page + 1) })}
              className="btn btn-ghost btn-sm"
            >
              {t("action.next")}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
