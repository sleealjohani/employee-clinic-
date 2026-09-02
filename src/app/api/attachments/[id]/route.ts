import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
export const dynamic = "force-dynamic";
const LIMIT = 2 * 1024 * 1024;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword)
    return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user.role, "clinical.read"))
    return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const file = await db.attachment.findUnique({
    where: { id },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      isComplete: true,
    },
  });
  if (!file || !file.isComplete)
    return new NextResponse("Not found", { status: 404 });
  if (new URL(request.url).searchParams.get("metadata") === "1")
    return NextResponse.json(
      {
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
        chunkBytes: LIMIT,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  const header = request.headers.get("range");
  if (!header && file.size > LIMIT)
    return NextResponse.redirect(new URL("/documents/" + id, request.url));
  const range = header ? /^bytes=(\d*)-(\d*)$/.exec(header) : null;
  if (header && (!range || (!range[1] && !range[2])))
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": "bytes */" + file.size },
    });
  const start = range
    ? range[1]
      ? Number(range[1])
      : Math.max(0, file.size - Number(range[2]))
    : 0;
  let end =
    range && range[1] && range[2]
      ? Math.min(Number(range[2]), file.size - 1)
      : file.size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= file.size
  )
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": "bytes */" + file.size },
    });
  end = Math.min(end, start + LIMIT - 1);
  const rows = await db.$queryRaw<
    { data: Uint8Array }[]
  >`SELECT substring(data FROM ${start + 1} FOR ${end - start + 1}) AS data FROM "Attachment" WHERE id=${id}`;
  if (!rows[0]) return new NextResponse("Not found", { status: 404 });
  if (start === 0)
    await writeAudit({
      user,
      action: "VIEW_SENSITIVE",
      entity: "Attachment",
      entityId: id,
      summary: "فتح مستند سريري",
    });
  const headers: Record<string, string> = {
    "Content-Type": file.mimeType,
    "Content-Disposition":
      "inline; filename*=UTF-8''" + encodeURIComponent(file.filename),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Content-Length": String(end - start + 1),
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${file.size}`;
  return new NextResponse(new Uint8Array(rows[0].data), {
    status: range ? 206 : 200,
    headers,
  });
}
