import { Prisma, LabFlag } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { TESTS } from "@/lib/catalog/tests";
import { PageHeader, Card, Chip, Empty, LinkButton } from "@/components/ui";
import { Pagination, safePage } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { SmartLabForm } from "@/components/forms/SmartClinicalForms";
import { LabResultRow } from "@/components/employee/LabResultRow";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { ApproveAllLabsButton } from "@/components/employee/ApproveAllLabsButton";
import {
  labReviewSnapshot,
  pendingLabReviewWhere,
} from "@/lib/clinical/lab-review";
export const dynamic = "force-dynamic";
export default async function LabsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    test?: string;
    flag?: string;
    queue?: string;
    q?: string;
  }>;
}) {
  const user = await requirePermission("clinical.read"),
    t = await getT(),
    p = await searchParams,
    page = safePage(p.page),
    q = (p.q || "").trim().slice(0, 160);
  const test = TESTS.some((v) => v.code === p.test) ? p.test : undefined,
    flag = Object.values(LabFlag).includes(p.flag as LabFlag)
      ? (p.flag as LabFlag)
      : undefined;
  const critical: Prisma.LabResultWhereInput = {
    criticalNotifiedAt: null,
    OR: [
      { flag: { in: ["CRITICAL_HIGH", "CRITICAL_LOW"] } },
      {
        flag: "REACTIVE",
        testCode: { in: TESTS.filter((v) => v.sensitive).map((v) => v.code) },
      },
    ],
  };
  const queue: Prisma.LabResultWhereInput =
    p.queue === "critical"
      ? critical
      : p.queue === "review"
        ? { reviewedAt: null }
        : p.queue === "released"
          ? { releasedAt: { not: null } }
          : p.queue === "withheld"
            ? { releasedAt: null }
            : {};
  const where: Prisma.LabResultWhereInput = {
    status: "ACTIVE",
    testCode: test,
    flag,
    AND: [queue],
    ...(q
      ? {
          employee: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { nationalId: { contains: q } },
            ],
          },
        }
      : {}),
  };
  const write = can(user.role, "clinical.write");
  const [labs, total, employees, pendingReviews] = await Promise.all([
    db.labResult.findMany({
      where,
      orderBy: [{ collectedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * 25,
      take: 25,
      include: { employee: { select: { name: true } } },
    }),
    db.labResult.count({ where }),
    write
      ? db.employee.findMany({
          where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, nationalId: true, gender: true },
        })
      : Promise.resolve([]),
    write
      ? db.labResult.findMany({
          where: pendingLabReviewWhere,
          select: { id: true, updatedAt: true },
        })
      : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        title={t("lab.title")}
        badge={<Chip>{total}</Chip>}
        actions={
          <>
            {write && (
              <ApproveAllLabsButton
                snapshot={labReviewSnapshot(pendingReviews)}
              />
            )}
            {can(user.role, "import.run") && (
              <LinkButton href="/labs/import">{t("nav.import")}</LinkButton>
            )}
            <DownloadLink href="/api/export/labs">
              {t("action.export")}
            </DownloadLink>
            {write && (
              <Modal
                wide
                title={t("lab.new")}
                trigger={
                  <button className="btn btn-primary">{t("lab.new")}</button>
                }
              >
                <SmartLabForm employees={employees} />
              </Modal>
            )}
          </>
        }
      />
      <Card className="mb-5">
        <form method="get" className="filter-bar">
          <label>
            {t("v2.searchEmployee")}
            <input className="input" name="q" defaultValue={q} />
          </label>
          <label>
            {t("lab.test")}
            <select name="test" className="select" defaultValue={test || ""}>
              <option value="">{t("common.all")}</option>
              {TESTS.map((v) => (
                <option key={v.code} value={v.code}>
                  {t.locale === "ar" ? v.nameAr : v.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("lab.flag")}
            <select name="flag" className="select" defaultValue={flag || ""}>
              <option value="">{t("common.all")}</option>
              {Object.values(LabFlag).map((v) => (
                <option key={v} value={v}>
                  {t("flag." + v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("v2.reviewStatus")}
            <select
              name="queue"
              className="select"
              defaultValue={p.queue || ""}
            >
              <option value="">{t("common.all")}</option>
              {["critical", "review", "released", "withheld"].map((v) => (
                <option key={v} value={v}>
                  {t("v2.queue." + v)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary">{t("action.filter")}</button>
        </form>
      </Card>
      <Card pad={false}>
        {labs.length ? (
          labs.map((lab) => (
            <LabResultRow
              key={lab.id}
              lab={lab}
              t={t}
              canWrite={write}
              canVoid={can(user.role, "clinical.void")}
              showEmployee
              employeeName={lab.employee.name}
            />
          ))
        ) : (
          <Empty title={t("common.empty")} />
        )}
      </Card>
      <Pagination
        base="/labs"
        total={total}
        page={page}
        params={{ q, test, flag, queue: p.queue }}
      />
    </>
  );
}
