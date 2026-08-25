import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import { MAX_UPLOAD_BYTES, EXTRACTION_MODEL, PROMPT_VERSION, importAvailability } from "@/lib/ai/extract";
import { LOCAL_EXTRACTION_MODEL, LOCAL_PROMPT_VERSION } from "@/lib/import/local-pdf";
import { ACCEPTED_UPLOAD_TYPES, stageBatch } from "@/lib/import/stage-batch";
import { CHUNK_BYTES } from "@/lib/import/chunk";

/**
 * Chunked upload for large lab batches.
 *
 * A serverless request body is capped well below the size of a real screening
 * batch — a 30 MB PDF posted to a Server Action is rejected by the platform
 * before the application ever sees it. The browser therefore slices the file
 * and posts it a few megabytes at a time, and each chunk is appended straight
 * onto the attachment row in the database rather than assembled in memory.
 *
 * Nothing about the clinical path changes: the finished file goes through the
 * same extractor and lands as candidates awaiting a human.
 */

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await requirePermission("import.run");
  const step = request.nextUrl.searchParams.get("step");

  if (step === "init") return init(request, user);
  if (step === "chunk") return chunk(request);
  if (step === "finish") return finish(request, user);
  return NextResponse.json({ error: "imp.uploadHint" }, { status: 400 });
}

type Actor = Awaited<ReturnType<typeof requirePermission>>;

async function init(request: NextRequest, user: Actor) {
  const body = (await request.json()) as { filename?: string; mimeType?: string; size?: number };
  const filename = (body.filename ?? "").slice(0, 200);
  const mimeType = body.mimeType ?? "";
  const size = Number(body.size ?? 0);

  if (!filename || !size) return NextResponse.json({ error: "common.required" }, { status: 400 });
  if (size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "imp.tooLarge" }, { status: 413 });
  if (!ACCEPTED_UPLOAD_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: "imp.uploadHint" }, { status: 415 });
  }
  // Images have no text layer, so they can only be read by the optional
  // external fallback. Refuse them up front rather than after a long upload.
  if (mimeType !== "application/pdf" && !importAvailability().enabled) {
    return NextResponse.json({ error: "imp.uploadHint" }, { status: 415 });
  }

  const local = mimeType === "application/pdf";
  const attachment = await db.attachment.create({
    data: {
      filename,
      mimeType,
      // Filled in as the chunks land; the finish step reconciles both.
      size: 0,
      sha256: "",
      data: Buffer.alloc(0),
      uploadedById: user.id,
    },
  });

  const batch = await db.labImportBatch.create({
    data: {
      attachmentId: attachment.id,
      filename,
      status: "UPLOADED",
      model: local ? LOCAL_EXTRACTION_MODEL : EXTRACTION_MODEL,
      promptVersion: local ? LOCAL_PROMPT_VERSION : PROMPT_VERSION,
      uploadedById: user.id,
    },
  });

  return NextResponse.json({ batchId: batch.id, attachmentId: attachment.id, chunkBytes: CHUNK_BYTES });
}

async function chunk(request: NextRequest) {
  const attachmentId = request.nextUrl.searchParams.get("id") ?? "";
  if (!attachmentId) return NextResponse.json({ error: "common.error" }, { status: 400 });

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength === 0) return NextResponse.json({ error: "common.error" }, { status: 400 });

  // Append in the database so the whole file is never held in one invocation,
  // and refuse to grow a row past the ceiling even if the client lies.
  const updated = await db.$executeRaw`
    UPDATE "Attachment"
       SET data = data || ${bytes},
           size = octet_length(data) + ${bytes.byteLength}
     WHERE id = ${attachmentId}
       AND octet_length(data) + ${bytes.byteLength} <= ${MAX_UPLOAD_BYTES}
  `;
  if (updated === 0) return NextResponse.json({ error: "imp.tooLarge" }, { status: 413 });

  return NextResponse.json({ ok: true });
}

async function finish(request: NextRequest, user: Actor) {
  const body = (await request.json()) as { batchId?: string };
  const batchId = body.batchId ?? "";
  const batch = await db.labImportBatch.findUnique({
    where: { id: batchId },
    include: { attachment: true },
  });
  if (!batch) return NextResponse.json({ error: "common.error" }, { status: 404 });

  const bytes = Buffer.from(batch.attachment.data);
  if (bytes.byteLength === 0) {
    await db.labImportBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", error: "imp.uploadIncomplete" },
    });
    return NextResponse.json({ error: "imp.uploadIncomplete" }, { status: 400 });
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await db.attachment.update({
    where: { id: batch.attachmentId },
    data: { sha256, size: bytes.byteLength },
  });
  await db.labImportBatch.update({ where: { id: batch.id }, data: { status: "EXTRACTING" } });

  await writeAudit({
    user,
    action: "IMPORT_UPLOAD",
    entity: "LabImportBatch",
    entityId: batch.id,
    summary: `رفع تقرير مختبر للاستخراج: ${batch.filename}`,
    meta: {
      sha256,
      size: bytes.byteLength,
      mimeType: batch.attachment.mimeType,
      transport: "chunked",
    },
  });

  await stageBatch({ batchId: batch.id, bytes, mimeType: batch.attachment.mimeType, user });

  return NextResponse.json({ batchId: batch.id });
}
