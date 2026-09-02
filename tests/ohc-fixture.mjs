// Synthetic OOXML fixture. Never include staff data in source control.
import JSZip from "jszip";
export async function ohcFixture({
  id = "1999000016",
  name = "Synthetic Employee",
  dose = "",
  received = "",
  secondId = "1999000024",
} = {}) {
  const zip = new JSZip(),
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const escape = (s) =>
    String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const cell = (ref, value) =>
    `<c r="${ref}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
  const main = `<worksheet xmlns="${ns}"><dimension ref="A1:AY1000"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><cols><col min="2" max="2" width="35" customWidth="1"/></cols><sheetData><row r="1">${cell("B1", "DEMOGRAPHIC DATA")}</row><row r="2">${cell("B2", "Name")}${cell("C2", "ID")}${cell("O2", "Date of Hep B vaccine 1st dose")}${cell("W2", "Influnza")}${cell("AI2", "1st dose MMR")}${cell("AM2", "1st dose Varicella")}</row><row r="3">${cell("B3", name)}${cell("C3", id)}${cell("K3", "Non Reactive")}${cell("O3", dose)}${cell("P3", received)}</row><row r="4">${cell("B4", "Second employee")}${cell("C4", secondId)}</row><row r="5"><c r="B5"/><c r="C5"/><c r="O5"/><c r="P5"/></row></sheetData><dataValidations count="1"><dataValidation type="list" sqref="P3:P1000"><formula1>Sheet!$A$1:$A$2</formula1></dataValidation></dataValidations><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.3" footer="0.3"/></worksheet>`;
  const names = ["Kitchen", "Data Base", "PEP", "Incidence Report", "Sheet"];
  zip.file(
    "xl/workbook.xml",
    `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((n, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  zip.file(
    "[Content_Types].xml",
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
  );
  names.forEach((name, i) =>
    zip.file(
      `xl/worksheets/sheet${i + 1}.xml`,
      name === "Data Base"
        ? main
        : `<worksheet xmlns="${ns}"><dimension ref="A1:A2"/><sheetData><row r="1">${cell("A1", name === "Sheet" ? "Yes" : "Source preserved")}</row><row r="2">${cell("A2", name === "Sheet" ? "No" : "")}</row></sheetData></worksheet>`,
    ),
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
