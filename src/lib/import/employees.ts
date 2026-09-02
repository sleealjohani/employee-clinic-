import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { z } from "zod";
import { hijriToGregorian, looksHijriYear } from "@/lib/hijri";
import { validateNationalId } from "@/lib/validation";
import { latinDigits } from "@/lib/clinical/numeric";
import { BLOOD_TYPES } from "@/lib/catalog/vaccines";
const HEADERS: Record<string, string[]> = {
  nationalId: [
    "national id",
    "nationalid",
    "national identity",
    "id",
    "id number",
    "identity",
    "iqama",
    "iqama no",
    "civil id",
    "civil record",
    "رقم الهوية",
    "الهوية",
    "هوية",
    "رقم الهويه الوطنيه",
    "الهوية الوطنية",
    "السجل المدني",
    "رقم السجل المدني",
    "سجل مدني",
    "رقم الاقامة",
    "الاقامة",
  ],
  name: [
    "name",
    "full name",
    "employee name",
    "الاسم",
    "اسم الموظف",
    "الاسم الكامل",
    "اسم",
  ],
  nameEn: [
    "name en",
    "english name",
    "name in english",
    "الاسم بالانجليزية",
    "الاسم الانجليزي",
  ],
  employeeNo: [
    "employee no",
    "employee number",
    "staff no",
    "file no",
    "emp no",
    "badge",
    "الرقم الوظيفي",
    "رقم الموظف",
    "رقم الوظيفي",
    "الرقم الوظيفى",
    "رقم الملف",
  ],
  department: [
    "department",
    "dept",
    "unit",
    "section",
    "work location",
    "القسم",
    "الادارة",
    "الوحدة",
    "جهة العمل",
    "جهة العمل الفعلية",
    "مكان العمل",
    "الموقع",
  ],
  jobTitle: [
    "job title",
    "title",
    "position",
    "job",
    "specialty",
    "speciality",
    "المسمى الوظيفي",
    "الوظيفة",
    "التخصص",
    "المهنة",
    "الدرجة الوظيفية",
  ],
  gender: ["gender", "sex", "الجنس", "النوع"],
  dob: [
    "dob",
    "date of birth",
    "birth date",
    "birthdate",
    "تاريخ الميلاد",
    "الميلاد",
    "تاريخ الميلاد هجري",
  ],
  phone: [
    "phone",
    "mobile",
    "mobile no",
    "contact",
    "الجوال",
    "الهاتف",
    "رقم الجوال",
    "الجوال الشخصي",
    "رقم الهاتف",
  ],
  email: [
    "email",
    "e mail",
    "mail",
    "البريد",
    "البريد الالكتروني",
    "الايميل",
    "بريد الكتروني",
  ],
  hireDate: [
    "hire date",
    "joining date",
    "date of joining",
    "start date",
    "appointment date",
    "تاريخ التعيين",
    "تاريخ المباشرة",
    "تاريخ الالتحاق",
    "تاريخ التوظيف",
  ],
  bloodType: [
    "blood",
    "blood type",
    "blood group",
    "فصيلة الدم",
    "الفصيلة",
    "زمرة الدم",
  ],
  nationality: ["nationality", "الجنسية"],
  qualification: ["qualification", "المؤهل"],
  employmentType: [
    "employment type",
    "نوع البرنامج",
    "نوع البرنامج (تشغيل/خدمه مدنيه)",
    "نوع التوظيف",
  ],
  assignedFacility: ["assigned facility", "الملاك الوظيفي", "الملاك الوضيفي"],
  workLocation: [
    "current work location",
    "مكان العمل الحالي",
    "موقع العمل الحالي",
  ],
  personnelNotes: ["personnel notes", "الملاحظات", "ملاحظات"],
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
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
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
  employmentType: ["نوع البرنامج", "نوع التوظيف", "employment type"],
  nationalId: [
    "سجل مدني",
    "رقم الهويه",
    "الهويه الوطنيه",
    "national id",
    "civil record",
  ],
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
    if ("text" in value && typeof value.text === "string")
      return value.text.trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((r) => r.text)
        .join("")
        .trim();
    }
    return "";
  }
  return String(value).trim();
}

