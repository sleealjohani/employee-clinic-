import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { MAX_UPLOAD_BYTES, importAvailability } from "@/lib/ai/extract";
import {
  Alert,
  Card,
  Chip,
  Empty,
  PageHeader,
  SectionTitle,
} from "@/components/ui";
import { Reveal } from "@/components/motion/Reveal";
import { UploadForm } from "./UploadForm";
import { Pagination, safePage } from "@/components/ui/Pagination";

export const metadata = { title: "استيراد تقارير المختبر" };
export const dynamic = "force-dynamic";
// A multi-page report can take a while to parse or, when configured, use the scan fallback.
export const maxDuration = 300;

const STATUS_TONE = {
  UPLOADED: "neutral",
  EXTRACTING: "warn",
  NEEDS_REVIEW: "warn",
  COMMITTED: "ok",
  FAILED: "danger",
} as const;

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission("import.run");
  const t = await getT();
  const ar = t.locale === "ar";
  const aiFallback = importAvailability();
  const page = safePage((await searchParams).page);

  const [batches, unmatched, total] = await Promise.all([
    db.labImportBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      skip: (page - 1) * 25,
      include: {
        uploadedBy: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.labImportItem.count({
      where: { matchStatus: "UNMATCHED", review: "PENDING" },
    }),
    db.labImportBatch.count(),
  ]);

  return (
    <>
      <PageHeader
        title={t("imp.title")}
        badge={
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="ok">{ar ? "PDF محلي" : "Local PDF"}</Chip>
            {aiFallback.enabled && (
              <Chip tone="accent">
                {ar ? "دعم المسح مفعّل" : "Scan fallback ready"}
              </Chip>
            )}
          </div>
        }
      />

      <Reveal className="mb-4">
        <Card className="specular">
          <UploadForm allowImages maxBytes={MAX_UPLOAD_BYTES} />
          <p className="muted mt-3">{t("v2.extractionFallback")}</p>
        </Card>
      </Reveal>

      {unmatched > 0 && (
        <Reveal className="mb-4" delay={60}>
          <Alert tone="warn" title={`${t("imp.unmatchedQueue")}: ${unmatched}`}>
            {t("imp.unmatchedHint")}
          </Alert>
        </Reveal>
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
              <tbody className="row-in">
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="font-semibold">
                      {batch.filename}
                      {batch.model?.startsWith("local-pdf-rules") && (
                        <span
                          className="ms-2 text-[0.65rem] font-semibold"
                          style={{ color: "var(--ok)" }}
                        >
                          {ar ? "محلي" : "local"}
                        </span>
                      )}
                    </td>
                    <td>
                      <Chip tone={STATUS_TONE[batch.status]} dot>
                        {t(`importStatus.${batch.status}`)}
                      </Chip>
                      {batch.error && (
                        <span
                          className="ms-2 text-xs"
                          style={{ color: "var(--danger)" }}
                        >
                          {t("imp.extractFailed")}
                        </span>
                      )}
                    </td>
                    <td className="num">{batch._count.items}</td>
                    <td className="num">{batch.pageCount || "—"}</td>
                    <td>{batch.uploadedBy?.name ?? "—"}</td>
                    <td className="num">
                      {formatDateTime(batch.createdAt, t.locale)}
                    </td>
                    <td>
                      <Link
                        href={`/labs/import/${batch.id}`}
                        prefetch={false}
                        className="btn btn-ghost btn-sm"
                      >
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
      <Pagination base="/labs/import" total={total} page={page} />
    </>
  );
}
