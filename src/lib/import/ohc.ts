import ExcelJS from "exceljs";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { ClinicError } from "@/lib/action-result";

export const OHC_KEY = "ohc.register";
export const OHC_SOURCE_PREFIX = "ohc.source.";
export type Slot = {
  sheet: string;
  column: string;
  received?: string;
  code: string;
  dose: number;
  last?: boolean;
};
export const OHC_SLOTS: Slot[] = [
  { sheet: "Data Base", column: "O", received: "P", code: "HEP_B", dose: 1 },
  { sheet: "Data Base", column: "Q", received: "R", code: "HEP_B", dose: 2 },
  {
    sheet: "Data Base",
    column: "S",
    received: "T",
    code: "HEP_B",
    dose: 3,
    last: true,
  },
  { sheet: "Data Base", column: "W", code: "INFLUENZA", dose: 1, last: true },
  {
    sheet: "Data Base",
    column: "X",
    code: "MENINGOCOCCAL",
    dose: 1,
    last: true,
  },
  { sheet: "Data Base", column: "Y", received: "Z", code: "TETANUS", dose: 1 },
  {
    sheet: "Data Base",
    column: "AA",
    received: "AB",
    code: "TETANUS",
    dose: 2,
  },
  {
    sheet: "Data Base",
    column: "AC",
    received: "AD",
    code: "TETANUS",
    dose: 3,
    last: true,
  },
  { sheet: "Data Base", column: "AI", received: "AJ", code: "MMR", dose: 1 },
  {
    sheet: "Data Base",
    column: "AK",
    received: "AL",
    code: "MMR",
    dose: 2,
    last: true,
  },
  {
    sheet: "Data Base",
    column: "AM",
    received: "AN",
    code: "VARICELLA",
    dose: 1,
  },
  {
    sheet: "Data Base",
    column: "AO",
    received: "AP",
    code: "VARICELLA",
    dose: 2,
    last: true,
  },
];
export type OHCEmployee = {
  id: string;
  nationalId: string;
  name: string;
  isArchived: boolean;
};
export type OHCRow = {
  row: number;
  name: string;
  nationalId: string;
  employeeId: string | null;
  reason?: string;
};
export type OHCDose = {
  row: number;
  cell: string;
  employeeId: string;
  code: string;
  dose: number;
  day: string;
};
export type OHCIssue = { row: number; cell?: string; reason: string };
export type OHCLayout = { mainPath: string; lastRow: number };
export type OHCRegister = {
  version: 1;
  filename: string;
  sha256: string;
  importedAt: string;
  updatedAt: string;
  rows: OHCRow[];
  issues: OHCIssue[];
  layout: OHCLayout;
  claimedCells: string[];
  importedDoses: number;
  doseCount: number;
  extraCount: number;
};
export function digest(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}
export function normalizeId(value: string) {
  return value
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .trim()
    .replace(/\.0$/, "");
}
function text(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText
        .map((x) => x.text)
        .join("")
        .trim();
    // Formula results, hyperlinks and errors are not evidence of administered doses.
    return "[unsupported]";
  }
  return String(value).trim();
}
export function parseOHCDay(raw: string, now = new Date()): string | null {
  const value = normalizeId(raw);
  let year: number, month: number, day: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (m) [, year, month, day] = m.map(Number);
  else {
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
    if (!m) return null;
    [, day, month, year] = m.map(Number);
  }
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  const key = date.toISOString().slice(0, 10);
  if (
    year! < 1900 ||
    date.getUTCFullYear() !== year! ||
    date.getUTCMonth() + 1 !== month! ||
    date.getUTCDate() !== day! ||
    key > now.toISOString().slice(0, 10)
  )
    return null;
  return key;
}

