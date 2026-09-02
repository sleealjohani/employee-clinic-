import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { MAX_UPLOAD_BYTES } from "@/lib/ai/extract";
import { stageBatch, resolveUploadType } from "@/lib/import/stage-batch";
import { CHUNK_BYTES } from "@/lib/import/chunk";
import { ClinicError } from "@/lib/action-result";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return fail("auth.invalid", 401);
  if (!can(user.role, "import.run")) return fail("v2.denied", 403);
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host"))
    return fail("v2.denied", 403);
  try {
    const step = request.nextUrl.searchParams.get("step");
    if (step === "init") return await init(request, user);
    if (step === "chunk") return await chunk(request, user);
    if (step === "finish") return await finish(request, user);
    return fail("v2.invalid");
  } catch (error) {
    if (error instanceof ClinicError) return fail(error.key, 409);
    console.error("[upload]", error instanceof Error ? error.name : "error");
    return fail("common.error", 500);
  }
}
async function init(request: NextRequest, user: CurrentUser) {
  const body = await request.json(),
    filename = String(body.filename || "")
      .trim()
      .slice(0, 200),
    size = Number(body.size),
    sha256 = String(body.sha256 || "");
  const type = resolveUploadType(String(body.mimeType || ""), filename);
  if (!filename || !Number.isSafeInteger(size) || size <= 0)
    return fail("v2.invalid");
  if (size > MAX_UPLOAD_BYTES) return fail("imp.tooLarge", 413);
  if (!type) return fail("imp.badFormat", 415);
  if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) return fail("v2.invalid");
  if (sha256) {
    const duplicate = await db.attachment.findFirst({
      where: { sha256, isComplete: true },
      select: { id: true, importBatch: { select: { id: true, status: true } } },
    });
    if (duplicate?.importBatch)
      return NextResponse.json({
        attachmentId: duplicate.id,
        batchId: duplicate.importBatch.id,
        complete: true,
        status: duplicate.importBatch.status,
        chunkBytes: CHUNK_BYTES,
      });
  }
  const result = await db.$transaction(async (tx) => {
    const attachment = await tx.attachment.create({
      data: {
        filename,
        mimeType: type,
        size: 0,
        expectedSize: size,
        isComplete: false,
        sha256,
        data: Buffer.alloc(0),
        uploadedById: user.id,
      },
    });
    const batch = await tx.labImportBatch.create({
      data: { attachmentId: attachment.id, filename, uploadedById: user.id },
    });
    return {
      attachmentId: attachment.id,
      batchId: batch.id,
      chunkBytes: CHUNK_BYTES,
    };
  });
  return NextResponse.json(result);
}
async function chunk(request: NextRequest, user: CurrentUser) {
  const id = request.nextUrl.searchParams.get("id") || "",
    offset = Number(request.nextUrl.searchParams.get("offset"));
  if (
    !id ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset % CHUNK_BYTES !== 0
  )
    return fail("v2.invalid");
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > CHUNK_BYTES)
    return fail("imp.tooLarge", 413);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"upload:" + id}))`;
    const file = await tx.attachment.findUnique({
      where: { id },
      select: { expectedSize: true, isComplete: true, uploadedById: true },
    });
    if (!file || file.uploadedById !== user.id) return "DENIED";
    if (file.isComplete) return "COMPLETE";
    if (
      !file.expectedSize ||
      offset + bytes.length > file.expectedSize ||
      bytes.length !== Math.min(CHUNK_BYTES, file.expectedSize - offset)
    )
      return "INVALID";
    const previous = await tx.attachmentChunk.findUnique({
      where: { attachmentId_offset: { attachmentId: id, offset } },
      select: { sha256: true, size: true },
    });
    if (previous)
      return previous.sha256 === sha256 && previous.size === bytes.length
        ? "OK"
        : "CONFLICT";
    await tx.attachmentChunk.create({
      data: {
        attachmentId: id,
        offset,
        size: bytes.length,
        sha256,
        data: bytes,
      },
    });
    await tx.attachment.update({
      where: { id },
      data: { size: { increment: bytes.length } },
    });
    return "OK";
  });
  if (outcome === "DENIED") return fail("v2.denied", 403);
  if (outcome !== "OK")
    return fail(
      outcome === "INVALID" ? "imp.uploadIncomplete" : "v2.conflict",
      409,
    );
  return NextResponse.json({ ok: true });
}
async function finish(request: NextRequest, user: CurrentUser) {
  const body = await request.json(),
    batchId = String(body.batchId || "");
  const batch = await db.labImportBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, attachmentId: true, uploadedById: true },
  });
  if (!batch) return fail("v2.invalid", 404);
  if (["NEEDS_REVIEW", "COMMITTED"].includes(batch.status))
    return NextResponse.json({ batchId: batch.id });
  const outcome = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"upload:" + batch.attachmentId}))`;
      const file = await tx.attachment.findUniqueOrThrow({
        where: { id: batch.attachmentId },
      });
      if (file.isComplete) return file;
      if (file.uploadedById !== user.id) throw new ClinicError("v2.denied");
      const parts = await tx.attachmentChunk.findMany({
        where: { attachmentId: file.id },
        orderBy: { offset: "asc" },
      });
      let offset = 0;
      for (const part of parts) {
        if (part.offset !== offset || part.size !== part.data.length)
          throw new ClinicError("imp.uploadIncomplete");
        offset += part.size;
      }
      if (offset !== file.expectedSize)
        throw new ClinicError("imp.uploadIncomplete");
      const bytes = Buffer.concat(parts.map((p) => Buffer.from(p.data)));
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (file.sha256 && file.sha256 !== hash)
        throw new ClinicError("v2.hashMismatch");
      const signature =
        file.mimeType === "application/pdf"
          ? bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))
          : file.mimeType === "image/png"
            ? bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : file.mimeType === "image/jpeg"
              ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
              : bytes.subarray(0, 4).toString() === "RIFF" &&
                bytes.subarray(8, 12).toString() === "WEBP";
      if (!signature) throw new ClinicError("imp.badFormat");
      const completed = await tx.attachment.update({
        where: { id: file.id },
        data: {
          data: bytes,
          sha256: hash,
          size: bytes.length,
          isComplete: true,
        },
      });
      await tx.attachmentChunk.deleteMany({ where: { attachmentId: file.id } });
      await writeAudit(
        {
          user,
          action: "IMPORT_UPLOAD",
          entity: "LabImportBatch",
          entityId: batch.id,
          summary: "اكتمال رفع تقرير مختبر",
          meta: { sha256: hash, size: bytes.length },
        },
        tx,
      );
      return completed;
    },
    { timeout: 60000 },
  );
  await stageBatch({
    batchId,
    bytes: Buffer.from(outcome.data),
    mimeType: outcome.mimeType,
    user,
  });
  return NextResponse.json({ batchId });
}
