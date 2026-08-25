"use server";

import ExcelJS from "exceljs";
import { hijriToGregorian, looksHijriYear } from "@/lib/hijri";
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
  /**
   * Fields the row carried but that could not be read. The employee is still
   * imported — losing a person over one bad cell would be worse — but the cell
   * is named so it can be corrected at the source rather than quietly missing.
   */
  notes?: string[];
};

export type EmployeeImportState = {
  error?: string;
  errorDetail?: string;
  /** Required columns the sheet did not have, so the message can name them. */
  missingColumns?: string[];
  /** Headers the sheet did have, so the user can see what was read. */
  foundColumns?: string[];
  /** True when this run only previewed the file and wrote nothing. */
  dryRun?: boolean;
  /** 1-based sheet row the headers were found on, so the user can see what was read. */
  headerRow?: number;
  summary?: { created: number; updated: number; skipped: number; total: number };
  rows?: ImportRowResult[];
};

/**
 * Header aliases, Arabic and English. Matching runs on the normalised form, so
 * a spelling only needs to appear here once: "جهة العمل" also matches "جهه
 * العمل", "الإيميل" matches "الايميل", and so on.
 */
const HEADERS: Record<string, string[]> = {
  nationalId: [
    "national id", "nationalid", "national identity", "id", "id number", "identity",
    "iqama", "iqama no", "civil id", "civil record",
    "رقم الهوية", "الهوية", "هوية", "رقم الهويه الوطنيه", "الهوية الوطنية",
    "السجل المدني", "رقم السجل المدني", "سجل مدني", "رقم الاقامة", "الاقامة",
  ],
  name: ["name", "full name", "employee name", "الاسم", "اسم الموظف", "الاسم الكامل", "اسم"],
  nameEn: ["name en", "english name", "name in english", "الاسم بالانجليزية", "الاسم الانجليزي"],
  employeeNo: [
    "employee no", "employee number", "staff no", "file no", "emp no", "badge",
    "الرقم الوظيفي", "رقم الموظف", "رقم الوظيفي", "الرقم الوظيفى", "رقم الملف",
  ],
  department: [
    "department", "dept", "unit", "section", "work location",
    "القسم", "الادارة", "الوحدة", "جهة العمل", "جهة العمل الفعلية", "مكان العمل", "الموقع",
  ],
  jobTitle: [
    "job title", "title", "position", "job", "specialty", "speciality",
    "المسمى الوظيفي", "الوظيفة", "التخصص", "المهنة", "الدرجة الوظيفية",
  ],
  gender: ["gender", "sex", "الجنس", "النوع"],
  dob: ["dob", "date of birth", "birth date", "birthdate", "تاريخ الميلاد", "الميلاد", "تاريخ الميلاد هجري"],
  phone: ["phone", "mobile", "mobile no", "contact", "الجوال", "الهاتف", "رقم الجوال", "الجوال الشخصي", "رقم الهاتف"],
  email: ["email", "e mail", "mail", "البريد", "البريد الالكتروني", "الايميل", "بريد الكتروني"],
  hireDate: [
    "hire date", "joining date", "date of joining", "start date", "appointment date",
    "تاريخ التعيين", "تاريخ المباشرة", "تاريخ الالتحاق", "تاريخ التوظيف",
  ],
  bloodType: ["blood", "blood type", "blood group", "فصيلة الدم", "الفصيلة", "زمرة الدم"],
};

/**
 * Fold the spelling variants that separate the same Arabic word in practice —
 * hamza forms, taa marbuta, alef maqsura, tatweel and diacritics — plus Arabic
 * -Indic digits. Header matching and small controlled vocabularies (gender)
 * compare on this form. Stored values are never normalised: a person's name is
 * kept exactly as the sheet spells it.
 */
