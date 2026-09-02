import Anthropic from "@anthropic-ai/sdk";
import { TESTS } from "@/lib/catalog/tests";

/**
 * Assisted extraction of printed laboratory reports.
 *
 * Two rules shape everything here:
 *
 *  1. The model EXTRACTS; it never interprets. It returns values, units and
 *     ranges exactly as printed. Whether a value is high, low, critical or
 *     protective is decided afterwards by src/lib/clinical/rules.ts.
 *  2. Nothing it returns is trusted. Every record carries the page it came
 *     from and a verbatim quote, and lands in a review queue where a human
 *     compares it against the original document before it reaches a record.
 *
 * The document is sent as a native PDF/image block, not OCR text: lab reports
 * are tables, and a text-only pipeline loses which value belongs to which row.
 */

export const EXTRACTION_MODEL = process.env.LAB_EXTRACTION_MODEL?.trim() || "";
export const PROMPT_VERSION = "lab-extract-2026-08-1";

/**
 * A full occupational-screening batch runs to tens of megabytes. The upload is
 * chunked, so this is a policy limit rather than a transport one — it bounds
 * what a single attachment row may grow to.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type ExtractedResult = {
  test_name: string;
  test_code: string;
  result_type: "QUANTITATIVE" | "QUALITATIVE";
  value_number: string;
  value_text: string;
  unit: string;
  reference_low: string;
  reference_high: string;
  reference_text: string;
  collected_at: string;
  verified_at: string;
  order_no: string;
  sample_no: string;
  performed_by: string;
  verified_by: string;
  lab_name: string;
  page: number;
  quote: string;
  confidence: number;
  /**
   * True when this result sits on a continuation page that carried no header of
   * its own and inherited the previous page's patient. Never auto-linked.
   */
  carried_identity?: boolean;
};

export type ExtractedReport = {
  patient: {
    national_id: string;
    full_name: string;
    employee_no: string;
    confidence: number;
  };
  page_from: number;
  page_to: number;
  results: ExtractedResult[];
};

