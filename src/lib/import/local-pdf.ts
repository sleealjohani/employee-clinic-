import { TESTS, type TestDef } from "@/lib/catalog/tests";
import { validateNationalId } from "@/lib/validation";
import type { ExtractedReport, ExtractedResult, ExtractionOutput } from "@/lib/ai/extract";

/**
 * Private, deterministic extraction for machine-generated laboratory PDFs.
 *
 * This path never sends the document outside the application. PDF.js extracts
 * the selectable text layer and the rules below only structure what is already
 * printed. Every candidate still lands in the existing human review queue.
 *
 * Scanned/image-only documents deliberately return no candidates so the caller
 * can either use an explicitly configured AI fallback or ask for a digital PDF.
 */
export const LOCAL_EXTRACTION_MODEL = "local-pdf-rules-v1";
export const LOCAL_PROMPT_VERSION = "local-pdf-rules-2026-08-1";

const LINE_Y_TOLERANCE = 2.4;
const MIN_TEXT_CHARS = 24;

const QUALITATIVE_TERMS = [
  "non reactive",
  "non-reactive",
  "nonreactive",
  "not detected",
  "none detected",
  "indeterminate",
  "equivocal",
  "borderline",
  "reactive",
  "positive",
  "negative",
  "detected",
  "present",
  "absent",
  "إيجابي",
  "ايجابي",
  "سلبي",
  "موجب",
  "سالب",
  "متفاعل",
  "غير متفاعل",
  "غير حاسم",
];

const UNIT_ALIASES: Record<string, string[]> = {
  "%": ["%"],
  "g/dL": ["g/dl", "g / dl"],
  "mg/dL": ["mg/dl", "mg / dl"],
  "ng/mL": ["ng/ml", "ng / ml"],
  "pg/mL": ["pg/ml", "pg / ml"],
  "mIU/mL": ["miu/ml", "miu / ml", "m iu/ml"],
  "mIU/L": ["miu/l", "miu / l"],
  "U/L": ["u/l", "u / l"],
  fL: ["fl"],
  pg: ["pg"],
  "10^3/µL": ["10^3/µl", "10^3/ul", "10³/µl", "10³/ul", "x10^3/µl", "x10^3/ul"],
  "10^6/µL": ["10^6/µl", "10^6/ul", "10⁶/µl", "10⁶/ul", "x10^6/µl", "x10^6/ul"],
};

type PdfTextItem = {
  str: string;
  transform: number[];
};

type PageText = {
  page: number;
  lines: string[];
  text: string;
};

type TestMatcher = {
  def: TestDef;
  regex: RegExp;
  weight: number;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matcherFor(alias: string, def: TestDef): TestMatcher | null {
  const tokens = alias.match(/[\p{L}\p{N}%]+/gu)?.filter(Boolean) ?? [];
  if (tokens.length === 0) return null;
  const middle = "[\\s\\-_/().]*";
  const body = tokens.map(escapeRegex).join(middle);
  return {
    def,
    regex: new RegExp(`(^|[^\\p{L}\\p{N}])(${body})(?=$|[^\\p{L}\\p{N}])`, "iu"),
    weight: alias.length,
  };
}

const TEST_MATCHERS: TestMatcher[] = TESTS.flatMap((def) => {
  const aliases = new Set([def.code, def.nameEn, def.nameAr, ...def.aliases]);
  return [...aliases].map((alias) => matcherFor(alias, def)).filter((value): value is TestMatcher => Boolean(value));
}).sort((a, b) => b.weight - a.weight);

function findTest(line: string): { def: TestDef; start: number; end: number; printedName: string } | null {
  let best: { def: TestDef; start: number; end: number; printedName: string; weight: number } | null = null;
  for (const matcher of TEST_MATCHERS) {
    const match = matcher.regex.exec(line);
    if (!match) continue;
    const prefixLength = match[1]?.length ?? 0;
    const printedName = match[2] ?? "";
    const start = match.index + prefixLength;
    const candidate = { def: matcher.def, start, end: start + printedName.length, printedName, weight: matcher.weight };
    if (!best || candidate.start < best.start || (candidate.start === best.start && candidate.weight > best.weight)) best = candidate;
  }
  return best ? { def: best.def, start: best.start, end: best.end, printedName: best.printedName } : null;
}

function normaliseSpaces(value: string) {
  return value.normalize("NFKC").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function rowsFromItems(items: PdfTextItem[]): string[] {
  const rows: { y: number; parts: { x: number; text: string }[] }[] = [];

  for (const item of items) {
    const text = normaliseSpaces(item.str);
    if (!text) continue;
    const x = Number(item.transform?.[4] ?? 0);
    const y = Number(item.transform?.[5] ?? 0);
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= LINE_Y_TOLERANCE);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, text });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(" "))
    .map(normaliseSpaces)
    .filter(Boolean);
}

async function extractPages(bytes: Buffer): Promise<{ pages: PageText[]; pageCount: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const document = await loadingTask.promise;
  const pages: PageText[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is typeof item & PdfTextItem => "str" in item && "transform" in item);
      const lines = rowsFromItems(items);
      const text = lines.join("\n");
      pages.push({ page: pageNumber, lines, text });
      page.cleanup();
    }
    return { pages, pageCount: document.numPages };
  } finally {
    await document.destroy();
  }
}

