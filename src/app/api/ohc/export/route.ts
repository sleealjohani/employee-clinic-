import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { getOHC, lockOHC, sourceOHC } from "@/server/ohc-register";
import { writeAudit } from "@/lib/audit";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword)
    return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user.role, "reports.detailed") || !can(user.role, "sensitive.read"))
    return new NextResponse("Forbidden", { status: 403 });
  const original = new URL(request.url).searchParams.get("original") === "1";
  const result = await db.$transaction(
    async (tx) => {
      await lockOHC(tx);
      const register = await getOHC(tx);
      if (!register) return null;
      const current = original
        ? null
        : await tx.setting.findUnique({ where: { key: "ohc.current" } });
      const bytes = current
        ? Buffer.from(current.value, "base64")
        : await sourceOHC(register, tx);
      await writeAudit(
        {
          user,
          action: "EXPORT",
          entity: "OHCRegister",
          entityId: register.sha256,
          summary: "تصدير سجل التحصينات المرجعي",
          meta: { original, doses: register.doseCount },
        },
        tx,
      );
      return { bytes, filename: register.filename };
    },
    { timeout: 20000 },
  );
  if (!result) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="OHC-ALHADITHAH.xlsx"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