export async function readOHC(
  buffer: Buffer,
  employees: OHCEmployee[],
  now = new Date(),
) {
  if (!buffer.length || buffer.length > 3 * 1024 * 1024)
    throw new ClinicError("ohc.invalidFile");
  // Read the central directory sizes before decompressing any uploaded entry.
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > buffer.length)
    throw new ClinicError("ohc.invalidFile");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16),
    total = 0;
  if (!count || count > 500) throw new ClinicError("ohc.invalidFile");
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw new ClinicError("ohc.invalidFile");
    total += buffer.readUInt32LE(offset + 24);
    if (total > 25 * 1024 * 1024) throw new ClinicError("ohc.invalidFile");
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  const zip = await JSZip.loadAsync(buffer);
  if (zip.file("xl/vbaProject.bin")) throw new ClinicError("ohc.invalidFile");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ArrayBuffer);
  const main = book.getWorksheet("Data Base");
  if (
    !main ||
    main.rowCount > 2000 ||
    text(main.getCell("B2").value) !== "Name" ||
    text(main.getCell("C2").value) !== "ID"
  )
    throw new ClinicError("ohc.invalidFile");
  for (const [address, pattern] of [
    ["O2", /Hep B.*1st/i],
    ["W2", /Influnza/i],
    ["AI2", /1st.*MMR/i],
    ["AM2", /1st.*Varicella/i],
  ] as const)
    if (!pattern.test(text(main.getCell(address).value)))
      throw new ClinicError("ohc.invalidFile");
  // Use workbook relationships, never assume sheet1.xml ordering.
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const pathFor = (name: string) => {
    const tag = [...wb.matchAll(/<sheet\b[^>]*\/>/g)].find((m) =>
      m[0].includes(`name="${name}"`),
    )?.[0];
    const id = tag?.match(/r:id="([^"]+)"/)?.[1];
    const rel = [...rels.matchAll(/<Relationship\b[^>]*\/>/g)].find((m) =>
      m[0].includes(`Id="${id}"`),
    )?.[0];
    const target = rel?.match(/Target="([^"]+)"/)?.[1];
    if (!target || target.includes(".."))
      throw new ClinicError("ohc.invalidFile");
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    if (!zip.file(path)) throw new ClinicError("ohc.invalidFile");
    return path;
  };
  const rows: OHCRow[] = [],
    doses: OHCDose[] = [],
    issues: OHCIssue[] = [];
  const seen = new Set<string>();
  for (let row = 3; row <= main.rowCount; row++) {
    const name = text(main.getCell(`B${row}`).value),
      nationalId = normalizeId(text(main.getCell(`C${row}`).value));
    if (!name && !nationalId) continue;
    const matches = employees.filter(
      (e) => normalizeId(e.nationalId) === nationalId && nationalId !== "",
    );
    const duplicate = seen.has(nationalId);
    seen.add(nationalId);
    const employee =
      matches.length === 1 && !duplicate && !matches[0].isArchived
        ? matches[0]
        : null;
    const reason = duplicate
      ? "ohc.duplicateId"
      : matches[0]?.isArchived
        ? "ohc.archived"
        : !employee
          ? "ohc.unmatched"
          : undefined;
    rows.push({
      row,
      name,
      nationalId,
      employeeId: employee?.id ?? null,
      ...(reason ? { reason } : {}),
    });
    if (reason) issues.push({ row, reason });
    for (const slot of OHC_SLOTS) {
      const cell = `${slot.column}${row}`,
        raw = text(main.getCell(cell).value),
        received = slot.received
          ? text(main.getCell(`${slot.received}${row}`).value).toLowerCase()
          : "";
      if (!raw && !received) continue;
      if (!raw) {
        issues.push({ row, cell, reason: "ohc.missingDate" });
        continue;
      }
      if (slot.received && !/^(yes|received|نعم|تم|1)$/.test(received)) {
        issues.push({ row, cell, reason: "ohc.notReceived" });
        continue;
      }
      for (const line of raw.split(/\r?\n/).filter(Boolean)) {
        const labelled = /^(\d+):\s*(.+)$/.exec(line);
        const dose = labelled ? Number(labelled[1]) : slot.dose;
        const day = parseOHCDay(labelled ? labelled[2] : line, now);
        if (
          !day ||
          !Number.isInteger(dose) ||
          dose < 1 ||
          dose > 20 ||
          (slot.last ? dose < slot.dose : dose !== slot.dose)
        ) {
          issues.push({ row, cell, reason: "ohc.invalidDate" });
          continue;
        }
        if (employee)
          doses.push({
            row,
            cell,
            employeeId: employee.id,
            code: slot.code,
            dose,
            day,
          });
      }
    }
  }
  // A workbook with repeated identifiers cannot safely assign either occurrence.
  const duplicateIds = new Set(
    rows.filter((r) => r.reason === "ohc.duplicateId").map((r) => r.nationalId),
  );
  for (const row of rows)
    if (duplicateIds.has(row.nationalId)) {
      row.employeeId = null;
      row.reason = "ohc.duplicateId";
      if (!issues.some((i) => i.row === row.row && i.reason === row.reason))
        issues.push({ row: row.row, reason: row.reason });
    }
  const validRows = new Set(rows.filter((r) => r.employeeId).map((r) => r.row));
  return {
    rows,
    doses: doses.filter((d) => validRows.has(d.row)),
    issues,
    layout: {
      mainPath: pathFor("Data Base"),
      lastRow: Math.max(2, ...rows.map((r) => r.row)),
    },
    sha256: digest(buffer),
  };
}