export type ExtractionOutput = {
  reports: ExtractedReport[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  /**
   * Pages that carried readable text. Zero means the document is a scan with
   * no text layer — a different problem from "text, but nothing recognisable
   * in it", and one the reader needs told plainly.
   */
  textPages?: number;
  pageCount?: number;
  unreadPages?: number[];
};

const TEST_CODE_ENUM = [...TESTS.map((t) => t.code), "OTHER"];

const TOOL = {
  name: "record_lab_report",
  description:
    "Record every laboratory report found in the document, exactly as printed. Call this once with all reports.",
  strict: true,
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["reports"],
    properties: {
      reports: {
        type: "array",
        description:
          "One entry per patient report in the document. A single PDF often contains several patients; keep them separate.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["patient", "page_from", "page_to", "results"],
          properties: {
            patient: {
              type: "object",
              additionalProperties: false,
              required: [
                "national_id",
                "full_name",
                "employee_no",
                "confidence",
              ],
              properties: {
                national_id: {
                  type: "string",
                  description:
                    "The national ID / Iqama number exactly as printed. Empty string if it is not printed. Never invent or infer one.",
                },
                full_name: {
                  type: "string",
                  description: "Patient name as printed, or empty string.",
                },
                employee_no: {
                  type: "string",
                  description:
                    "Employee/file number as printed, or empty string.",
                },
                confidence: {
                  type: "number",
                  description:
                    "0 to 1: how legible and unambiguous the identifying fields were.",
                },
              },
            },
            page_from: {
              type: "integer",
              description: "First page of this report (1-based).",
            },
            page_to: {
              type: "integer",
              description: "Last page of this report (1-based).",
            },
            results: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "test_name",
                  "test_code",
                  "result_type",
                  "value_number",
                  "value_text",
                  "unit",
                  "reference_low",
                  "reference_high",
                  "reference_text",
                  "collected_at",
                  "verified_at",
                  "order_no",
                  "sample_no",
                  "performed_by",
                  "verified_by",
                  "lab_name",
                  "page",
                  "quote",
                  "confidence",
                ],
                properties: {
                  test_name: {
                    type: "string",
                    description: "The test name exactly as printed.",
                  },
                  test_code: {
                    type: "string",
                    enum: TEST_CODE_ENUM,
                    description:
                      "The matching catalogue code, or OTHER if the test is not in the list.",
                  },
                  result_type: {
                    type: "string",
                    enum: ["QUANTITATIVE", "QUALITATIVE"],
                  },
                  value_number: {
                    type: "string",
                    description:
                      "The numeric result as printed (digits and decimal point only, no unit). Empty string for qualitative results.",
                  },
                  value_text: {
                    type: "string",
                    description:
                      "The textual result as printed, e.g. Reactive, Non-Reactive, Negative. Empty string for numeric results.",
                  },
                  unit: {
                    type: "string",
                    description: "Unit as printed, or empty string.",
                  },
                  reference_low: {
                    type: "string",
                    description:
                      "Lower bound of the printed reference range, or empty.",
                  },
                  reference_high: {
                    type: "string",
                    description:
                      "Upper bound of the printed reference range, or empty.",
                  },
                  reference_text: {
                    type: "string",
                    description:
                      "The reference range as printed when it is not a simple numeric pair.",
                  },
                  collected_at: {
                    type: "string",
                    description:
                      "Collection date as YYYY-MM-DD, or empty string.",
                  },
                  verified_at: {
                    type: "string",
                    description:
                      "Verification date as YYYY-MM-DD, or empty string.",
                  },
                  order_no: { type: "string" },
                  sample_no: { type: "string" },
                  performed_by: { type: "string" },
                  verified_by: { type: "string" },
                  lab_name: { type: "string" },
                  page: {
                    type: "integer",
                    description: "Page this result appears on (1-based).",
                  },
                  quote: {
                    type: "string",
                    description:
                      "The verbatim line from the report containing this result, so a reviewer can find it on the page.",
                  },
                  confidence: {
                    type: "number",
                    description: "0 to 1 for this specific row.",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You transcribe printed clinical laboratory reports into structured records for an occupational health clinic.

Absolute rules:
- Transcribe only. Copy values, units, reference ranges, dates, names and numbers exactly as printed.
- Never interpret. Do not decide whether a value is normal, high, low, critical, positive or protective. Do not add commentary. The receiving system computes all of that from the value and the range.
- Never guess or complete a field that is not printed. Use an empty string. A missing national ID must stay empty — an invented identifier could attach a result to the wrong person.
- Do not convert units or reformat numbers other than stripping the unit from value_number.
- Dates: output YYYY-MM-DD. If a printed date is ambiguous (e.g. 03/04/2026), leave collected_at empty rather than choosing an interpretation.
- One document may contain several patients. Group results under the patient printed on the same page, and never carry an identifier across a page boundary unless the same header repeats.
- Set confidence honestly: low when the scan is faint, the row is crowded, handwriting is involved, or you had to choose between readings.
- Include every laboratory result you can see, including ones absent from the catalogue (use test_code OTHER).

Call record_lab_report exactly once with everything you found.`;

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  return new Anthropic({ apiKey });
}

export type ImportAvailability =
  | { enabled: true }
  /** Switched off deliberately — e.g. external processing is not approved. */
  | { enabled: false; reason: "DISABLED" }
  /** Switched on, but the deployment has no API key configured. */
  | { enabled: false; reason: "NO_KEY" };

/**
 * Local PDF extraction is the default. External processing requires an explicit
 * ENABLE_AI_IMPORT="true", a provider key, and a configured model identifier.
 */
export function importAvailability(): ImportAvailability {
  if (process.env.ENABLE_AI_IMPORT !== "true")
    return { enabled: false, reason: "DISABLED" };
  if (!process.env.ANTHROPIC_API_KEY || !EXTRACTION_MODEL)
    return { enabled: false, reason: "NO_KEY" };
  return { enabled: true };
}

export function importEnabled(): boolean {
  return importAvailability().enabled;
}

export async function extractLabReport(
  data: Buffer,
  mimeType: string,
): Promise<ExtractionOutput> {
  const anthropic = client();
  const base64 = data.toString("base64");

  const documentBlock =
    mimeType === "application/pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: base64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
            data: base64,
          },
        };

  // Streamed: a multi-page report can run long, and a non-streaming request at
  // this max_tokens risks an HTTP timeout.
  const stream = anthropic.messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 32000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          {
            type: "text",
            text: "Transcribe every laboratory report in this document using the record_lab_report tool.",
          },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();

  const toolUse = message.content.find(
    (block): block is Extract<typeof block, { type: "tool_use" }> =>
      block.type === "tool_use",
  );

  if (!toolUse) {
    throw new Error("The extraction model returned no structured output");
  }

  // Tool inputs are JSON — parse rather than string-match, escaping varies.
  const parsed = (
    typeof toolUse.input === "string"
      ? JSON.parse(toolUse.input)
      : toolUse.input
  ) as { reports?: ExtractedReport[] };

  return {
    reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    usage: {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
    },
    model: message.model,
  };
}
