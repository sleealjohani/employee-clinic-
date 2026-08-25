import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { importAvailability } from "@/lib/ai/extract";
import { Alert, Card, Chip, Empty, PageHeader, SectionTitle } from "@/components/ui";
import { UploadForm } from "./UploadForm";

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

export default async function ImportPage() {
  await requirePermission("import.run");
  const t = await getT();
  const ar = t.locale === "ar";
  const aiFallback = importAvailability();

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
        subtitle={
          ar
            ? "استخراج محلي خاص أولاً، ثم مراجعة بشرية قبل إضافة أي نتيجة للملف الصحي"
            : "Private local extraction first, followed by human review before anything reaches the health record"
        }
        badge={
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="ok">{ar ? "PDF محلي" : "Local PDF"}</Chip>
            {aiFallback.enabled && <Chip tone="accent">{ar ? "دعم المسح مفعّل" : "Scan fallback ready"}</Chip>}
          </div>
        }
      />

      <div className="mb-4 space-y-3">
        <Alert tone="info" title={ar ? "المسار الافتراضي خاص وبدون تكلفة API" : "Private, no-API-cost default path"}>
          {ar
            ? "ملفات PDF الرقمية ذات النص القابل للتحديد تُقرأ داخل خادم النظام باستخدام قواعد ثابتة. لا يتم إرسال التقرير إلى Anthropic أو أي مزود ذكاء اصطناعي، وتبقى كل نتيجة في قائمة المراجعة قبل اعتمادها."
            : "Digital PDFs with selectable text are read inside the application server using deterministic rules. The report is not sent to Anthropic or another AI provider, and every result still enters the review queue before approval."}
        </Alert>

        {!aiFallback.enabled && (
          <Alert tone="neutral" title={ar ? "الصور والملفات الممسوحة" : "Scans and images"}>
            {ar
              ? "الاستيراد المجاني يدعم PDF الرقمي. إذا كان الملف صورة أو PDF ممسوحًا بلا طبقة نص، استخدم نسخة PDF رقمية من المختبر. يمكن إضافة مفتاح AI لاحقًا فقط كخيار احتياطي لهذه الحالات."
              : "The free importer supports digital PDFs. For an image or image-only scanned PDF, use a digital PDF exported by the laboratory. An AI key can remain an optional fallback for those cases later."}
          </Alert>
        )}

        <Card>
          <SectionTitle>{t("imp.upload")}</SectionTitle>
          <UploadForm allowImages={aiFallback.enabled} />
        </Card>
      </div>

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
                    <td className="font-semibold">
                      {batch.filename}
                      {batch.model?.startsWith("local-pdf-rules") && (
                        <span className="ms-2 text-[0.65rem] font-semibold" style={{ color: "var(--ok)" }}>
                          {ar ? "محلي" : "local"}
                        </span>
                      )}
                    </td>
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
                      <Link href={`/labs/import/${batch.id}`} prefetch={false} className="btn btn-ghost btn-sm">
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
