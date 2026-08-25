import { TESTS, type TestDef } from "@/lib/catalog/tests";
import { validateNationalId } from "@/lib/validation";
import type { ExtractedReport, ExtractedResult, ExtractionOutput } from "@/lib/ai/extract";

/**
 * Zero-API-cost extraction for machine-generated PDFs.
 * The PDF text layer is read on our server and structured with deterministic
 * rules. Nothing from this path is sent to an external AI provider.
 */
export const LOCAL_EXTRACTION_MODEL = "local-pdf-rules-v1";
export const LOCAL_PROMPT_VERSION = "local-pdf-rules-2026-08-1";

const QUALITATIVE = [
  "non reactive", "non-reactive", "nonreactive", "not detected", "none detected",
  "indeterminate", "equivocal", "borderline", "reactive", "positive", "negative",
  "detected", "present", "absent", "إيجابي", "ايجابي", "سلبي", "موجب", "سالب",
  "متفاعل", "غير متفاعل", "غير حاسم",
];

type PageText = { page: number; lines: string[]; text: string };
type Matcher = { def: TestDef; regex: RegExp; weight: number };

function clean(value: string) {
  return value.normalize("NFKC").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeMatcher(alias: string, def: TestDef): Matcher | null {
  const tokens = alias.match(/[\p{L}\p{N}%]+/gu) ?? [];
  if (!tokens.length) return null;
  const body = tokens.map(escapeRegex).join("[\\s\\-_/().]*");
  return {
    def,
    regex: new RegExp(`(^|[^\\p{L}\\p{N}])(${body})(?=$|[^\\p{L}\\p{N}])`, "iu"),
    weight: alias.length,
  };
}

const MATCHERS: Matcher[] = TESTS.flatMap((def) => {
  const aliases = new Set([def.code, def.nameEn, def.nameAr, ...def.aliases]);
  return [...aliases]
    .map((alias) => makeMatcher(alias, def))
    .filter((matcher): matcher is Matcher => matcher !== null);
}).sort((a, b) => b.weight - a.weight);

function findTest(line: string) {
  let best: { def: TestDef; start: number; end: number; printedName: string; weight: number } | null = null;
  for (const matcher of MATCHERS) {
    const match = matcher.regex.exec(line);
    if (!match) continue;
    const prefix = match[1]?.length ?? 0;
    const printedName = match[2] ?? "";
    const start = match.index + prefix;
    const candidate = { def: matcher.def, start, end: start + printedName.length, printedName, weight: matcher.weight };
    if (!best || candidate.start < best.start || (candidate.start === best.start && candidate.weight > best.weight)) best = candidate;
  }
  return best;
}

function groupRows(items: { str: string; transform: readonly number[] }[]) {
  const rows: { y: number; parts: { x: number; text: string }[] }[] = [];
  for (const item of items) {
    const text = clean(item.str);
    if (!text) continue;
    const x = Number(item.transform[4] ?? 0);
    const y = Number(item.transform[5] ?? 0);
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.4);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, text });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => clean(row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(" ")))
    .filter(Boolean);
}

async function readPages(bytes: Buffer): Promise<PageText[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: PageText[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.flatMap((item) => {
        if (!("str" in item) || !("transform" in item)) return [];
        return [{ str: item.str, transform: item.transform as readonly number[] }];
      });
      const lines = groupRows(items);
      pages.push({ page: pageNumber, lines, text: lines.join("\n") });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}

function labelValue(lines: string[], patterns: RegExp[]) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match?.[1]) return clean(match[1]).replace(/^[\s:：#\-–—]+/, "").slice(0, 160);
    }
  }
  return "";
}

