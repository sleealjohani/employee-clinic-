import assert from "node:assert/strict";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import {
  readOHC,
  renderOHC,
  parseOHCDay,
  type OHCRegister,
  type ExportDose,
} from "../src/lib/import/ohc";
// @ts-expect-error Shared synthetic fixture for the HTTP integration runner.
import { ohcFixture } from "./ohc-fixture.mjs";
const employees = [
  {
    id: "one",
    nationalId: "1999000016",
    name: "Synthetic Employee",
    isArchived: false,
  },
];
const source: Buffer = await ohcFixture();
const parsed = await readOHC(source, employees);
assert.equal(parsed.rows.length, 2);
assert.equal(parsed.rows[0].employeeId, "one");
assert.equal(parsed.rows[1].employeeId, null);
assert.equal(parsed.doses.length, 0);
assert.equal(parsed.layout.mainPath, "xl/worksheets/sheet2.xml");
const register: OHCRegister = {
  version: 1,
  filename: "fixture.xlsx",
  sha256: parsed.sha256,
  importedAt: "2026-01-01",
  updatedAt: "2026-01-01",
  rows: parsed.rows,
  issues: parsed.issues,
  layout: parsed.layout,
  claimedCells: [],
  importedDoses: 0,
  doseCount: 0,
  extraCount: 0,
};
assert.deepEqual((await renderOHC(source, register, [])).bytes, source);
const makeDose = (
  id: string,
  vaccineCode: string,
  doseNumber: number,
  date: string,
): ExportDose => ({
  id,
  employeeId: "one",
  vaccineCode,
  vaccineName: vaccineCode,
  doseNumber,
  givenAt: new Date(date),
  lotNumber: null,
  provider: null,
  notes: "=not a formula <script>",
  employee: { name: "Synthetic Employee", nationalId: employees[0].nationalId },
});
const doses = [
  makeDose("first", "HEP_B", 1, "2026-01-01"),
  makeDose("flu1", "INFLUENZA", 1, "2025-01-01"),
  makeDose("flu2", "INFLUENZA", 1, "2026-01-01"),
  makeDose("covid", "COVID19", 4, "2026-01-01"),
];
const output = await renderOHC(source, register, doses);
const originalZip = await JSZip.loadAsync(source),
  zip = await JSZip.loadAsync(output.bytes);
for (const path of Object.keys(originalZip.files).filter(
  (p) => !originalZip.files[p].dir,
)) {
  if (
    [
      parsed.layout.mainPath,
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "[Content_Types].xml",
    ].includes(path)
  )
    continue;
  assert.equal(
    await originalZip.file(path)!.async("string"),
    await zip.file(path)!.async("string"),
    `unchanged ZIP part ${path}`,
  );
}
const book = new ExcelJS.Workbook();
await book.xlsx.load(output.bytes as unknown as ArrayBuffer);
assert.equal(book.worksheets.length, 6);
assert.equal(book.getWorksheet("Sheet")!.getCell("A1").value, "Yes");
assert.equal(
  book.getWorksheet("Data Base")!.getCell("O3").value,
  "1: 01/01/2026",
);
assert.equal(book.getWorksheet("Data Base")!.getCell("P3").value, "Yes");
assert.equal(
  book.getWorksheet("Data Base")!.getCell("W3").value,
  "1: 01/01/2025\n1: 01/01/2026",
);
assert.equal(
  book.getWorksheet("Data Base")!.getCell("K3").value,
  "Non Reactive",
);
assert.equal(
  book.getWorksheet("OHC Doses")!.getCell("I3").value,
  "=not a formula <script>",
);
assert.equal(book.getWorksheet("OHC Doses")!.getCell("A6").value, "covid");
assert.equal(output.extraCount, 1);
const documented = await readOHC(
  await ohcFixture({ dose: "02/01/2026", received: "Yes" }),
  employees,
);
assert.equal(documented.doses.length, 1);
for (const received of ["", "No", "planned"])
  assert.equal(
    (
      await readOHC(
        await ohcFixture({ dose: "02/01/2026", received }),
        employees,
      )
    ).doses.length,
    0,
  );
assert.equal(
  (
    await readOHC(
      await ohcFixture({ dose: "31/02/2026", received: "Yes" }),
      employees,
    )
  ).doses.length,
  0,
);
const duplicate = await readOHC(
  await ohcFixture({
    dose: "02/01/2026",
    received: "Yes",
    secondId: employees[0].nationalId,
  }),
  employees,
);
assert.ok(duplicate.rows.every((row) => !row.employeeId));
assert.equal(duplicate.doses.length, 0);
assert.equal(
  (await readOHC(source, [{ ...employees[0], isArchived: true }])).rows[0]
    .employeeId,
  null,
);
assert.equal(parseOHCDay("31/02/2026"), null);
assert.equal(parseOHCDay("01/01/2099"), null);
assert.equal(parseOHCDay("٠٢/٠١/٢٠٢٦"), "2026-01-02");
const appended = await renderOHC(source, register, [
  {
    ...doses[0],
    employeeId: "new",
    employee: { name: "New person", nationalId: "1999000999" },
  },
]);
const appendedBook = new ExcelJS.Workbook();
await appendedBook.xlsx.load(appended.bytes as unknown as ArrayBuffer);
assert.equal(
  appendedBook.getWorksheet("Data Base")!.getCell("B5").value,
  "New person",
);
assert.equal(
  appendedBook.getWorksheet("Data Base")!.getCell("O5").value,
  "1: 01/01/2026",
);
const voidedSource: Buffer = await ohcFixture({
  dose: "02/01/2026",
  received: "Yes",
});
const voided = await renderOHC(
  voidedSource,
  { ...register, claimedCells: ["O3"] },
  [],
);
const voidedBook = new ExcelJS.Workbook();
await voidedBook.xlsx.load(voided.bytes as unknown as ArrayBuffer);
assert.equal(
  voidedBook.getWorksheet("Data Base")!.getCell("O3").value ?? "",
  "",
);
assert.equal(
  voidedBook.getWorksheet("Data Base")!.getCell("P3").value ?? "",
  "",
);
console.log(
  "PASS OHC: identity, dates, receipt evidence, duplicate IDs, exact source preservation, XML round trip, annual doses, additional vaccines, new employees, and voided doses",
);