function cleanLabelValue(value: string) {
  return normaliseSpaces(value)
    .replace(/^[\s:：#\-–—]+/, "")
    .replace(/\s{2,}.*/, "")
    .slice(0, 160)
    .trim();
}

function labelledValue(lines: string[], labels: RegExp[]): string {
  for (const line of lines) {
    for (const label of labels) {
      const match = label.exec(line);
      if (match?.[1]) return cleanLabelValue(match[1]);
    }
  }
  return "";
}

function extractNationalId(lines: string[], pageText: string): { value: string; confidence: number } {
  const directPatterns = [
    /(?:national\s*(?:id|identity)|patient\s*id|civil\s*id|iqama|id\s*(?:no\.?|number))\s*[:：#\-]?\s*([12]\d{9})/iu,
    /(?:رقم\s*(?:الهوية|الإقامة|الاقامة)|الهوية\s*(?:الوطنية)?|الإقامة|الاقامة)\s*[:：#\-]?\s*([12]\d{9})/u,
  ];

  for (const line of lines) {
    for (const pattern of directPatterns) {
      const match = pattern.exec(line.replace(/[\s-](?=\d)/g, ""));
      if (match?.[1]) return { value: match[1], confidence: 0.99 };
    }
  }

  const candidates = [...new Set(pageText.match(/\b[12]\d{9}\b/g) ?? [])]
    .filter((candidate) => validateNationalId(candidate).valid);
  return candidates.length === 1 ? { value: candidates[0], confidence: 0.82 } : { value: "", confidence: 0.62 };
}

function extractName(lines: string[]): string {
  return labelledValue(lines, [
    /(?:patient\s*name|patient|full\s*name)\s*[:：#\-]\s*(.+)$/iu,
    /(?:اسم\s*المريض|اسم\s*المراجع|الاسم)\s*[:：#\-]\s*(.+)$/u,
  ]).replace(/\s+(?:national\s*id|patient\s*id|file\s*no|mrn|رقم\s*الهوية).*$/iu, "").trim();
}

function extractEmployeeNo(lines: string[]): string {
  return labelledValue(lines, [
    /(?:employee\s*(?:no\.?|number|id)|staff\s*(?:no\.?|number)|file\s*(?:no\.?|number)|mrn)\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu,
    /(?:الرقم\s*الوظيفي|رقم\s*الموظف|رقم\s*الملف)\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu,
  ]);
}

function monthNumber(value: string): number | null {
  const key = value.slice(0, 3).toLowerCase();
  const map: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  return map[key] ?? null;
}

function isoDateFromPrinted(value: string): string {
  const text = normaliseSpaces(value);
  let match = /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) {
    const [, year, month, day] = match;
    const m = Number(month);
    const d = Number(day);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  match = /(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(20\d{2})/.exec(text);
  if (match) {
    const m = monthNumber(match[2]);
    const d = Number(match[1]);
    if (m && d >= 1 && d <= 31) return `${match[3]}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // Numeric day/month dates are only accepted when the order is unambiguous.
  match = /(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/.exec(text);
  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a > 12 && b <= 12) return `${match[3]}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    if (b > 12 && a <= 12) return `${match[3]}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }

  return "";
}

function extractDate(lines: string[], kind: "collected" | "verified"): string {
  const labels = kind === "collected"
    ? [/(?:collected(?:\s*at)?|collection\s*date|specimen\s*date|date\s*collected|تاريخ\s*(?:السحب|العينة))\s*[:：#\-]?\s*(.+)$/iu]
    : [/(?:verified(?:\s*at)?|verification\s*date|validated(?:\s*at)?|result\s*date|تاريخ\s*(?:التحقق|الاعتماد))\s*[:：#\-]?\s*(.+)$/iu];
  const raw = labelledValue(lines, labels);
  return isoDateFromPrinted(raw);
}

function extractSimpleMetadata(lines: string[]) {
  return {
    orderNo: labelledValue(lines, [/(?:order\s*(?:no\.?|number)|request\s*(?:no\.?|number)|رقم\s*(?:الطلب|الأمر))\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu]),
    sampleNo: labelledValue(lines, [/(?:sample\s*(?:no\.?|number)|specimen\s*(?:no\.?|number)|accession\s*(?:no\.?|number)|رقم\s*(?:العينة|العينه))\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu]),
    performedBy: labelledValue(lines, [/(?:performed\s*by|technician|أجراه|منفذ\s*التحليل)\s*[:：#\-]?\s*(.+)$/iu]),
    verifiedBy: labelledValue(lines, [/(?:verified\s*by|validated\s*by|approved\s*by|اعتمد(?:ه|ها)?|معتمد\s*النتيجة)\s*[:：#\-]?\s*(.+)$/iu]),
    labName: labelledValue(lines, [/(?:laboratory|lab\s*name|المختبر)\s*[:：#\-]?\s*(.+)$/iu]),
  };
}

function firstQualitative(tail: string): string {
  const lower = tail.toLocaleLowerCase();
  for (const term of QUALITATIVE_TERMS) {
    const index = lower.indexOf(term.toLocaleLowerCase());
    if (index >= 0) return tail.slice(index, index + term.length).trim();
  }
  return "";
}

function firstNumber(tail: string): string {
  const match = /(?:^|[\s:=])([<>≤≥]?\s*[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))(?=\s|$|[*HhLl()])/u.exec(tail);
  return match?.[1]?.replace(/\s+/g, "") ?? "";
}

function referenceRange(tail: string): { low: string; high: string; text: string } {
  const match = /([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*(?:-|–|—|to)\s*([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))/iu.exec(tail);
  if (!match) return { low: "", high: "", text: "" };
  return { low: match[1].replace(",", "."), high: match[2].replace(",", "."), text: match[0].trim() };
}

function printedUnit(line: string, def: TestDef): string {
  if (!def.unit) return "";
  const lower = line.toLocaleLowerCase().replace(/μ/g, "µ");
  const aliases = UNIT_ALIASES[def.unit] ?? [def.unit.toLocaleLowerCase()];
  return aliases.some((alias) => lower.includes(alias.toLocaleLowerCase())) ? def.unit : "";
}

function resultFromLine(
  line: string,
  page: number,
  common: ReturnType<typeof extractSimpleMetadata> & { collectedAt: string; verifiedAt: string },
): ExtractedResult | null {
  const test = findTest(line);
  if (!test) return null;
  const tail = line.slice(test.end).trim();
  const range = referenceRange(tail);

  if (test.def.resultType === "QUALITATIVE") {
    const valueText = firstQualitative(tail);
    if (!valueText) return null;
    return {
      test_name: test.printedName,
      test_code: test.def.code,
      result_type: "QUALITATIVE",
      value_number: "",
      value_text: valueText,
      unit: "",
      reference_low: "",
      reference_high: "",
      reference_text: "",
      collected_at: common.collectedAt,
      verified_at: common.verifiedAt,
      order_no: common.orderNo,
      sample_no: common.sampleNo,
      performed_by: common.performedBy,
      verified_by: common.verifiedBy,
      lab_name: common.labName,
      page,
      quote: line,
      confidence: 0.96,
    };
  }

  const value = firstNumber(tail);
  if (!value) return null;
  return {
    test_name: test.printedName,
    test_code: test.def.code,
    result_type: "QUANTITATIVE",
    value_number: value.replace(",", "."),
    value_text: "",
    unit: printedUnit(line, test.def),
    reference_low: range.low,
    reference_high: range.high,
    reference_text: range.text,
    collected_at: common.collectedAt,
    verified_at: common.verifiedAt,
    order_no: common.orderNo,
    sample_no: common.sampleNo,
    performed_by: common.performedBy,
    verified_by: common.verifiedBy,
    lab_name: common.labName,
    page,
    quote: line,
    confidence: range.text ? 0.97 : 0.93,
  };
}

function resultsFromPage(page: PageText): ExtractedResult[] {
  const metadata = extractSimpleMetadata(page.lines);
  const common = {
    ...metadata,
    collectedAt: extractDate(page.lines, "collected"),
    verifiedAt: extractDate(page.lines, "verified"),
  };
  const results: ExtractedResult[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < page.lines.length; index += 1) {
    let source = page.lines[index];
    let result = resultFromLine(source, page.page, common);

    // Some PDF generators place a test label and its result on adjacent text rows.
    if (!result && findTest(source) && page.lines[index + 1] && !findTest(page.lines[index + 1])) {
      const combined = `${source} ${page.lines[index + 1]}`;
      result = resultFromLine(combined, page.page, common);
      if (result) {
        source = combined;
        result.quote = combined;
        result.confidence = Math.min(result.confidence, 0.86);
      }
    }

    if (!result) continue;
    const key = `${result.test_code}|${result.value_number}|${result.value_text}|${source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(result);
  }

  return results;
}

export async function extractLocalPdfReport(bytes: Buffer): Promise<ExtractionOutput> {
  const { pages, pageCount } = await extractPages(bytes);
  const reports: ExtractedReport[] = [];

  for (const page of pages) {
    if (page.text.replace(/\s/g, "").length < MIN_TEXT_CHARS) continue;
    const nationalId = extractNationalId(page.lines, page.text);
    const fullName = extractName(page.lines);
    const employeeNo = extractEmployeeNo(page.lines);
    const results = resultsFromPage(page);
    if (results.length === 0) continue;

    reports.push({
      patient: {
        national_id: nationalId.value,
        full_name: fullName,
        employee_no: employeeNo,
        confidence: nationalId.value ? nationalId.confidence : fullName || employeeNo ? 0.78 : 0.64,
      },
      page_from: page.page,
      page_to: page.page,
      results,
    });
  }

  return {
    reports,
    usage: { inputTokens: 0, outputTokens: 0 },
    model: `${LOCAL_EXTRACTION_MODEL};pages=${pageCount}`,
  };
}
