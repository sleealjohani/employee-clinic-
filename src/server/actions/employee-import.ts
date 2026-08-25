"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/current-user";
import { validateNationalId } from "@/lib/validation";
import { BLOOD_TYPES } from "@/lib/catalog/vaccines";

/**
 * Bulk load from the spreadsheet the clinic already keeps.
 *
 * This is what fills the system on day one, so it is deliberately forgiving
 * about column order and header language, and deliberately strict about
 * identity: a row without a usable national ID is reported, never guessed.
 */

export type ImportRowResult = {
  row: number;
  nationalId: string;
  name: string;
  outcome: "CREATED" | "UPDATED" | "SKIPPED";
  reason?: string;
};

export type EmployeeImportState = {
  error?: string;
  errorDetail?: string;
  /** True when this run only previewed the file and wrote nothing. */
  dryRun?: boolean;
  /** 1-based sheet row the headers were found on, so the user can see what was read. */
  headerRow?: number;
  summary?: { created: number; updated: number; skipped: number; total: number };
  rows?: ImportRowResult[];
};

/** Header aliases, Arabic and English, normalised to lower-case without spaces. */
const HEADERS: Record<string, string[]> = {
  nationalId: ["national id", "nationalid", "id", "iqama", "رقم الهوية", "الهوية", "هوية", "رقم الاقامة", "رقم الإقامة"],
  name: ["name", "full name", "الاسم", "اسم الموظف", "الاسم الكامل"],
  nameEn: ["name en", "english name", "الاسم بالانجليزية", "الاسم بالإنجليزية"],
  employeeNo: ["employee no", "employee number", "staff no", "file no", "الرقم الوظيفي", "رقم الموظف"],
  department: ["department", "dept", "القسم", "الادارة", "الإدارة"],
  jobTitle: ["job title", "title", "position", "المسمى الوظيفي", "الوظيفة"],
  gender: ["gender", "sex", "الجنس"],
  dob: ["dob", "date of birth", "birth date", "تاريخ الميلاد"],
  phone: ["phone", "mobile", "الجوال", "الهاتف", "رقم الجوال"],
  email: ["email", "البريد", "البريد الالكتروني", "البريد الإلكتروني"],
  hireDate: ["hire date", "joining date", "تاريخ التعيين", "تاريخ المباشرة"],
  bloodType: ["blood", "blood type", "blood group", "فصيلة الدم", "الفصيلة"],
};

function normalise(value: string): string {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\-/]/g, " ")
    .replace(/\s+/g, " ");
}

function mapHeaders(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((raw, index) => {
    const key = normalise(raw ?? "");
    if (!key) return;
    for (const [field, aliases] of Object.entries(HEADERS)) {
      if (map[field] !== undefined) continue;
      if (aliases.some((alias) => normalise(alias) === key)) map[field] = index;
    }
  });
  return map;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join("").trim();
    }
    return "";
  }
  return String(value).trim();
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  if (iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = value.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (dmy) {
    // Ambiguous d/m vs m/d: only accept it when the first field cannot be a month.
    const [, a, b, y] = dmy;
    if (Number(a) > 12) return new Date(`${y}-${b.padStart(2, "0")}-${a.padStart(2, "0")}T00:00:00Z`);
    return null;
  }
  return null;
}

function parseGender(value: string): "MALE" | "FEMALE" | null {
  const v = normalise(value);
  if (["m", "male", "ذكر", "1"].includes(v)) return "MALE";
  if (["f", "female", "انثى", "أنثى", "2"].includes(v)) return "FEMALE";
  return null;
}

