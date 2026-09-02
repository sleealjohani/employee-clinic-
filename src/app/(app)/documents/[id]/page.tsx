import { requirePermission } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { AttachmentPreview } from "@/components/clinic/AttachmentPreview";
export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission("clinical.read");
  const { id } = await params;
  const file = await db.attachment.findUnique({
    where: { id },
    select: { filename: true, isComplete: true },
  });
  if (!file?.isComplete) notFound();
  return (
    <>
      <PageHeader title={file.filename} />
      <Card>
        <AttachmentPreview
          id={id}
          page={Math.max(
            1,
            Math.min(1000, Number((await searchParams).page) || 1),
          )}
        />
      </Card>
    </>
  );
}