/** Excel's day-zero. Serials outside a working lifetime are not dates at all. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const EXCEL_MIN_SERIAL = 3653; // 1910-01-01
const EXCEL_MAX_SERIAL = 55153; // 2050-12-31

function utc(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects the 31st of a 30-day month rather than rolling it into the next.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
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
    const [y, m, d] = text.slice(0, 10).split("-").map(Number);
    return looksHijriYear(y) ? hijriToGregorian(y, m, d) : utc(y, m, d);
  }

  // A bare integer is an Excel serial whose cell lost its date format.
  if (/^\d+$/.test(text)) {
    const serial = Number(text);
    if (serial < EXCEL_MIN_SERIAL || serial > EXCEL_MAX_SERIAL) return null;
    return new Date(EXCEL_EPOCH + serial * 86_400_000);
  }

  const parts = text.split(/[/.\-\s]+/).filter(Boolean);
  if (parts.length !== 3 || parts.some((part) => !/^\d{1,4}$/.test(part)))
    return null;
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
function plausible(
  date: Date | null,
  minAge: number,
  maxAge: number,
): Date | null {
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
  const digits = (value ?? "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, "");
  if (!digits) return null;
  const local = digits.replace(/^00966/, "").replace(/^966/, "");
  if (/^5\d{8}$/.test(local)) return `0${local}`;
  if (/^05\d{8}$/.test(local)) return local;
  return null;
}

export type ImportEmployeeData = {
  name: string;
  nameEn: string | null;
  employeeNo: string | null;
  department: string | null;
  jobTitle: string | null;
  gender: "MALE" | "FEMALE" | null;
  dob: Date | null;
  phone: string | null;
  email: string | null;
  hireDate: Date | null;
  bloodType: string | null;
  nationality: string | null;
  qualification: string | null;
  employmentType: string | null;
  assignedFacility: string | null;
  workLocation: string | null;
  personnelNotes: string | null;
};
export type ParsedEmployeeRow = {
  row: number;
  nationalId: string;
  name: string;
  data?: ImportEmployeeData;
  reason?: string;
  notes: string[];
};
export async function readEmployeeSpreadsheet(
  buffer: ArrayBuffer | Uint8Array,
  filename: string,
) {
  const workbook = new ExcelJS.Workbook();
  if (filename.toLowerCase().endsWith(".csv"))
    await workbook.csv.read(
      Readable.from([Buffer.from(buffer as Uint8Array)]),
      { parserOptions: { headers: false, ignoreEmpty: true } },
    );
  else await workbook.xlsx.load(buffer as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) throw new Error("empimp.empty");
  if (sheet.rowCount > 5001 || sheet.columnCount > 100)
    throw new Error("v2.invalid");
  let headerRow = 0,
    map: Record<string, number> = {},
    foundColumns: string[] = [];
  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    const values: string[] = [];
    sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      values[col - 1] = cellText(cell.value);
    });
    const candidate = mapHeaders(values);
    if (candidate.nationalId !== undefined && candidate.name !== undefined) {
      headerRow = r;
      map = candidate;
      foundColumns = values.filter(Boolean);
      break;
    }
  }
  if (!headerRow) throw new Error("empimp.noHeader");
  const rows: ParsedEmployeeRow[] = [],
    seen = new Set<string>();
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const values: string[] = [];
    sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      values[col - 1] = cellText(cell.value);
    });
    const get = (field: string) =>
      (map[field] === undefined ? "" : values[map[field]] || "")
        .trim()
        .slice(0, field === "personnelNotes" ? 2000 : 200);
    const nationalId = latinDigits(get("nationalId")).replace(/\s/g, ""),
      name = get("name");
    if (!nationalId && !name) continue;
    const row: ParsedEmployeeRow = { row: r, nationalId, name, notes: [] };
    rows.push(row);
    if (!nationalId) {
      row.reason = "empimp.missingId";
      continue;
    }
    if (!validateNationalId(nationalId).valid) {
      row.reason = "emp.invalidId";
      continue;
    }
    if (name.length < 2) {
      row.reason = "empimp.missingName";
      continue;
    }
    if (seen.has(nationalId)) {
      row.reason = "v2.importDuplicate";
      continue;
    }
    seen.add(nationalId);
    const dob = plausible(parseDate(get("dob")), 14, 100),
      hireDate = plausible(parseDate(get("hireDate")), 0, 60);
    if (get("dob") && !dob) row.notes.push("empimp.note.dob");
    if (get("hireDate") && !hireDate) row.notes.push("empimp.note.hireDate");
    const phone = parsePhone(get("phone")),
      mail = get("email").toLowerCase(),
      email = z.email().safeParse(mail).success ? mail : null;
    if (get("phone") && !phone) row.notes.push("v2.invalidProfile");
    if (mail && !email) row.notes.push("v2.invalidProfile");
    const blood = get("bloodType").toUpperCase().replace(/\s/g, "");
    row.data = {
      name,
      nameEn: get("nameEn") || null,
      employeeNo: get("employeeNo") || null,
      department: get("department") || null,
      jobTitle: get("jobTitle") || null,
      gender: parseGender(get("gender")),
      dob,
      phone,
      email,
      hireDate,
      bloodType: BLOOD_TYPES.includes(blood) ? blood : null,
      nationality: get("nationality") || null,
      qualification: get("qualification") || null,
      employmentType: get("employmentType") || null,
      assignedFacility: get("assignedFacility") || null,
      workLocation: get("workLocation") || null,
      personnelNotes: get("personnelNotes") || null,
    };
  }
  return { rows, headerRow, foundColumns };
}