export async function importEmployeesAction(
  _prev: EmployeeImportState,
  formData: FormData,
): Promise<EmployeeImportState> {
  const user = await requirePermission("employee.write");

  const file = formData.get("file");
  // Two explicit submit buttons rather than a checkbox: the user chooses to
  // preview or to import, and can never mistake one for the other.
  const dryRun = String(formData.get("mode") ?? "preview") !== "commit";
  if (!(file instanceof File) || file.size === 0) return { error: "common.required" };
  if (file.size > 5 * 1024 * 1024) return { error: "imp.uploadHint" };

  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  try {
    if (file.name.toLowerCase().endsWith(".csv")) {
      const text = new TextDecoder("utf-8").decode(buffer);
      const sheet = workbook.addWorksheet("csv");
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        sheet.addRow(line.split(",").map((c) => c.replace(/^"|"$/g, "")));
      }
    } else {
      await workbook.xlsx.load(buffer);
    }
  } catch {
    return { error: "common.error" };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) return { error: "empimp.empty" };

  // Real exports often carry a title and a date above the headers, so scan the
  // first rows for the one that actually names the columns rather than assuming
  // row 1 and failing the whole file.
  const SEARCH_DEPTH = Math.min(sheet.rowCount, 15);
  let headerRowNumber = 0;
  let map: Record<string, number> = {};

  for (let r = 1; r <= SEARCH_DEPTH; r++) {
    const header: string[] = [];
    sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      header[col - 1] = cellText(cell.value);
    });
    const candidate = mapHeaders(header);
    if (candidate.nationalId !== undefined && candidate.name !== undefined) {
      headerRowNumber = r;
      map = candidate;
      break;
    }
  }

  if (!headerRowNumber) {
    return {
      error: "empimp.noHeader",
      errorDetail: [...new Set(Object.values(HEADERS).map((a) => a[0]))].slice(0, 2).join(" / "),
    };
  }

  const results: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell.value);
    });

    const get = (field: string) => (map[field] !== undefined ? (cells[map[field]] ?? "") : "");

    const nationalId = get("nationalId").replace(/\s/g, "");
    const name = get("name");

    if (!nationalId && !name) continue; // blank row
    if (!nationalId) {
      results.push({ row: r, nationalId: "—", name, outcome: "SKIPPED", reason: "empimp.missingId" });
      skipped++;
      continue;
    }
    if (!validateNationalId(nationalId).valid) {
      results.push({ row: r, nationalId, name, outcome: "SKIPPED", reason: "emp.invalidId" });
      skipped++;
      continue;
    }
    if (!name) {
      results.push({ row: r, nationalId, name: "—", outcome: "SKIPPED", reason: "empimp.missingName" });
      skipped++;
      continue;
    }

    const blood = get("bloodType").toUpperCase().replace(/\s/g, "");
    const data = {
      name,
      nameEn: get("nameEn") || null,
      employeeNo: get("employeeNo") || null,
      department: get("department") || null,
      jobTitle: get("jobTitle") || null,
      gender: parseGender(get("gender")),
      dob: parseDate(get("dob")),
      phone: get("phone") || null,
      email: get("email") || null,
      hireDate: parseDate(get("hireDate")),
      bloodType: BLOOD_TYPES.includes(blood) ? blood : null,
    };

    const existing = await db.employee.findUnique({ where: { nationalId } });

    if (!dryRun) {
      if (existing) {
        // Only fill gaps — an import must never overwrite a curated record.
        await db.employee.update({
          where: { id: existing.id },
          data: {
            nameEn: existing.nameEn ?? data.nameEn,
            employeeNo: existing.employeeNo ?? data.employeeNo,
            department: existing.department ?? data.department,
            jobTitle: existing.jobTitle ?? data.jobTitle,
            gender: existing.gender ?? data.gender,
            dob: existing.dob ?? data.dob,
            phone: existing.phone ?? data.phone,
            email: existing.email ?? data.email,
            hireDate: existing.hireDate ?? data.hireDate,
            bloodType: existing.bloodType ?? data.bloodType,
          },
        });
      } else {
        const employee = await db.employee.create({
          data: { nationalId, ...data, createdById: user.id },
        });
        await db.employmentHistory.create({
          data: {
            employeeId: employee.id,
            department: employee.department,
            jobTitle: employee.jobTitle,
            employeeNo: employee.employeeNo,
            status: employee.employmentStatus,
          },
        });
      }
    }

    results.push({ row: r, nationalId, name, outcome: existing ? "UPDATED" : "CREATED" });
    if (existing) updated++;
    else created++;
  }

  if (!dryRun) {
    await writeAudit({
      user,
      action: "CREATE",
      entity: "Employee",
      summary: `استيراد ملف موظفين: ${created} جديد، ${updated} محدّث، ${skipped} متجاوز`,
      meta: { filename: file.name, created, updated, skipped },
    });
    revalidatePath("/employees");
  }

  return {
    dryRun,
    headerRow: headerRowNumber,
    summary: { created, updated, skipped, total: results.length },
    rows: results.slice(0, 200),
  };
}