function normalise(value: string): string {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[_\-/.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Distinctive fragments, used only after exact matching has failed and only for
 * fields where a partial match cannot land on the wrong column. "اسم الموظف
 * الكامل" is a name column; "رقم الهوية الوطنية" is an identity column. Fields
 * whose words appear inside other headers — a bare "تاريخ", say — are absent
 * here on purpose.
 */
const HEADER_FRAGMENTS: Record<string, string[]> = {
  nationalId: ["سجل مدني", "رقم الهويه", "الهويه الوطنيه", "national id", "civil record"],
  name: ["اسم الموظف", "اسم المنسوب", "employee name", "full name"],
  employeeNo: ["الرقم الوظيفي", "employee number"],
  dob: ["تاريخ الميلاد", "date of birth"],
  hireDate: ["تاريخ التعيين", "تاريخ المباشره", "hire date", "joining date"],
  phone: ["رقم الجوال", "mobile"],
  email: ["البريد الالكتروني", "email"],
  department: ["جهه العمل", "القسم", "department"],
  jobTitle: ["المسمى الوظيفي", "job title"],
};

function mapHeaders(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const keys = header.map((raw) => normalise(raw ?? ""));

  // Exact matches first, so an unambiguous header always wins its column.
  keys.forEach((key, index) => {
    if (!key) return;
    for (const [field, aliases] of Object.entries(HEADERS)) {
      if (map[field] !== undefined) continue;
      if (aliases.some((alias) => normalise(alias) === key)) map[field] = index;
    }
  });

  // Then fall back to containment for whatever is still unclaimed.
  const taken = new Set(Object.values(map));
  keys.forEach((key, index) => {
    if (!key || taken.has(index)) return;
    for (const [field, fragments] of Object.entries(HEADER_FRAGMENTS)) {
      if (map[field] !== undefined) continue;
      if (fragments.some((fragment) => key.includes(normalise(fragment)))) {
        map[field] = index;
        taken.add(index);
        break;
      }
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

/** Excel's day-zero. Serials outside a working lifetime are not dates at all. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const EXCEL_MIN_SERIAL = 3653;   // 1910-01-01
const EXCEL_MAX_SERIAL = 55153;  // 2050-12-31

function utc(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects the 31st of a 30-day month rather than rolling it into the next.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/**
 * Read a date cell from a real personnel sheet.
 *
 * These files mix four notations in one column: dates Excel stored properly,
 * dates that lost their formatting and show as a serial number, Hijri dates
 * typed as text, and Gregorian dates typed as text — in either day-first or
 * year-first order, with any of / . -, sometimes followed by هـ.
 *
 * Ambiguity is resolved rather than guessed: a four-digit year between 1290 and
 * 1510 is Hijri and is converted through Umm al-Qura; anything else is read as
 * Gregorian. A value that cannot be read confidently returns null, and the row
 * reports why — a birth date is never invented.
 */
function parseDate(value: string): Date | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  // Strip the era marker and any bidi control the sheet carried along.
  const text = raw
    .replace(/[\u200e\u200f\u061c]/g, "")
    // Era markers: هـ/هجري for Hijri, م/ميلادي for Gregorian. Both are written
    // after the date and neither carries information the year does not.
    .replace(/\s*(?:هـ|هجري|ه\.?|AH|م|ميلادي|AD|CE)\s*$/iu, "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .trim();
  if (!text) return null;

  // A cell ExcelJS already gave us as a date arrives here as ISO.
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(`${text.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // A bare integer is an Excel serial whose cell lost its date format.
  if (/^\d+$/.test(text)) {
    const serial = Number(text);
    if (serial < EXCEL_MIN_SERIAL || serial > EXCEL_MAX_SERIAL) return null;
    return new Date(EXCEL_EPOCH + serial * 86_400_000);
  }

  const parts = text.split(/[/.\-\s]+/).filter(Boolean);
  if (parts.length !== 3 || parts.some((part) => !/^\d{1,4}$/.test(part))) return null;
  const [a, b, c] = parts.map(Number);

  // Year-first (1411/02/19) or day-first (19/02/1411); the month is always
  // the middle field in both, which is what makes this decidable.
  const yearFirst = a > 31;
  const year = yearFirst ? a : c;
  const month = b;
  const day = yearFirst ? c : a;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  if (looksHijriYear(year)) return hijriToGregorian(year, month, day);
  if (year < 1900 || year > 2100) return null;
  return utc(year, month, day);
}

/** A date that cannot belong to an employment record is a data-entry error. */
function plausible(date: Date | null, minAge: number, maxAge: number): Date | null {
  if (!date) return null;
  const years = (Date.now() - date.getTime()) / 31_557_600_000;
  return years >= minAge && years <= maxAge ? date : null;
}

function parseGender(value: string): "MALE" | "FEMALE" | null {
  const v = normalise(value);
  // Normalisation already folds أنثى/انثي/انثى together and ذكر/دكر apart, so
  // the common misspelling is listed explicitly.
  if (["m", "male", "ذكر", "دكر", "1"].includes(v)) return "MALE";
  if (["f", "female", "انثي", "2"].includes(v)) return "FEMALE";
  return null;
}

/**
 * Saudi mobile numbers are stored every which way — 0501234567, 501234567,
 * +966501234567. Normalise to the local 05 form so a number is searchable and
 * two spellings of one number are not two different values.
 */
function parsePhone(value: string): string | null {
  const digits = (value ?? "").replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
  if (!digits) return null;
  const local = digits.replace(/^00966/, "").replace(/^966/, "");
  if (/^5\d{8}$/.test(local)) return `0${local}`;
  if (/^05\d{8}$/.test(local)) return local;
  return value.trim() || null;
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
  // The likeliest header row even when it is unusable, so a rejection can name
  // the columns the sheet actually has instead of only the ones it wants.
  let bestRow: string[] = [];
  let bestScore = -1;

  for (let r = 1; r <= SEARCH_DEPTH; r++) {
    const header: string[] = [];
    sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      header[col - 1] = cellText(cell.value);
    });
    const candidate = mapHeaders(header);
    const score = Object.keys(candidate).length;
    if (score > bestScore) {
      bestScore = score;
      bestRow = header;
    }
    if (candidate.nationalId !== undefined && candidate.name !== undefined) {
      headerRowNumber = r;
      map = candidate;
      break;
    }
  }

  if (!headerRowNumber) {
    const missing: string[] = [];
    const best = mapHeaders(bestRow);
    if (best.nationalId === undefined) missing.push("nationalId");
    if (best.name === undefined) missing.push("name");
    return {
      error: "empimp.noHeader",
      missingColumns: missing,
      foundColumns: bestRow.filter(Boolean).slice(0, 12),
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

    const notes: string[] = [];
    const rawDob = get("dob");
    const rawHire = get("hireDate");
    const dob = plausible(parseDate(rawDob), 14, 100);
    const hireDate = plausible(parseDate(rawHire), 0, 60);
    if (rawDob && !dob) notes.push("empimp.note.dob");
    if (rawHire && !hireDate) notes.push("empimp.note.hireDate");

    const blood = get("bloodType").toUpperCase().replace(/\s/g, "");
    const data = {
      name,
      nameEn: get("nameEn") || null,
      employeeNo: get("employeeNo") || null,
      department: get("department") || null,
      jobTitle: get("jobTitle") || null,
      gender: parseGender(get("gender")),
      dob,
      phone: parsePhone(get("phone")),
      email: get("email").toLowerCase() || null,
      hireDate,
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

    results.push({
      row: r,
      nationalId,
      name,
      outcome: existing ? "UPDATED" : "CREATED",
      notes: notes.length ? notes : undefined,
    });
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
