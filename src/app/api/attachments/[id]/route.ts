import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Attachments live in Postgres and are only ever served through this route, so
 * every read is authenticated, authorised and logged. There is no public URL
 * for a clinical document.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user.role, "clinical.read")) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  await writeAudit({
    user,
    action: "VIEW_SENSITIVE",
    entity: "Attachment",
    entityId: id,
    summary: `فتح مرفق: ${attachment.filename}`,
  });

  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
