import { TESTS, type TestDef } from "@/lib/catalog/tests";
import { validateNationalId } from "@/lib/validation";
import { installDomMatrix } from "./dom-matrix";
import type { ExtractedReport, ExtractedResult, ExtractionOutput } from "@/lib/ai/extract";

export const LOCAL_EXTRACTION_MODEL = "local-pdf-rules-v1";
export const LOCAL_PROMPT_VERSION = "local-pdf-rules-2026-08-1";

type PageText = { page: number; lines: string[]; text: string };
type Match = { def: TestDef; regex: RegExp; weight: number };

const QUAL = [
  "non reactive", "non-reactive", "nonreactive", "not detected", "none detected",
  "indeterminate", "equivocal", "borderline", "reactive", "positive", "negative",
  "detected", "present", "absent", "إيجابي", "ايجابي", "سلبي", "موجب", "سالب",
  "متفاعل", "غير متفاعل", "غير حاسم",
];

function clean(value: string) {
  return value.normalize("NFKC").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function esc(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCHERS: Match[] = TESTS.flatMap((def) => {
  const aliases = new Set([def.code, def.nameEn, def.nameAr, ...def.aliases]);
  return [...aliases].flatMap((alias) => {
    const tokens = alias.match(/[\p{L}\p{N}%]+/gu) ?? [];
    if (!tokens.length) return [];
    const body = tokens.map(esc).join("[\\s\\-_/().]*");
    return [{
      def,
      regex: new RegExp(`(^|[^\\p{L}\\p{N}])(${body})(?=$|[^\\p{L}\\p{N}])`, "iu"),
      weight: alias.length,
    }];
  });
}).sort((a, b) => b.weight - a.weight);

function findTest(line: string) {
  let best: { def: TestDef; start: number; end: number; printedName: string; weight: number } | null = null;
  for (const matcher of MATCHERS) {
    const hit = matcher.regex.exec(line);
    if (!hit) continue;
    const prefix = hit[1]?.length ?? 0;
    const printedName = hit[2] ?? "";
    const start = hit.index + prefix;
    const candidate = { def: matcher.def, start, end: start + printedName.length, printedName, weight: matcher.weight };
    if (!best || candidate.start < best.start || (candidate.start === best.start && candidate.weight > best.weight)) best = candidate;
  }
  return best;
}

function rows(items: { str: string; transform: number[] }[]) {
  const grouped: { y: number; cells: { x: number; text: string }[] }[] = [];
  for (const item of items) {
    const text = clean(item.str);
    if (!text) continue;
    const x = Number(item.transform[4] ?? 0);
    const y = Number(item.transform[5] ?? 0);
    let row = grouped.find((entry) => Math.abs(entry.y - y) <= 2.4);
    if (!row) {
      row = { y, cells: [] };
      grouped.push(row);
    }
    row.cells.push({ x, text });
  }
  return grouped
    .sort((a, b) => b.y - a.y)
    .map((row) => clean(row.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text).join(" ")))
    .filter(Boolean);
}

async function readPages(bytes: Buffer): Promise<PageText[]> {
  // Must precede the import: pdf.js decides at module load whether it has a
  // DOMMatrix, and a scanned report reaches code that needs one even though
  // we only ever ask for text.
  installDomMatrix();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  const pages: PageText[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items: { str: string; transform: number[] }[] = [];
    for (const item of content.items) {
      const raw = item as unknown as { str?: unknown; transform?: unknown };
      if (typeof raw.str !== "string" || !Array.isArray(raw.transform)) continue;
      items.push({ str: raw.str, transform: raw.transform.map(Number) });
    }
    const lines = rows(items);
    pages.push({ page: n, lines, text: lines.join("\n") });
  }
  return pages;
}

/**
 * Field labels that can follow a value on the same physical line. PDF text
 * extraction flattens a printed grid into one line — "Patient Name AHMED ...
 * Order No ORD-58412" — so a captured value has to be cut where the next
 * label starts.
 */
const NEXT_LABEL =
  /(?:national\s*(?:id|identity)|patient\s*id|civil\s*id|iqama|id\s*no\.?|employee\s*(?:no\.?|number|id)|staff\s*(?:no\.?|number)|file\s*(?:no\.?|number)|mrn|order\s*(?:no\.?|number)|request\s*(?:no\.?|number)|sample\s*(?:no\.?|number)|specimen\s*(?:no\.?|number)|accession|collected|collection\s*date|verified|validated|result\s*date|reported|printed|sex|gender|age|d\.?o\.?b\.?|date\s*of\s*birth|department|nationality|visit\s*(?:no\.?|type)|رقم\s*(?:الهوية|الإقامة|الاقامة|الطلب|العينة|الملف)|الرقم\s*الوظيفي|تاريخ\s*\S+|الجنس|العمر|القسم|الجنسية)/iu;

function cutAtNextLabel(value: string) {
  const hit = NEXT_LABEL.exec(value);
  const head = hit ? value.slice(0, hit.index) : value;
  return clean(head).replace(/[\s:：#\-–—,]+$/u, "");
}

function labelled(lines: string[], patterns: RegExp[]) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const hit = pattern.exec(line);
      if (hit?.[1]) return clean(hit[1]).replace(/^[\s:：#\-–—]+/, "").slice(0, 160);
    }
  }
  return "";
}

function identity(lines: string[], text: string) {
  const idPatterns = [
    /(?:national\s*(?:id|identity)|patient\s*id|civil\s*id|iqama|id\s*(?:no\.?|number))\s*[:：#\-]?\s*([12]\d{9})/iu,
    /(?:رقم\s*(?:الهوية|الإقامة|الاقامة)|الهوية\s*(?:الوطنية)?|الإقامة|الاقامة)\s*[:：#\-]?\s*([12]\d{9})/u,
  ];
  let id = "";
  let confidence = 0.64;
  for (const line of lines) {
    const compact = line.replace(/[\s-](?=\d)/g, "");
    for (const pattern of idPatterns) {
      const hit = pattern.exec(compact);
      if (hit?.[1]) {
        id = hit[1];
        confidence = 0.99;
        break;
      }
    }
    if (id) break;
  }
  if (!id) {
    const candidates = [...new Set(text.match(/\b[12]\d{9}\b/g) ?? [])]
      .filter((value) => validateNationalId(value).valid);
    if (candidates.length === 1) {
      id = candidates[0];
      confidence = 0.82;
    }
  }
  const name = cutAtNextLabel(
    labelled(lines, [
      /(?:patient(?:'?s)?\s*name|full\s*name)\s*[:：#\-]?\s*(.+)$/iu,
      /(?:اسم\s*(?:المريض|المراجع|الموظف)|الاسم)\s*[:：#\-]?\s*(.+)$/u,
    ]),
  )
    // A long digit run after the name is an identifier, not part of it.
    .replace(/\s*\b\d{6,}\b.*$/u, "")
    .trim();
  const employeeNo = labelled(lines, [
    /(?:employee\s*(?:no\.?|number|id)|staff\s*(?:no\.?|number)|file\s*(?:no\.?|number)|mrn)\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu,
    /(?:الرقم\s*الوظيفي|رقم\s*الموظف|رقم\s*الملف)\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu,
  ]);
  return { id, name, employeeNo, confidence: id ? confidence : name || employeeNo ? 0.78 : 0.64 };
}

function dateFrom(value: string) {
  let hit = /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(value);
  if (hit) {
    const month = Number(hit[2]);
    const day = Number(hit[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${hit[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  hit = /(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/.exec(value);
  if (hit) {
    const a = Number(hit[1]);
    const b = Number(hit[2]);
    if (a > 12 && b <= 12) return `${hit[3]}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    if (b > 12 && a <= 12) return `${hit[3]}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  return "";
}

function meta(lines: string[]) {
  return {
    collectedAt: dateFrom(labelled(lines, [/(?:collected(?:\s*at)?|collection\s*date|specimen\s*date|date\s*collected|تاريخ\s*(?:السحب|العينة))\s*[:：#\-]?\s*(.+)$/iu])),
    verifiedAt: dateFrom(labelled(lines, [/(?:verified(?:\s*at)?|verification\s*date|validated(?:\s*at)?|result\s*date|تاريخ\s*(?:التحقق|الاعتماد))\s*[:：#\-]?\s*(.+)$/iu])),
    orderNo: labelled(lines, [/(?:order\s*(?:no\.?|number)|request\s*(?:no\.?|number)|رقم\s*(?:الطلب|الأمر))\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu]),
    sampleNo: labelled(lines, [/(?:sample\s*(?:no\.?|number)|specimen\s*(?:no\.?|number)|accession\s*(?:no\.?|number)|رقم\s*(?:العينة|العينه))\s*[:：#\-]?\s*([A-Z0-9\-/]+)/iu]),
    performedBy: cutAtNextLabel(labelled(lines, [/(?:performed\s*by|technician|منفذ\s*التحليل)\s*[:：#\-]?\s*(.+)$/iu])),
    verifiedBy: cutAtNextLabel(labelled(lines, [/(?:verified\s*by|validated\s*by|approved\s*by|معتمد\s*النتيجة)\s*[:：#\-]?\s*(.+)$/iu])),
    labName: cutAtNextLabel(labelled(lines, [/(?:laboratory|lab\s*name|المختبر)\s*[:：#\-]?\s*(.+)$/iu])),
  };
}

function qualitative(text: string) {
  const lower = text.toLocaleLowerCase();
  for (const term of QUAL) {
    const at = lower.indexOf(term.toLocaleLowerCase());
    if (at >= 0) return text.slice(at, at + term.length).trim();
  }
  return "";
}

function number(text: string) {
  return /(?:^|[\s:=])([<>≤≥]?\s*[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))(?=\s|$|[*HhLl()])/u.exec(text)?.[1]
    ?.replace(/\s+/g, "").replace(",", ".") ?? "";
}

/** µ and u are the same unit in print; so are μ (Greek mu) and spacing variants. */
function normaliseUnit(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[µμ]/g, "u")
    .replace(/\s/g, "");
}

function refRange(text: string) {
  const hit = /([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*(?:-|–|—|to)\s*([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))/iu.exec(text);
  return hit ? { low: hit[1].replace(",", "."), high: hit[2].replace(",", "."), text: hit[0].trim() } : { low: "", high: "", text: "" };
}

function parse(line: string, page: number, metadata: ReturnType<typeof meta>): ExtractedResult | null {
  const test = findTest(line);
  if (!test) return null;
  const tail = line.slice(test.end).trim();
  const base = {
    test_name: test.printedName,
    test_code: test.def.code,
    collected_at: metadata.collectedAt,
    verified_at: metadata.verifiedAt,
    order_no: metadata.orderNo,
    sample_no: metadata.sampleNo,
    performed_by: metadata.performedBy,
    verified_by: metadata.verifiedBy,
    lab_name: metadata.labName,
    page,
    quote: line,
  };
  if (test.def.resultType === "QUALITATIVE") {
    const value = qualitative(tail);
    if (!value) return null;
    return { ...base, result_type: "QUALITATIVE", value_number: "", value_text: value, unit: "", reference_low: "", reference_high: "", reference_text: "", confidence: 0.96 };
  }
  const value = number(tail);
  if (!value) return null;
  const range = refRange(tail);
  const unit = test.def.unit && normaliseUnit(line).includes(normaliseUnit(test.def.unit)) ? test.def.unit : "";
  return { ...base, result_type: "QUANTITATIVE", value_number: value, value_text: "", unit, reference_low: range.low, reference_high: range.high, reference_text: range.text, confidence: range.text ? 0.97 : 0.93 };
}

function results(page: PageText) {
  const metadata = meta(page.lines);
  const out: ExtractedResult[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < page.lines.length; i += 1) {
    let source = page.lines[i];
    let item = parse(source, page.page, metadata);
    if (!item && findTest(source) && page.lines[i + 1] && !findTest(page.lines[i + 1])) {
      source = `${source} ${page.lines[i + 1]}`;
      item = parse(source, page.page, metadata);
      if (item) item.confidence = Math.min(item.confidence, 0.86);
    }
    if (!item) continue;
    const key = `${item.test_code}|${item.value_number}|${item.value_text}|${source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function extractLocalPdfReport(bytes: Buffer): Promise<ExtractionOutput> {
  const pages = await readPages(bytes);
  const reports: ExtractedReport[] = [];
  // A page of pure image data yields a handful of stray characters at most.
  const textPages = pages.filter((page) => page.text.replace(/\s/g, "").length >= 24).length;

  // A batch of reports usually runs one patient per page, but a long panel spills
  // onto a continuation page that repeats no header. Those pages used to lose the
  // patient entirely and land in the unmatched queue, so a two-page report always
  // arrived half orphaned. They now inherit the patient from the page before —
  // marked as inherited, so the reviewer confirms rather than the system assuming.
  let open: ExtractedReport | null = null;

  for (const page of pages) {
    if (page.text.replace(/\s/g, "").length < 24) continue;
    const extracted = results(page);
    if (!extracted.length) continue;

    const person = identity(page.lines, page.text);
    const headed = Boolean(person.id || person.name || person.employeeNo);

    if (!headed && open) {
      for (const result of extracted) {
        result.carried_identity = true;
        result.confidence = Math.min(result.confidence, 0.7);
      }
      open.results.push(...extracted);
      open.page_to = page.page;
      continue;
    }

    const report: ExtractedReport = {
      patient: {
        national_id: person.id,
        full_name: person.name,
        employee_no: person.employeeNo,
        confidence: person.confidence,
      },
      page_from: page.page,
      page_to: page.page,
      results: extracted,
    };
    reports.push(report);
    open = headed ? report : null;
  }

  return { reports, usage: { inputTokens: 0, outputTokens: 0 }, model: LOCAL_EXTRACTION_MODEL, textPages };
}