const xmlEscape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const columnNumber = (ref: string) =>
  [...ref.replace(/\d/g, "")].reduce(
    (n, c) => n * 26 + c.charCodeAt(0) - 64,
    0,
  );
/** Patch only requested cell contents. All styles, validations, merges, drawings,
 * print settings, original sheet order and unrelated ZIP parts remain untouched. */
export function patchCells(xml: string, updates: Map<string, string>): string {
  const pending = new Map(updates);
  let result = xml.replace(
    /<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g,
    (rowXml, rowNum: string) => {
      const cells = [...pending.keys()].filter(
        (ref) => ref.match(/\d+$/)?.[0] === rowNum,
      );
      if (!cells.length) return rowXml;
      let changed = rowXml.replace(
        /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g,
        (cellXml: string, ref: string) => {
          if (!pending.has(ref)) return cellXml;
          const value = pending.get(ref)!;
          pending.delete(ref);
          const attrs = cellXml
            .slice(2, cellXml.indexOf(">"))
            .replace(/\/$/, "")
            .replace(/\s+t="[^"]*"/g, "");
          return `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
        },
      );
      if (changed.endsWith("/>")) changed = changed.slice(0, -2) + "></row>";
      for (const ref of cells)
        if (pending.has(ref)) {
          const cell = `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(pending.get(ref)!)}</t></is></c>`;
          const next = [
            ...changed.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"/g),
          ].find((m) => columnNumber(m[1]) > columnNumber(ref));
          const at = next?.index ?? changed.indexOf("</row>");
          changed = changed.slice(0, at) + cell + changed.slice(at);
          pending.delete(ref);
        }
      return changed;
    },
  );
  const newRows = [
    ...new Set([...pending.keys()].map((ref) => Number(ref.match(/\d+$/)![0]))),
  ].sort((a, b) => a - b);
  for (const row of newRows) {
    const cells = [...pending.keys()]
      .filter(
        (ref) =>
          ref.endsWith(String(row)) && Number(ref.match(/\d+$/)![0]) === row,
      )
      .sort((a, b) => columnNumber(a) - columnNumber(b));
    const content =
      `<row r="${row}">` +
      cells
        .map(
          (ref) =>
            `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(pending.get(ref)!)}</t></is></c>`,
        )
        .join("") +
      "</row>";
    result = result
      .replace("<sheetData/>", "<sheetData></sheetData>")
      .replace("</sheetData>", `${content}</sheetData>`);
  }
  const maxRow = Math.max(
    1,
    ...[...updates.keys()].map((r) => Number(r.match(/\d+$/)![0])),
  );
  result = result.replace(
    /<dimension ref="([^"]+)"\s*\/>/,
    (tag, ref: string) => {
      const end = ref.split(":").pop()!,
        oldRow = Number(end.match(/\d+$/)![0]);
      return maxRow > oldRow ? `<dimension ref="A1:AY${maxRow}"/>` : tag;
    },
  );
  return result;
}
export type ExportDose = {
  id: string;
  employeeId: string;
  vaccineCode: string;
  vaccineName: string;
  doseNumber: number;
  givenAt: Date;
  lotNumber: string | null;
  provider: string | null;
  notes: string | null;
  employee: { nationalId: string; name: string };
};
export async function renderOHC(
  source: Buffer,
  register: OHCRegister,
  doses: ExportDose[],
) {
  if (!doses.length && !register.claimedCells.length)
    return { bytes: source, extraCount: 0 };
  const zip = await JSZip.loadAsync(source);
  const updates = new Map<string, string>(),
    extra = new Map<string, string>();
  const byEmployee = new Map(
    register.rows
      .filter((r) => r.employeeId)
      .map((r) => [r.employeeId!, r.row]),
  );
  let nextRow = register.layout.lastRow + 1;
  for (const dose of doses)
    if (!byEmployee.has(dose.employeeId)) {
      if (nextRow > 1000) throw new ClinicError("ohc.capacity");
      byEmployee.set(dose.employeeId, nextRow);
      updates.set(`B${nextRow}`, dose.employee.name);
      updates.set(`C${nextRow}`, dose.employee.nationalId);
      nextRow++;
    }
  const dateText = (d: Date) =>
    d.toISOString().slice(0, 10).split("-").reverse().join("/");
  for (const cell of register.claimedCells) updates.set(cell, "");
  for (const [id, row] of byEmployee)
    for (const slot of OHC_SLOTS) {
      const records = doses
        .filter(
          (d) =>
            d.employeeId === id &&
            d.vaccineCode === slot.code &&
            (slot.last
              ? d.doseNumber >= slot.dose
              : d.doseNumber === slot.dose),
        )
        .sort(
          (a, b) =>
            a.givenAt.getTime() - b.givenAt.getTime() ||
            a.id.localeCompare(b.id),
        );
      const cell = `${slot.column}${row}`;
      if (records.length) {
        // Any unresolved source entry stays in the original; put new records in
        // the spare sheet until its conflicting source cell has been reviewed.
        if (register.issues.some((i) => i.row === row && i.cell === cell))
          continue;
        updates.set(
          cell,
          records
            .map((d) => `${d.doseNumber}: ${dateText(d.givenAt)}`)
            .join("\n"),
        );
        if (slot.received) updates.set(`${slot.received}${row}`, "Yes");
      } else if (register.claimedCells.includes(cell) && slot.received)
        updates.set(`${slot.received}${row}`, "");
    }
  // Preserve all five original sheets (Sheet contains validation lists). Append
  // a complete ledger for vaccines without columns and recurrent/booster doses.
  if (doses.length) {
    extra.set("A1", "OHC additional doses");
    [
      "Record ID",
      "Name",
      "ID",
      "Vaccine",
      "Dose",
      "Date",
      "Lot",
      "Provider",
      "Notes",
    ].forEach((v, i) => extra.set(`${String.fromCharCode(65 + i)}2`, v));
    doses.forEach((d, i) =>
      [
        d.id,
        d.employee.name,
        d.employee.nationalId,
        d.vaccineName,
        String(d.doseNumber),
        dateText(d.givenAt),
        d.lotNumber ?? "",
        d.provider ?? "",
        d.notes ?? "",
      ].forEach((v, j) =>
        extra.set(`${String.fromCharCode(65 + j)}${i + 3}`, v),
      ),
    );
  }
  if (updates.size)
    zip.file(
      register.layout.mainPath,
      patchCells(
        await zip.file(register.layout.mainPath)!.async("string"),
        updates,
      ),
    );
  if (extra.size) {
    const wb = await zip.file("xl/workbook.xml")!.async("string");
    const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    const types = await zip.file("[Content_Types].xml")!.async("string");
    if (wb.includes('name="OHC Doses"') || rels.includes('Id="rIdOHCDoses"'))
      throw new ClinicError("ohc.invalidFile");
    const id =
      Math.max(
        0,
        ...[...wb.matchAll(/sheetId="(\d+)"/g)].map((m) => Number(m[1])),
        ...Object.keys(zip.files).map((p) =>
          Number(p.match(/sheet(\d+)\.xml$/)?.[1] ?? 0),
        ),
      ) + 1;
    zip.file(
      "xl/workbook.xml",
      wb.replace(
        "</sheets>",
        `<sheet name="OHC Doses" sheetId="${id}" r:id="rIdOHCDoses"/></sheets>`,
      ),
    );
    zip.file(
      "xl/_rels/workbook.xml.rels",
      rels.replace(
        "</Relationships>",
        `<Relationship Id="rIdOHCDoses" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${id}.xml"/></Relationships>`,
      ),
    );
    zip.file(
      "[Content_Types].xml",
      types.replace(
        "</Types>",
        `<Override PartName="/xl/worksheets/sheet${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      ),
    );
    const ledger =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:I2"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="36" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="30" customWidth="1"/><col min="5" max="8" width="18" customWidth="1"/><col min="9" max="9" width="60" customWidth="1"/></cols><sheetData/><autoFilter ref="A2:I' +
      (doses.length + 2) +
      '"/></worksheet>';
    zip.file(`xl/worksheets/sheet${id}.xml`, patchCells(ledger, extra));
  }
  return {
    bytes: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    }),
    extraCount: doses.filter(
      (d) => !OHC_SLOTS.some((s) => s.code === d.vaccineCode),
    ).length,
  };
}
