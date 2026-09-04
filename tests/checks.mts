import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseLabNumber } from "../src/lib/clinical/numeric";
import { labReviewSnapshot } from "../src/lib/clinical/lab-review";
import {
  computeFlag,
  normaliseQualitative,
  isCritical,
} from "../src/lib/clinical/rules";
import { hbvStatus } from "../src/lib/clinical/hbv";
import { resolveTestCode } from "../src/lib/catalog/tests";
import { nextVaccineDue } from "../src/lib/clinical/due";
import { availableSlots } from "../src/lib/scheduling";
import {
  DEFAULT_CLINIC_CONFIG,
  clinicDateTime,
  validDay,
  profileCompletion,
} from "../src/lib/clinic-config";
import {
  employeeSchema,
  needleStickIncidentSchema,
  validateNationalId,
} from "../src/lib/validation";
import { toDateTimeInput } from "../src/lib/format";
import { can, canOpenPath } from "../src/lib/auth/rbac";
import {
  employeeAccessAllowed,
  employeeLoginId,
  employeeReturnPath,
} from "../src/lib/auth/employee-access";
import { extractLocalPdfReport } from "../src/lib/import/local-pdf";
import { readEmployeeSpreadsheet } from "../src/lib/import/employees";
// @ts-expect-error Synthetic fixture intentionally shared with the Node integration runner.
import { syntheticId, syntheticPdf } from "./fixtures.mjs";
let count = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  await fn();
  count++;
  console.log("PASS", name);
}
await check(
  "employee ID normalization, active-only access and safe return paths",
  () => {
    assert.equal(employeeLoginId(" ١٩٩٩٠٠٠٠١٨ "), "1999000018");
    assert.equal(employeeLoginId("۱۹۹۹۰۰۰۰۱۸"), "1999000018");
    for (const value of [
      "",
      "123456789",
      "12345678901",
      "1e90000018",
      "1999 000018",
      "1".repeat(100),
    ])
      assert.equal(employeeLoginId(value), null);
    for (const employmentStatus of ["ACTIVE", "ON_LEAVE"])
      assert.equal(
        employeeAccessAllowed({ isArchived: false, employmentStatus }),
        true,
      );
    for (const employmentStatus of ["TERMINATED", "SUSPENDED", "unknown"])
      assert.equal(
        employeeAccessAllowed({ isArchived: false, employmentStatus }),
        false,
      );
    assert.equal(
      employeeAccessAllowed({ isArchived: true, employmentStatus: "ACTIVE" }),
      false,
    );
    assert.equal(
      employeeReturnPath("/portal/records?section=vaccines"),
      "/portal/records?section=vaccines",
    );
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/dashboard",
      "/employees",
      "/portal-evil",
      "/account/password",
      "/portal\n",
    ])
      assert.equal(employeeReturnPath(value), "/portal");
  },
);
await check(
  "no Server Action form reads a value only a submit button carries",
  async () => {
    // React builds the FormData for a `useActionState` action itself, and the
    // pressed submitter is not part of it, so `<button type="submit" name=...>`
    // arrives as null. That silently broke three flows at once: lab review
    // rejected every approval as invalid, and the employee and OHC imports took
    // the preview branch on every run while reporting rows they never wrote.
    // Nothing here may go back to reading the choice off the button.
    const { readdir, readFile } = await import("node:fs/promises");
    const walk = async (dir: string): Promise<string[]> => {
      const out: string[] = [];
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const full = `${dir}/${e.name}`;
        if (e.isDirectory()) out.push(...(await walk(full)));
        else if (e.name.endsWith(".tsx")) out.push(full);
      }
      return out;
    };
    const offenders: string[] = [];
    for (const file of await walk("src")) {
      const source = await readFile(file, "utf8");
      for (const tag of source.match(/<button\b[^>]*>/gs) ?? [])
        if (/\bname\s*=/.test(tag))
          offenders.push(`${file}: ${tag.replace(/\s+/g, " ").slice(0, 70)}`);
    }
    assert.deepEqual(offenders, []);
  },
);
await check("needle-stick form validation and clinical route access", () => {
  const base = {
    employeeId: "employee_1",
    department: "Emergency",
    nature: "NEEDLE_STICK",
    incidentAt: "2026-09-04T13:30",
    sourceBloodBorneHistory: "UNKNOWN",
    actionWashing: "on",
    actionIrrigation: undefined,
    complete: "on",
  };
  const parsed = needleStickIncidentSchema.parse(base);
  assert.equal(parsed.actionWashing, true);
  assert.equal(parsed.actionIrrigation, false);
  assert.equal(parsed.complete, true);
  assert.equal(
    needleStickIncidentSchema.safeParse({ ...base, nature: "OTHER" }).success,
    false,
  );
  assert.equal(
    needleStickIncidentSchema.safeParse({
      ...base,
      nature: "OTHER",
      otherNature: "Scalpel",
    }).success,
    true,
  );
  assert.equal(canOpenPath("ADMIN", "/needle-stick"), true);
  assert.equal(canOpenPath("STAFF", "/needle-stick/new"), true);
  assert.equal(canOpenPath("VIEWER", "/needle-stick"), false);
  assert.equal(canOpenPath("EMPLOYEE", "/needle-stick"), false);
  assert.equal(
    toDateTimeInput(new Date("2026-09-04T21:30:00Z")),
    "2026-09-05T00:30",
  );
});
await check(
  "comparison signs, scientific notation and Arabic digits remain exact",
  () => {
    assert.deepEqual(parseLabNumber("≤ ١٠٫٥"), {
      value: 10.5,
      comparator: "LE",
      raw: "≤ ١٠٫٥",
    });
    assert.equal(parseLabNumber("2.1e3").value, 2100);
    assert.equal(parseLabNumber("1,234.5").value, 1234.5);
    for (const value of ["NaN", "Infinity", "1,2", "12 mg/dL", ""])
      assert.equal(parseLabNumber(value).value, null);
  },
);
await check("negative qualitative phrases never become reactive", () => {
  for (const s of [
    "non-reactive",
    "not detected",
    "not reactive",
    "غير متفاعل",
  ])
    assert.equal(normaliseQualitative(s), "NON_REACTIVE");
  assert.equal(normaliseQualitative("abnormal"), "REACTIVE");
  assert.equal(normaliseQualitative("indeterminate"), "INDETERMINATE");
});
await check(
  "different units never inherit an unrelated critical threshold",
  () => {
    assert.equal(
      computeFlag({
        testCode: "FBS",
        resultType: "QUANTITATIVE",
        valueNum: 5.2,
        unit: "mmol/L",
        refLow: 3.9,
        refHigh: 5.5,
      }),
      "NORMAL",
    );
    assert.equal(
      computeFlag({
        testCode: "FBS",
        resultType: "QUANTITATIVE",
        valueNum: 5.2,
        unit: "mmol/L",
      }),
      "UNKNOWN",
    );
    assert.equal(
      computeFlag({
        testCode: "FBS",
        resultType: "QUANTITATIVE",
        valueNum: 450,
        unit: "mg/dL",
      }),
      "CRITICAL_HIGH",
    );
    assert.equal(
      computeFlag({
        testCode: "FBS",
        resultType: "QUANTITATIVE",
        valueNum: 90,
        unit: "mg/dL",
        comparator: "LT",
      }),
      "UNKNOWN",
    );
    assert.equal(isCritical("REACTIVE", "HBSAG"), true);
  },
);
await check(
  "HBV requires documented doses, unit, timing and human review",
  () => {
    const doses = [
      { doseNumber: 1, givenAt: new Date("2024-01-01") },
      { doseNumber: 2, givenAt: new Date("2024-02-01") },
      { doseNumber: 3, givenAt: new Date("2024-07-01") },
    ];
    const lab = {
      testCode: "ANTI_HBS",
      valueNum: 35,
      flag: "NORMAL" as const,
      collectedAt: new Date("2024-08-05"),
      reviewedAt: new Date("2024-08-06"),
      unit: "mIU/mL",
      comparator: "EQ" as const,
    };
    assert.equal(hbvStatus([lab], []).status, "REVIEW_REQUIRED");
    assert.equal(
      hbvStatus([{ ...lab, unit: "unknown" }], doses).status,
      "REVIEW_REQUIRED",
    );
    assert.equal(
      hbvStatus([{ ...lab, reviewedAt: null }], doses).status,
      "REVIEW_REQUIRED",
    );
    assert.equal(hbvStatus([lab], doses).status, "PROTECTED");
    assert.equal(
      hbvStatus(
        [lab, { ...lab, valueNum: 2, collectedAt: new Date("2025-08-05") }],
        doses,
      ).status,
      "PROTECTED",
    );
    assert.equal(
      hbvStatus([{ ...lab, testCode: "HBSAG", flag: "REACTIVE" }], doses)
        .status,
      "REVIEW_REQUIRED",
    );
    assert.equal(
      hbvStatus(
        [{ ...lab, valueNum: 2 }],
        Array.from({ length: 6 }, () => doses[0]),
      ).status,
      "REVIEW_REQUIRED",
    );
  },
);
await check("duplicate vaccine rows cannot complete a series", () => {
  const date = new Date("2024-01-01");
  const next = nextVaccineDue(
    "HEP_B",
    Array.from({ length: 3 }, () => ({
      doseNumber: 1,
      givenAt: date,
      nextDueAt: null,
    })),
  );
  assert.equal(next?.nextDose, 2);
});
await check(
  "scheduling respects Riyadh time, overlap, simultaneous capacity and closures",
  () => {
    const config = {
      ...DEFAULT_CLINIC_CONFIG,
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      minimumNoticeHours: 0,
      capacity: 2,
    };
    const now = new Date("2026-09-02T00:00:00Z"),
      day = "2026-09-02",
      at = (t: string) => clinicDateTime(day, t);
    const rows = availableSlots(
      day,
      40,
      config,
      [
        { startsAt: at("08:00"), endsAt: at("08:20") },
        { startsAt: at("08:20"), endsAt: at("08:40") },
      ],
      [],
      now,
    );
    assert.equal(rows[0].available, true);
    assert.equal(rows[0].start, "2026-09-02T05:00:00.000Z");
    assert.equal(
      availableSlots(
        day,
        20,
        { ...config, capacity: 1 },
        [{ startsAt: at("08:00"), endsAt: at("08:20") }],
        [],
        now,
      )[0].available,
      false,
    );
    assert.equal(
      availableSlots(
        day,
        20,
        config,
        [],
        [{ startsAt: at("08:00"), endsAt: at("09:00") }],
        now,
      )[0].available,
      false,
    );
    assert.equal(validDay("2026-02-30"), false);
  },
);
await check("employee and aggregate viewer permissions stay isolated", () => {
  assert.equal(can("EMPLOYEE", "clinical.read"), false);
  assert.equal(can("VIEWER", "employee.read"), false);
  assert.equal(canOpenPath("EMPLOYEE", "/employees"), false);
  assert.equal(canOpenPath("EMPLOYEE", "/portal/profile"), true);
  assert.equal(canOpenPath("STAFF", "/settings"), false);
  assert.equal(
    profileCompletion({ phone: "0500000001" }, ["phone", "email"]).percent,
    50,
  );
  assert.equal(
    employeeSchema.safeParse({
      name: "Test",
      nationalId: syntheticId(),
      dob: "2026-02-30",
    }).success,
    false,
  );
  assert.equal(validateNationalId(syntheticId()).valid, true);
});
await check(
  "real PDF text extraction preserves number limits, units and negative screening",
  async () => {
    const pdf = syntheticPdf([
      "Patient Name: SYNTHETIC EMPLOYEE",
      "National ID: " + syntheticId(),
      "Collected: 2026-08-20",
      "Fasting Blood Sugar 5.2 mmol/L (3.9 - 5.5)",
      "Anti-HBs < 10 mIU/mL",
      "HBsAg Non-Reactive",
    ]);
    const output = await extractLocalPdfReport(pdf);
    const rows = output.reports.flatMap((r) => r.results);
    assert.equal(rows.find((r) => r.test_code === "FBS")?.unit, "mmol/L");
    assert.match(
      rows.find((r) => r.test_code === "ANTI_HBS")?.value_number || "",
      /^</,
    );
    assert.equal(
      normaliseQualitative(
        rows.find((r) => r.test_code === "HBSAG")?.value_text,
      ),
      "NON_REACTIVE",
    );
    assert.equal(output.pageCount, 1);
    assert.deepEqual(output.unreadPages, []);
  },
);
await check("MOH serology report spellings resolve to catalogue codes", () => {
  // Exactly as the Regional Laboratory of Qurayyat prints them.
  for (const [printed, code] of [
    ["Hep Bs Ag.", "HBSAG"],
    ["Hep Bs Ag", "HBSAG"],
    ["Anti-HBs", "ANTI_HBS"],
    ["Anti-HBc Total", "ANTI_HBC_TOTAL"],
    ["Anti-HCV", "ANTI_HCV"],
    ["HIV Ag/Ab", "HIV_AGAB"],
  ] as const)
    assert.equal(resolveTestCode(printed), code, printed);
});
await check(
  "a numeric test reported qualitatively is surfaced for review, not dropped",
  async () => {
    const pdf = syntheticPdf([
      "Patient Name: SYNTHETIC EMPLOYEE",
      "National ID: " + syntheticId(2),
      "Collected Date/Time: 23/04/2026 13:11 AST",
      "Test Name Result Units Reference Range",
      "Hep Bs Ag Num 0.16",
      "Hep Bs Ag. Non Reactive",
      "Anti-HBs Non Reactive",
    ]);
    const rows = (await extractLocalPdfReport(pdf)).reports.flatMap(
      (r) => r.results,
    );
    // HBsAg was invisible to the matcher before "hep bs ag" was a known alias.
    const hbsag = rows.find((r) => r.test_code === "HBSAG");
    assert.equal(normaliseQualitative(hbsag?.value_text), "NON_REACTIVE");
    // Anti-HBs is catalogued as quantitative; printed here with no titre it must
    // still reach the reviewer, as a qualitative candidate needing confirmation.
    const antiHbs = rows.find((r) => r.test_code === "ANTI_HBS");
    assert.equal(antiHbs?.result_type, "QUALITATIVE");
    assert.equal(normaliseQualitative(antiHbs?.value_text), "NON_REACTIVE");
    assert.ok(
      (antiHbs?.confidence ?? 1) < 0.75,
      "must be low enough to warn the reviewer",
    );
  },
);
await check(
  "Arabia Standard Time never becomes a liver enzyme result",
  async () => {
    const pdf = syntheticPdf([
      "Patient Name: SYNTHETIC EMPLOYEE",
      "National ID: " + syntheticId(3),
      // Every line a Saudi MOH report stamps with a timezone, including the
      // shapes a scan produces when it breaks the stamp across rows.
      "Req Date 28/04/2026 10:57 AST",
      "Collected Date/Time: 28/04/2026 11:16 AST 30/04/2026 10:03 AST",
      "AST",
      "AST Nationality Saudi Arabia",
      "Report Request ID 87525370 Page 1 of 1 Reported Date 03/05/2026 09:34 AST",
      // A genuine result on the same report must still come through.
      "AST (SGOT) 34 U/L (10 - 40)",
    ]);
    const rows = (await extractLocalPdfReport(pdf)).reports.flatMap(
      (r) => r.results,
    );
    const ast = rows.filter((r) => r.test_code === "AST");
    assert.equal(ast.length, 1, "only the measured AST may be reported");
    assert.equal(ast[0].value_number, "34");
    assert.equal(ast[0].unit, "U/L");
  },
);
await check(
  "spreadsheet parsing handles quoted CSV, Arabic dates, missing zero and duplicate IDs",
  async () => {
    const w = new ExcelJS.Workbook(),
      s = w.addWorksheet("Test");
    s.addRow([
      "الاسم",
      "السجل المدني",
      "تاريخ الميلاد",
      "رقم الجوال",
      "الايميل",
      "نوع البرنامج ( تشغيل - خدمه مدنيه )",
    ]);
    s.addRow([
      "Synthetic Employee",
      syntheticId(),
      "19/02/1411",
      500000001,
      {
        text: "test@example.invalid",
        hyperlink: "mailto:test@example.invalid",
      },
      "تشغيل",
    ]);
    s.addRow(["Duplicate", syntheticId(), "31/02/2024", "", "", ""]);
    const bytes = await w.xlsx.writeBuffer(),
      result = await readEmployeeSpreadsheet(bytes as Uint8Array, "test.xlsx");
    assert.equal(result.rows[0].data?.phone, "0500000001");
    assert.equal(result.rows[0].data?.dob?.getUTCFullYear(), 1990);
    assert.equal(result.rows[0].data?.employmentType, "تشغيل");
    assert.equal(result.rows[1].reason, "v2.importDuplicate");
    const csv = await readEmployeeSpreadsheet(
      Buffer.from('name,national id\n"Synthetic, Employee",' + syntheticId()),
      "test.csv",
    );
    assert.equal(csv.rows[0].name, "Synthetic, Employee");
  },
);
await check(
  "bulk-review confirmation detects additions, replacements and edits regardless of row order",
  () => {
    const rows = [
      { id: "lab-a", updatedAt: new Date("2026-01-01") },
      { id: "lab-b", updatedAt: new Date("2026-01-02") },
    ];
    const original = labReviewSnapshot(rows);
    assert.equal(original.count, 2);
    assert.deepEqual(labReviewSnapshot([...rows].reverse()), original);
    assert.notEqual(labReviewSnapshot([rows[0]]).version, original.version);
    assert.notEqual(
      labReviewSnapshot([rows[0], { ...rows[1], id: "lab-c" }]).version,
      original.version,
    );
    assert.notEqual(
      labReviewSnapshot([
        rows[0],
        { ...rows[1], updatedAt: new Date("2026-01-03") },
      ]).version,
      original.version,
    );
    assert.equal(labReviewSnapshot([]).count, 0);
  },
);
console.log("Completed", count, "regression checks.");
