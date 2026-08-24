import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { importEnabled, EXTRACTION_MODEL } from "@/lib/ai/extract";
import { Alert, Card, Chip, Empty, PageHeader, SectionTitle } from "@/components/ui";
import { UploadForm } from "./UploadForm";

export const metadata = { title: "استيراد تقارير المختبر" };
export const dynamic = "force-dynamic";
// A multi-page report can take a while to transcribe.
export const maxDuration = 300;

const STATUS_TONE = {
  UPLOADED: "neutral",
  EXTRACTING: "warn",
  NEEDS_REVIEW: "warn",
  COMMITTED: "ok",
  FAILED: "danger",
} as const;

export default async function ImportPage() {
  await requirePermission("import.run");
  const t = await getT();
  const enabled = importEnabled();

  const [batches, unmatched] = await Promise.all([
    db.labImportBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        uploadedBy: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.labImportItem.count({ where: { matchStatus: "UNMATCHED", review: "PENDING" } }),
  ]);

  return (
    <>
      <PageHeader
        title={t("imp.title")}
        subtitle={t("imp.subtitle")}
        badge={enabled ? <Chip tone="accent">{EXTRACTION_MODEL}</Chip> : <Chip tone="neutral">—</Chip>}
      />

      {!enabled ? (
        <Alert tone="neutral" title={t("imp.disabled")}>
          {t("imp.disabledHint")}
        </Alert>
      ) : (
        <div className="mb-4 space-y-3">
          <Alert tone="info">{t("imp.privacy")}</Alert>
          <Card>
            <SectionTitle>{t("imp.upload")}</SectionTitle>
            <UploadForm />
          </Card>
        </div>
      )}

      {unmatched > 0 && (
        <div className="mb-4">
          <Alert tone="warn" title={`${t("imp.unmatchedQueue")}: ${unmatched}`}>
            {t("imp.unmatchedHint")}
          </Alert>
        </div>
      )}

      <Card pad={false}>
        <div className="px-4 py-3">
          <SectionTitle>{t("imp.batches")}</SectionTitle>
        </div>
        {batches.length === 0 ? (
          <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
        ) : (
          <div className="table-wrap border-t">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("imp.file")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("imp.extracted")}</th>
                  <th>{t("imp.pages")}</th>
                  <th>{t("common.by")}</th>
                  <th>{t("common.date")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="font-semibold">{batch.filename}</td>
                    <td>
                      <Chip tone={STATUS_TONE[batch.status]} dot>
                        {t(`importStatus.${batch.status}`)}
                      </Chip>
                      {batch.error && (
                        <span className="ms-2 text-xs" style={{ color: "var(--danger)" }}>
                          {batch.error.startsWith("imp.") ? t(batch.error) : batch.error}
                        </span>
                      )}
                    </td>
                    <td className="num">{batch._count.items}</td>
                    <td className="num">{batch.pageCount || "—"}</td>
                    <td>{batch.uploadedBy?.name ?? "—"}</td>
                    <td className="num">{formatDateTime(batch.createdAt, t.locale)}</td>
                    <td>
                      <Link href={`/labs/import/${batch.id}`} className="btn btn-ghost btn-sm">
                        {t("imp.review")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
