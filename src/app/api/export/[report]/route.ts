import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { getT } from "@/lib/i18n";
import { buildAggregateSummary, buildReport, reportById } from "@/server/queries/reports";
import { addDays, startOfDay, toDateInput } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { report: reportId } = await params;
  const meta = reportById(reportId);
  if (!meta) return new NextResponse("Not found", { status: 404 });
  if (!can(user.role, meta.permission)) return new NextResponse("Forbidden", { status: 403 });

  const t = await getT();
  const url = new URL(request.url);
  const from = url.searchParams.get("from")
    ? new Date(url.searchParams.get("from")!)
    : addDays(startOfDay(), -90);
  const to = url.searchParams.get("to") ? new Date(`${url.searchParams.get("to")}T23:59:59`) : new Date();

  // The administrative viewer never receives a row-level export.
  const table = can(user.role, "reports.detailed")
    ? await buildReport(meta.id, t.locale, { from, to })
    : await buildAggregateSummary(t.locale);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Employee Clinic — Al Hadeethah General Hospital";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(table.title.slice(0, 30), {
    views: [{ rightToLeft: t.locale === "ar", state: "frozen", ySplit: 3 }],
  });

  sheet.mergeCells(1, 1, 1, Math.max(table.columns.length, 1));
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${t("app.hospital")} — ${t("app.name")} — ${table.title}`;
  titleCell.font = { bold: true, size: 13, color: { argb: "FF1C6B87" } };
  titleCell.alignment = { horizontal: "center" };

  sheet.mergeCells(2, 1, 2, Math.max(table.columns.length, 1));
  const rangeCell = sheet.getCell(2, 1);
  rangeCell.value = meta.dateRange
    ? `${t("rep.from")} ${toDateInput(from)} ${t("rep.to")} ${toDateInput(to)} · ${t("rep.rows")}: ${table.rows.length}`
    : `${t("rep.rows")}: ${table.rows.length}`;
  rangeCell.font = { size: 10, color: { argb: "FF5C7183" } };
  rangeCell.alignment = { horizontal: "center" };

  const header = sheet.addRow([]);
  header.values = table.columns;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1489BD" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 22;

  for (const row of table.rows) sheet.addRow(row);

  table.columns.forEach((column, index) => {
    const width = Math.min(
      42,
      Math.max(
        12,
        column.length + 4,
        ...table.rows.slice(0, 200).map((r) => String(r[index] ?? "").length + 2),
      ),
    );
    sheet.getColumn(index + 1).width = width;
  });

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: Math.max(table.columns.length, 1) },
  };

  await writeAudit({
    user,
    action: "EXPORT",
    entity: "Report",
    entityId: meta.id,
    summary: `تصدير تقرير ${table.title} (${table.rows.length} صف)`,
    meta: { report: meta.id, rows: table.rows.length },
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${meta.id}-${toDateInput(new Date())}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