function nationalId(lines: string[], text: string) {
  const patterns = [
    /(?:national\s*(?:id|identity)|patient\s*id|civil\s*id|iqama|id\s*(?:no\.?|number))\s*[:：#\-]?\s*([12]\d{9})/iu,
    /(?:رقم\s*(?:الهوية|الإقامة|الاقامة)|الهوية\s*(?:الوطنية)?|الإقامة|الاقامة)\s*[:：#\-]?\s*([12]\d{9})/u,
  ];
  for (const line of lines) {
    const compact = line.replace(/[\s-](?=\d)/g, "");
    for (const pattern of patterns) {
      const match = pattern.exec(compact);
      if (match?.[1]) return { value: match[1], confidence: 0.99 };
    }
  }
  const candidates = [...new Set(text.match(/\b[12]\d{9}\b/g) ?? [])]
    .filter((value) => validateNationalId(value).valid);
  return candidates.length === 1
    ? { value: candidates[0], confidence: 0.82 }
    : { value: "", confidence: 0.64 };
}

function patientName(lines: string[]) {
  return labelValue(lines, [
    /(?:patient\s*name|full\s*name)\s*[:：#\-]\s*(.+)$/iu,
    /(?:اسم\s*المريض|اسم\s*المراجع|الاسم)\s*[:：#\-]\s*(.+)$/u,
  ]).replace(/\s+(?:national\s*id|patient\s*id|file\s*no|mrn|رقم\s*الهوية).*$/iu, "").trim();
}

function employeeNo(lines: string[]) {
  return labelValue(lines, [
    /(?:employee\s*(?:no\.?|number|id)|staff\s*(?:no\.?|number)|file\s*(?:no\.?|number)|mrn)\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu,
    /(?:الرقم\s*الوظيفي|رقم\s*الموظف|رقم\s*الملف)\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu,
  ]);
}

function printedDate(value: string) {
  const text = clean(value);
  let match = /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  match = /(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/.exec(text);
  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a > 12 && b <= 12) return `${match[3]}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    if (b > 12 && a <= 12) return `${match[3]}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  return "";
}

function pageMetadata(lines: string[]) {
  const collected = labelValue(lines, [/(?:collected(?:\s*at)?|collection\s*date|specimen\s*date|date\s*collected|تاريخ\s*(?:السحب|العينة))\s*[:：#\-]?\s*(.+)$/iu]);
  const verified = labelValue(lines, [/(?:verified(?:\s*at)?|verification\s*date|validated(?:\s*at)?|result\s*date|تاريخ\s*(?:التحقق|الاعتماد))\s*[:：#\-]?\s*(.+)$/iu]);
  return {
    collectedAt: printedDate(collected),
    verifiedAt: printedDate(verified),
    orderNo: labelValue(lines, [/(?:order\s*(?:no\.?|number)|request\s*(?:no\.?|number)|رقم\s*(?:الطلب|الأمر))\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu]),
    sampleNo: labelValue(lines, [/(?:sample\s*(?:no\.?|number)|specimen\s*(?:no\.?|number)|accession\s*(?:no\.?|number)|رقم\s*(?:العينة|العينه))\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu]),
    performedBy: labelValue(lines, [/(?:performed\s*by|technician|أجراه|منفذ\s*التحليل)\s*[:：#\-]?\s*(.+)$/iu]),
    verifiedBy: labelValue(lines, [/(?:verified\s*by|validated\s*by|approved\s*by|اعتمد(?:ه|ها)?|معتمد\s*النتيجة)\s*[:：#\-]?\s*(.+)$/iu]),
    labName: labelValue(lines, [/(?:laboratory|lab\s*name|المختبر)\s*[:：#\-]?\s*(.+)$/iu]),
  };
}

function qualitativeValue(text: string) {
  const lower = text.toLocaleLowerCase();
  for (const term of QUALITATIVE) {
    const index = lower.indexOf(term.toLocaleLowerCase());
    if (index >= 0) return text.slice(index, index + term.length).trim();
  }
  return "";
}

function numericValue(text: string) {
  const match = /(?:^|[\s:=])([<>≤≥]?\s*[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))(?=\s|$|[*HhLl()])/u.exec(text);
  return match?.[1]?.replace(/\s+/g, "").replace(",", ".") ?? "";
}

function range(text: string) {
  const match = /([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*(?:-|–|—|to)\s*([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))/iu.exec(text);
  return match
    ? { low: match[1].replace(",", "."), high: match[2].replace(",", "."), text: match[0].trim() }
    : { low: "", high: "", text: "" };
}

function printedUnit(line: string, def: TestDef) {
  if (!def.unit) return "";
  const simplifiedLine = line.toLocaleLowerCase().replace(/μ/g, "µ").replace(/\s/g, "");
  const simplifiedUnit = def.unit.toLocaleLowerCase().replace(/μ/g, "µ").replace(/\s/g, "");
  return simplifiedLine.includes(simplifiedUnit) ? def.unit : "";
}

function parseResult(line: string, page: number, meta: ReturnType<typeof pageMetadata>): ExtractedResult | null {
  const test = findTest(line);
  if (!test) return null;
  const tail = line.slice(test.end).trim();
  if (test.def.resultType === "QUALITATIVE") {
    const value = qualitativeValue(tail);
    if (!value) return null;
    return {
      test_name: test.printedName,
      test_code: test.def.code,
      result_type: "QUALITATIVE",
      value_number: "",
      value_text: value,
      unit: "",
      reference_low: "",
      reference_high: "",
      reference_text: "",
      collected_at: meta.collectedAt,
      verified_at: meta.verifiedAt,
      order_no: meta.orderNo,
      sample_no: meta.sampleNo,
      performed_by: meta.performedBy,
      verified_by: meta.verifiedBy,
      lab_name: meta.labName,
      page,
      quote: line,
      confidence: 0.96,
    };
  }

  const value = numericValue(tail);
  if (!value) return null;
  const ref = range(tail);
  return {
    test_name: test.printedName,
    test_code: test.def.code,
    result_type: "QUANTITATIVE",
    value_number: value,
    value_text: "",
    unit: printedUnit(line, test.def),
    reference_low: ref.low,
    reference_high: ref.high,
    reference_text: ref.text,
    collected_at: meta.collectedAt,
    verified_at: meta.verifiedAt,
    order_no: meta.orderNo,
    sample_no: meta.sampleNo,
    performed_by: meta.performedBy,
    verified_by: meta.verifiedBy,
    lab_name: meta.labName,
    page,
    quote: line,
    confidence: ref.text ? 0.97 : 0.93,
  };
}

function pageResults(page: PageText) {
  const meta = pageMetadata(page.lines);
  const results: ExtractedResult[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < page.lines.length; index += 1) {
    let source = page.lines[index];
    let result = parseResult(source, page.page, meta);
    if (!result && findTest(source) && page.lines[index + 1] && !findTest(page.lines[index + 1])) {
      source = `${source} ${page.lines[index + 1]}`;
      result = parseResult(source, page.page, meta);
      if (result) result.confidence = Math.min(result.confidence, 0.86);
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
  const pages = await readPages(bytes);
  const reports: ExtractedReport[] = [];
  for (const page of pages) {
    if (page.text.replace(/\s/g, "").length < 24) continue;
    const results = pageResults(page);
    if (!results.length) continue;
    const id = nationalId(page.lines, page.text);
    const name = patientName(page.lines);
    const number = employeeNo(page.lines);
    reports.push({
      patient: {
        national_id: id.value,
        full_name: name,
        employee_no: number,
        confidence: id.value ? id.confidence : name || number ? 0.78 : 0.64,
      },
      page_from: page.page,
      page_to: page.page,
      results,
    });
  }
  return {
    reports,
    usage: { inputTokens: 0, outputTokens: 0 },
    model: LOCAL_EXTRACTION_MODEL,
  };
}
