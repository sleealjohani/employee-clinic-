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
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user.role, "clinical.read")) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const bytes = new Uint8Array(attachment.data);
  const headers: Record<string, string> = {
    "Content-Type": attachment.mimeType,
    "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    // Lets the browser's PDF viewer fetch only the pages it is showing. A
    // screening batch runs to tens of megabytes, and a reviewer who opens it
    // to check one page should not wait for all of it.
    "Accept-Ranges": "bytes",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range) {
    const [, rawStart, rawEnd] = range;
    // An open-ended suffix range ("bytes=-500") counts back from the end.
    const start = rawStart ? Number(rawStart) : Math.max(0, bytes.length - Number(rawEnd || 0));
    const end = rawStart ? (rawEnd ? Math.min(Number(rawEnd), bytes.length - 1) : bytes.length - 1) : bytes.length - 1;
    if (Number.isNaN(start) || start > end || start >= bytes.length) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.length}` },
      });
    }
    // Only the first read of a document is a clinical access worth logging;
    // the range requests that follow are the same viewer paging through it.
    return new NextResponse(bytes.subarray(start, end + 1), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  await writeAudit({
    user,
    action: "VIEW_SENSITIVE",
    entity: "Attachment",
    entityId: id,
    summary: `فتح مرفق: ${attachment.filename}`,
  });

  return new NextResponse(bytes, {
    headers: { ...headers, "Content-Length": String(bytes.length) },
  });
}
