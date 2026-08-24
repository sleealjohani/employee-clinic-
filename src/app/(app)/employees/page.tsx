import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { ageFrom, formatDate } from "@/lib/format";
import { completeness } from "@/lib/clinical/rules";
import { Card, Chip, Empty, LinkButton, Meter, PageHeader } from "@/components/ui";
import { IconAllergy, IconPlus, IconSearch } from "@/components/layout/icons";

export const metadata = { title: "الموظفون" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; archived?: string; page?: string; dept?: string }>;
}) {
  const user = await requirePath("/employees");
  const t = await getT();
  const params = await searchParams;

  const q = (params.q ?? "").trim();
  const view = params.view === "list" ? "list" : "grid";
  const showArchived = params.archived === "1";
  const page = Math.max(1, Number(params.page ?? 1) || 1);
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
        visits: { orderBy: { visitDate: "desc" }, take: 1, select: { visitDate: true } },
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

  const linkWith = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q, view, archived: showArchived ? "1" : undefined, dept: dept || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `/employees?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={t("emp.title")}
        subtitle={t("emp.subtitle")}
        badge={
          <Chip tone="neutral">
            {total} {t("emp.count")}
          </Chip>
        }
        actions={
          canWrite ? (
            <>
              <LinkButton href="/employees/import">Excel</LinkButton>
              <LinkButton href="/employees/new" variant="primary">
                <IconPlus /> {t("emp.new")}
              </LinkButton>
            </>
          ) : null
        }
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-[15rem] flex-1">
            <label className="label" htmlFor="q">
              {t("action.search")}
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute top-1/2 -translate-y-1/2"
                style={{ insetInlineStart: "0.7rem", color: "var(--text-faint)" }}
              >
                <IconSearch size={16} />
              </span>
              <input
                id="q"
                className="input"
                name="q"
                defaultValue={q}
                placeholder={t("emp.searchPlaceholder")}
                style={{ paddingInlineStart: "2.1rem" }}
              />
            </div>
          </div>
          <div className="w-44">
            <label className="label" htmlFor="dept">
              {t("emp.department")}
            </label>
            <select id="dept" className="select" name="dept" defaultValue={dept}>
              <option value="">{t("common.all")}</option>
              {departments.map((d) => (
                <option key={d.department} value={d.department ?? ""}>
                  {d.department}
                </option>
              ))}
            </select>
          </div>
          <input type="hidden" name="view" value={view} />
          <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold">
            <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} />
            {t("emp.showArchived")}
          </label>
          <button type="submit" className="btn btn-ghost">
            {t("action.filter")}
          </button>
          <div className="ms-auto flex gap-1">
            <Link
              href={linkWith({ view: "grid", page: undefined })}
              className={`btn btn-sm ${view === "grid" ? "btn-primary" : "btn-ghost"}`}
            >
              {t("emp.grid")}
            </Link>
            <Link
              href={linkWith({ view: "list", page: undefined })}
              className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-ghost"}`}
            >
              {t("emp.list")}
            </Link>
          </div>
        </form>
      </Card>

      {employees.length === 0 ? (
        <Card>
          <Empty
            title={t("common.empty")}
            hint={t("common.emptyHint")}
            action={canWrite ? <LinkButton href="/employees/new">{t("emp.new")}</LinkButton> : null}
          />
        </Card>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {employees.map((emp) => {
            const c = completeness(emp);
            const severe = emp.allergies.some(
              (a) => a.severity === "SEVERE" || a.severity === "LIFE_THREATENING",
            );
            return (
              <Link key={emp.id} href={`/employees/${emp.id}`} className="card card-pad block transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{emp.name}</p>
                    <p className="num mt-0.5 text-xs" style={{ color: "var(--text-faint)" }} dir="ltr">
                      {emp.nationalId}
                    </p>
                  </div>
                  {emp.isArchived && <Chip tone="neutral">{t("emp.archived")}</Chip>}
                </div>

                <p className="mt-2 truncate text-xs" style={{ color: "var(--text-muted)" }}>
                  {emp.jobTitle ?? "—"}
                  {emp.department ? ` · ${emp.department}` : ""}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {emp.allergies.length > 0 && (
                    <Chip tone={severe ? "danger" : "warn"}>
                      <IconAllergy size={12} /> {emp.allergies.length}
                    </Chip>
                  )}
                  {emp.bloodType && (
                    <Chip tone="neutral">
                      <span dir="ltr">{emp.bloodType}</span>
                    </Chip>
                  )}
                  {emp.visits[0] && (
                    <Chip tone="neutral">
                      {t("emp.lastVisit")}: {formatDate(emp.visits[0].visitDate, t.locale)}
                    </Chip>
                  )}
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                    <span>{t("emp.completeness")}</span>
                    <span className="num">{c.score}%</span>
                  </div>
                  <Meter value={c.score} tone={c.score === 100 ? "ok" : c.score >= 70 ? "accent" : "warn"} />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("emp.name")}</th>
                  <th>{t("emp.nationalId")}</th>
                  <th>{t("emp.employeeNo")}</th>
                  <th>{t("emp.department")}</th>
                  <th>{t("emp.jobTitle")}</th>
                  <th>{t("emp.age")}</th>
                  <th>{t("emp.completeness")}</th>
                  <th>{t("emp.lastVisit")}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const c = completeness(emp);
                  return (
                    <tr key={emp.id}>
                      <td>
                        <Link href={`/employees/${emp.id}`} className="font-semibold" style={{ color: "var(--accent-text)" }}>
                          {emp.name}
                        </Link>
                        {emp.isArchived && (
                          <span className="ms-2">
                            <Chip tone="neutral">{t("emp.archived")}</Chip>
                          </span>
                        )}
                      </td>
                      <td className="num" dir="ltr">
                        {emp.nationalId}
                      </td>
                      <td className="num" dir="ltr">
                        {emp.employeeNo ?? "—"}
                      </td>
                      <td>{emp.department ?? "—"}</td>
                      <td>{emp.jobTitle ?? "—"}</td>
                      <td className="num">{ageFrom(emp.dob) ?? "—"}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="num text-xs">{c.score}%</span>
                          <span className="w-16">
                            <Meter value={c.score} tone={c.score === 100 ? "ok" : "warn"} />
                          </span>
                        </div>
                      </td>
                      <td>{emp.visits[0] ? formatDate(emp.visits[0].visitDate, t.locale) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2 no-print">
          {page > 1 && (
            <Link href={linkWith({ page: String(page - 1) })} className="btn btn-ghost btn-sm">
              {t("action.prev")}
            </Link>
          )}
          <span className="num text-xs" style={{ color: "var(--text-muted)" }}>
            {t("common.page")} {page} {t("common.of")} {pages}
          </span>
          {page < pages && (
            <Link href={linkWith({ page: String(page + 1) })} className="btn btn-ghost btn-sm">
              {t("action.next")}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
