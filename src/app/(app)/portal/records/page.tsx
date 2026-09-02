import { db } from "@/lib/db";
import { requireEmployee } from "@/server/queries/portal";
import { getT } from "@/lib/i18n";
import { formatDate, formatValue } from "@/lib/format";
import { Card, PageHeader, Empty, Chip } from "@/components/ui";
import { PrintButton } from "@/components/ui/PrintButton";
import { Pagination, safePage } from "@/components/ui/Pagination";
import { TEST_BY_CODE } from "@/lib/catalog/tests";
import { flagTone } from "@/lib/clinical/rules";
export default async function MyRecords({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; section?: string }>;
}) {
  const { employee, user } = await requireEmployee();
  const t = await getT();
  const params = await searchParams;
  const page = safePage(params.page);
  const section = params.section === "vaccines" ? "vaccines" : "labs";
  const labWhere = {
    employeeId: employee.id,
    status: "ACTIVE" as const,
    releasedAt: { not: null },
  };
  const vaccineWhere = { employeeId: employee.id, status: "ACTIVE" as const };
  const [labs, vaccines, total] = await Promise.all([
    db.labResult.findMany({
      where: labWhere,
      orderBy: [{ collectedAt: "desc" }, { createdAt: "desc" }],
      skip: section === "labs" ? (page - 1) * 25 : 0,
      take: 25,
    }),
    db.vaccination.findMany({
      where: vaccineWhere,
      orderBy: { givenAt: "desc" },
      skip: section === "vaccines" ? (page - 1) * 25 : 0,
      take: 25,
    }),
    section === "labs"
      ? db.labResult.count({ where: labWhere })
      : db.vaccination.count({ where: vaccineWhere }),
  ]);
  const { writeAudit } = await import("@/lib/audit");
  await writeAudit({
    user,
    action: "VIEW_SENSITIVE",
    entity: "Employee",
    entityId: employee.id,
    summary: "اطلاع الموظف على سجله المنشور",
  });
  return (
    <>
      <PageHeader
        title={t("v2.myRecords")}
        subtitle={t("v2.recordsHint")}
        actions={<PrintButton />}
      />
      <p className="print-only">
        {employee.name} · {employee.employeeNo}
      </p>
      <div className="tabs mb-5">
        <a
          href="/portal/records"
          aria-current={section === "labs" ? "page" : undefined}
        >
          {t("v2.releasedLabs")}
        </a>
        <a
          href="/portal/records?section=vaccines"
          aria-current={section === "vaccines" ? "page" : undefined}
        >
          {t("v2.recordedVaccines")}
        </a>
      </div>
      <Card>
        {section === "labs" ? (
          labs.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("lab.test")}</th>
                    <th>{t("lab.value")}</th>
                    <th>{t("lab.unit")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("common.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {labs.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {TEST_BY_CODE[l.testCode]
                          ? t.locale === "ar"
                            ? TEST_BY_CODE[l.testCode].nameAr
                            : TEST_BY_CODE[l.testCode].nameEn
                          : l.testName}
                      </td>
                      <td className="num">
                        {l.resultType === "QUANTITATIVE"
                          ? (l.comparator === "EQ"
                              ? ""
                              : { LT: "<", LE: "≤", GT: ">", GE: "≥" }[
                                  l.comparator
                                ]) + formatValue(l.valueNum)
                          : l.valueText}
                      </td>
                      <td className="num">{l.unit || "—"}</td>
                      <td>
                        <Chip tone={flagTone(l.flag)}>
                          {t("flag." + l.flag)}
                        </Chip>
                      </td>
                      <td className="num">
                        {formatDate(l.collectedAt, t.locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={t("v2.noReleasedLabs")} />
          )
        ) : vaccines.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("vac.vaccine")}</th>
                  <th>{t("vac.dose")}</th>
                  <th>{t("vac.givenAt")}</th>
                  <th>{t("vac.nextDue")}</th>
                </tr>
              </thead>
              <tbody>
                {vaccines.map((v) => (
                  <tr key={v.id}>
                    <td>{v.vaccineName}</td>
                    <td className="num">{v.doseNumber}</td>
                    <td className="num">{formatDate(v.givenAt, t.locale)}</td>
                    <td className="num">{formatDate(v.nextDueAt, t.locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={t("v2.noVaccines")} />
        )}
        <Pagination
          total={total}
          page={page}
          base="/portal/records"
          params={{ section }}
        />
      </Card>
    </>
  );
}
