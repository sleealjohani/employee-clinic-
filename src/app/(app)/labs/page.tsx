import { type LabFlag } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { TESTS, TEST_BY_CODE } from "@/lib/catalog/tests";
import { formatDate, formatValue, toDateInput } from "@/lib/format";
import { Card, Chip, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { Modal } from "@/components/ui/Modal";
import { SmartLabForm } from "@/components/forms/SmartClinicalForms";
import { LabResultRow } from "@/components/employee/LabResultRow";
import { LabsOperationalWorkspace } from "@/components/operations/OperationalWorkspaces";
import { IconImport, IconPlus } from "@/components/layout/icons";

export const metadata = { title: "التحاليل" };
export const dynamic = "force-dynamic";

export default async function LabsPage({
  searchParams,
}: {
  searchParams: Promise<{ test?: string; flag?: string; queue?: string }>;
}) {
  const user = await requirePath("/labs");
  const t = await getT();
  const params = await searchParams;
  const test = params.test ?? "";
  const flag = params.flag ?? "";
  const queue = params.queue ?? "";
  const canWrite = can(user.role, "clinical.write");
  const canVoid = can(user.role, "clinical.void");

  const [labs, employees, criticalCount, reviewCount] = await Promise.all([
    db.labResult.findMany({
      where: { status: { not: "ENTERED_IN_ERROR" } },
      orderBy: [{ collectedAt: "desc" }, { createdAt: "desc" }],
      take: 250,
      include: { employee: { select: { id: true, name: true } } },
    }),
    canWrite
      ? db.employee.findMany({
          where: { isArchived: false },
          orderBy: { name: "asc" },
          select: { id: true, name: true, nationalId: true, gender: true },
        })
      : Promise.resolve([]),
    db.labResult.count({
      where: { status: "ACTIVE", criticalNotifiedAt: null, flag: { in: ["CRITICAL_HIGH", "CRITICAL_LOW"] } },
    }),
    db.labResult.count({ where: { status: "ACTIVE", requiresReview: true, reviewedAt: null } }),
  ]);

  const records = labs.map((lab) => {
    const def = TEST_BY_CODE[lab.testCode];
    const testName = def ? (t.locale === "ar" ? def.nameAr : def.nameEn) : lab.testName;
    const value = lab.resultType === "QUANTITATIVE"
      ? `${formatValue(lab.valueNum)}${lab.unit ? ` ${lab.unit}` : ""}`
      : (lab.valueText ?? "—");
    const reference = lab.refText ?? (
      lab.refLow !== null && lab.refHigh !== null
        ? `${lab.refLow} – ${lab.refHigh}`
        : lab.refLow !== null
          ? `≥ ${lab.refLow}`
          : lab.refHigh !== null
            ? `< ${lab.refHigh}`
            : "—"
    );
    return {
      id: lab.id,
      employeeId: lab.employee.id,
      employeeName: lab.employee.name,
      dateKey: toDateInput(lab.collectedAt ?? lab.createdAt),
      dateLabel: formatDate(lab.collectedAt ?? lab.createdAt, t.locale),
      testCode: lab.testCode,
      testName,
      value,
      reference,
      flag: lab.flag,
      criticalOpen: (lab.flag === "CRITICAL_HIGH" || lab.flag === "CRITICAL_LOW") && lab.criticalNotifiedAt === null,
      needsReview: lab.requiresReview && lab.reviewedAt === null,
      reviewed: lab.reviewedAt !== null,
      notified: lab.criticalNotifiedAt !== null,
      orderNo: lab.orderNo,
      sampleNo: lab.sampleNo,
      performedBy: lab.performedBy,
      verifiedBy: lab.verifiedBy,
      labName: lab.labName,
    };
  });

  const actionable = labs.filter((lab) =>
    ((lab.flag === "CRITICAL_HIGH" || lab.flag === "CRITICAL_LOW") && !lab.criticalNotifiedAt) ||
    (lab.requiresReview && !lab.reviewedAt),
  );

  return (
    <>
      <PageHeader
        title={t("lab.title")}
        subtitle={t("lab.autoRef")}
        badge={<Chip tone="neutral">{labs.length}</Chip>}
        actions={
          <>
            <LinkButton href="/labs/import"><IconImport size={16} /> {t("nav.import")}</LinkButton>
            <DownloadLink href="/api/export/labs">{t("action.export")}</DownloadLink>
            {canWrite && (
              <Modal
                title={t("lab.new")}
                wide
                trigger={<button className="btn btn-primary"><IconPlus /> {t("lab.new")}</button>}
              >
                <SmartLabForm employees={employees} />
              </Modal>
            )}
          </>
        }
      />

      <LabsOperationalWorkspace
        records={records}
        initialQueue={queue}
        initialTest={test}
        initialFlag={flag}
        testOptions={TESTS.map((item) => ({ code: item.code, name: t.locale === "ar" ? item.nameAr : item.nameEn }))}
      />

      {actionable.length > 0 && canWrite && (
        <Card pad={false} className="mt-4 glass">
          <div className="px-4 py-3">
            <SectionTitle>
              {t.locale === "ar"
                ? `مسار التدخل السريري · حرجة ${criticalCount} · مراجعة ${reviewCount}`
                : `Clinical intervention lane · Critical ${criticalCount} · Review ${reviewCount}`}
            </SectionTitle>
          </div>
          <div className="border-t">
            {actionable.slice(0, 20).map((lab) => (
              <LabResultRow
                key={lab.id}
                lab={lab}
                t={t}
                canWrite={canWrite}
                canVoid={canVoid}
                showEmployee
                employeeName={lab.employee.name}
              />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
