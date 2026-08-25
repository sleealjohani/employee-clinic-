import Link from "next/link";
import { Prisma, type LabFlag } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { TESTS } from "@/lib/catalog/tests";
import { Card, Chip, Empty, LinkButton, PageHeader } from "@/components/ui";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { Modal } from "@/components/ui/Modal";
import { SmartLabForm } from "@/components/forms/SmartClinicalForms";
import { LabResultRow } from "@/components/employee/LabResultRow";
import { IconImport, IconPlus } from "@/components/layout/icons";

export const metadata = { title: "التحاليل" };
export const dynamic = "force-dynamic";

const FLAGS: LabFlag[] = [
  "NORMAL",
  "LOW",
  "HIGH",
  "CRITICAL_LOW",
  "CRITICAL_HIGH",
  "REACTIVE",
  "NON_REACTIVE",
  "INDETERMINATE",
];

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

  const where: Prisma.LabResultWhereInput = {
    status: { not: "ENTERED_IN_ERROR" },
    ...(test ? { testCode: test } : {}),
    ...(flag ? { flag: flag as LabFlag } : {}),
    ...(queue === "review" ? { requiresReview: true, reviewedAt: null } : {}),
    ...(queue === "critical"
      ? { criticalNotifiedAt: null, flag: { in: ["CRITICAL_HIGH", "CRITICAL_LOW"] } }
      : {}),
  };

  const [labs, employees, criticalCount, reviewCount] = await Promise.all([
    db.labResult.findMany({
      where,
      orderBy: [{ collectedAt: "desc" }, { createdAt: "desc" }],
      take: 250,
      include: { employee: { select: { id: true, name: true } } },
    }),
    can(user.role, "clinical.write")
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

  return (
    <>
      <PageHeader
        title={t("lab.title")}
        subtitle={t("lab.autoRef")}
        badge={<Chip tone="neutral">{labs.length}</Chip>}
        actions={
          <>
            <LinkButton href="/labs/import">
              <IconImport size={16} /> {t("nav.import")}
            </LinkButton>
            <DownloadLink href="/api/export/labs">{t("action.export")}</DownloadLink>
            {can(user.role, "clinical.write") && (
              <Modal
                title={t("lab.new")}
                wide
                trigger={
                  <button className="btn btn-primary">
                    <IconPlus /> {t("lab.new")}
                  </button>
                }
              >
                <SmartLabForm employees={employees} />
              </Modal>
            )}
          </>
        }
      />

      {(criticalCount > 0 || reviewCount > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {criticalCount > 0 && (
            <Link href="/labs?queue=critical" className="btn btn-danger btn-sm">
              {t("dash.criticalOpen")}: {criticalCount}
            </Link>
          )}
          {reviewCount > 0 && (
            <Link href="/labs?queue=review" className="btn btn-ghost btn-sm">
              {t("dash.needsReview")}: {reviewCount}
            </Link>
          )}
        </div>
      )}

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-2.5">
          <div className="w-56">
            <label className="label" htmlFor="test">{t("lab.test")}</label>
            <select id="test" className="select" name="test" defaultValue={test}>
              <option value="">{t("common.all")}</option>
              {TESTS.map((d) => (
                <option key={d.code} value={d.code}>{t.locale === "ar" ? d.nameAr : d.nameEn}</option>
              ))}
            </select>
          </div>
          <div className="w-44">
            <label className="label" htmlFor="flag">{t("lab.flag")}</label>
            <select id="flag" className="select" name="flag" defaultValue={flag}>
              <option value="">{t("common.all")}</option>
              {FLAGS.map((f) => <option key={f} value={f}>{t(`flag.${f}`)}</option>)}
            </select>
          </div>
          <div className="w-44">
            <label className="label" htmlFor="queue">{t("dash.needsAction")}</label>
            <select id="queue" className="select" name="queue" defaultValue={queue}>
              <option value="">{t("common.all")}</option>
              <option value="review">{t("dash.needsReview")}</option>
              <option value="critical">{t("dash.criticalOpen")}</option>
            </select>
          </div>
          <button type="submit" className="btn btn-ghost">{t("action.filter")}</button>
        </form>
      </Card>

      <Card pad={false}>
        {labs.length === 0 ? (
          <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
        ) : (
          <div>
            {labs.map((lab) => (
              <LabResultRow
                key={lab.id}
                lab={lab}
                t={t}
                canWrite={can(user.role, "clinical.write")}
                canVoid={can(user.role, "clinical.void")}
                showEmployee
                employeeName={lab.employee.name}
              />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
