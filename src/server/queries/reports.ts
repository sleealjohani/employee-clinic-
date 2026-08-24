import { db } from "@/lib/db";
import type { Permission } from "@/lib/auth/rbac";
import { completeness, COMPLETENESS_LABELS, interpretLab } from "@/lib/clinical/rules";
import { nextVaccineDue } from "@/lib/clinical/due";
import { OCCUPATIONAL_VACCINES } from "@/lib/catalog/vaccines";
import { TEST_BY_CODE } from "@/lib/catalog/tests";
import { formatDate, formatValue, percent } from "@/lib/format";
import type { Locale } from "@/lib/i18n/core";
import { makeTranslator } from "@/lib/i18n/core";

export type ReportId =
  | "visits"
  | "labs"
  | "immunisation"
  | "incomplete"
  | "allergies"
  | "review";

export type ReportTable = {
  title: string;
  columns: string[];
  rows: (string | number)[][];
};

export type ReportMeta = {
  id: ReportId;
  labelKey: string;
  permission: Permission;
  /** Aggregate reports carry no clinical detail, so HR may read them. */
  aggregate: boolean;
  dateRange: boolean;
};

export const REPORTS: ReportMeta[] = [
  { id: "visits", labelKey: "rep.dailyVisits", permission: "reports.detailed", aggregate: false, dateRange: true },
  { id: "labs", labelKey: "rep.labs", permission: "reports.detailed", aggregate: false, dateRange: true },
  { id: "immunisation", labelKey: "rep.unvaccinated", permission: "reports.aggregate", aggregate: true, dateRange: false },
  { id: "incomplete", labelKey: "rep.incomplete", permission: "reports.aggregate", aggregate: true, dateRange: false },
  { id: "allergies", labelKey: "rep.allergies", permission: "reports.detailed", aggregate: false, dateRange: false },
  { id: "review", labelKey: "rep.needsReview", permission: "reports.detailed", aggregate: false, dateRange: false },
];

export function reportById(id: string): ReportMeta | undefined {
  return REPORTS.find((r) => r.id === id);
}

export async function buildReport(
  id: ReportId,
  locale: Locale,
  range: { from: Date; to: Date },
): Promise<ReportTable> {
  const t = makeTranslator(locale);

  switch (id) {
    case "visits": {
      const visits = await db.visit.findMany({
        where: { status: "ACTIVE", visitDate: { gte: range.from, lte: range.to } },
        orderBy: { visitDate: "desc" },
        include: { employee: { select: { name: true, nationalId: true, department: true } } },
      });
      return {
        title: t("rep.dailyVisits"),
        columns: [
          t("visit.date"),
          t("emp.name"),
          t("emp.nationalId"),
          t("emp.department"),
          t("visit.type"),
          t("visit.chief"),
          t("visit.diagnosis"),
          t("visit.plan"),
        ],
        rows: visits.map((v) => [
          formatDate(v.visitDate, locale),
          v.employee.name,
          v.employee.nationalId,
          v.employee.department ?? "—",
          t(`visitType.${v.type}`),
          v.chiefComplaint ?? "—",
          v.diagnosis ?? "—",
          v.plan ?? "—",
        ]),
      };
    }

    case "labs": {
      const labs = await db.labResult.findMany({
        where: { status: "ACTIVE", collectedAt: { gte: range.from, lte: range.to } },
        orderBy: { collectedAt: "desc" },
        include: { employee: { select: { name: true, nationalId: true, department: true } } },
      });
      return {
        title: t("rep.labs"),
        columns: [
          t("lab.collectedAt"),
          t("emp.name"),
          t("emp.nationalId"),
          t("emp.department"),
          t("lab.test"),
          t("lab.value"),
          t("lab.unit"),
          t("lab.reference"),
          t("lab.flag"),
          t("lab.interpretation"),
        ],
        rows: labs.map((l) => {
          const def = TEST_BY_CODE[l.testCode];
          const { interpretation } = interpretLab(l.testCode, l.flag, l.valueNum, locale);
          return [
            formatDate(l.collectedAt, locale),
            l.employee.name,
            l.employee.nationalId,
            l.employee.department ?? "—",
            def ? (locale === "ar" ? def.nameAr : def.nameEn) : l.testName,
            l.resultType === "QUANTITATIVE" ? formatValue(l.valueNum) : (l.valueText ?? "—"),
            l.unit ?? "—",
            l.refLow !== null && l.refHigh !== null ? `${l.refLow} - ${l.refHigh}` : (l.refText ?? "—"),
            t(`flag.${l.flag}`),
            interpretation,
          ];
        }),
      };
    }

    case "immunisation": {
      const employees = await db.employee.findMany({
        where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
        orderBy: { name: "asc" },
        select: {
          name: true,
          nationalId: true,
          department: true,
          vaccinations: {
            where: { status: "ACTIVE" },
            select: { vaccineCode: true, doseNumber: true, givenAt: true, nextDueAt: true },
          },
        },
      });

      const rows = employees
        .map((emp) => {
          const cells = OCCUPATIONAL_VACCINES.map((vac) => {
            const doses = emp.vaccinations.filter((v) => v.vaccineCode === vac.code);
            const next = nextVaccineDue(vac.code, doses);
            if (!next) return t("vac.upToDate");
            return next.dueDate < new Date()
              ? `${t("vac.overdue")} (${formatDate(next.dueDate, locale)})`
              : `${t("vac.dueSoon")} (${formatDate(next.dueDate, locale)})`;
          });
          return { emp, cells, outstanding: cells.filter((c) => c !== t("vac.upToDate")).length };
        })
        .filter((r) => r.outstanding > 0)
        .map((r) => [
          r.emp.name,
          r.emp.nationalId,
          r.emp.department ?? "—",
          ...r.cells,
        ]);

      return {
        title: t("rep.unvaccinated"),
        columns: [
          t("emp.name"),
          t("emp.nationalId"),
          t("emp.department"),
          ...OCCUPATIONAL_VACCINES.map((v) => (locale === "ar" ? v.nameAr : v.nameEn)),
        ],
        rows,
      };
    }

    case "incomplete": {
      const employees = await db.employee.findMany({
        where: { isArchived: false },
        orderBy: { name: "asc" },
        select: {
          name: true,
          nationalId: true,
          department: true,
          dob: true,
          gender: true,
          phone: true,
          employeeNo: true,
          jobTitle: true,
          hireDate: true,
          bloodType: true,
        },
      });

      return {
        title: t("rep.incomplete"),
        columns: [t("emp.name"), t("emp.nationalId"), t("emp.department"), t("emp.completeness"), t("emp.missingFields")],
        rows: employees
          .map((emp) => ({ emp, c: completeness(emp) }))
          .filter((r) => r.c.missing.length > 0)
          .sort((a, b) => a.c.score - b.c.score)
          .map((r) => [
            r.emp.name,
            r.emp.nationalId,
            r.emp.department ?? "—",
            `${r.c.score}%`,
            r.c.missing.map((f) => COMPLETENESS_LABELS[f][locale]).join("، "),
          ]),
      };
    }

    case "allergies": {
      const allergies = await db.allergy.findMany({
        where: { status: "ACTIVE", allergyStatus: "ACTIVE" },
        orderBy: [{ severity: "desc" }, { recordedAt: "desc" }],
        include: { employee: { select: { name: true, nationalId: true, department: true } } },
      });
      return {
        title: t("rep.allergies"),
        columns: [
          t("emp.name"),
          t("emp.nationalId"),
          t("emp.department"),
          t("allergy.type"),
          t("allergy.substance"),
          t("allergy.severity"),
          t("allergy.reaction"),
          t("allergy.action"),
          t("allergy.certainty"),
        ],
        rows: allergies.map((a) => [
          a.employee.name,
          a.employee.nationalId,
          a.employee.department ?? "—",
          t(`allergyType.${a.type}`),
          a.substance,
          t(`severity.${a.severity}`),
          a.reaction ?? "—",
          a.action ?? "—",
          t(`certainty.${a.certainty}`),
        ]),
      };
    }

    case "review": {
      const labs = await db.labResult.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { requiresReview: true, reviewedAt: null },
            { flag: { in: ["CRITICAL_HIGH", "CRITICAL_LOW"] }, criticalNotifiedAt: null },
          ],
        },
        orderBy: { collectedAt: "asc" },
        include: { employee: { select: { name: true, nationalId: true, department: true } } },
      });
      return {
        title: t("rep.needsReview"),
        columns: [
          t("lab.collectedAt"),
          t("emp.name"),
          t("emp.nationalId"),
          t("emp.department"),
          t("lab.test"),
          t("lab.value"),
          t("lab.flag"),
          t("lab.action"),
        ],
        rows: labs.map((l) => {
          const def = TEST_BY_CODE[l.testCode];
          const { action } = interpretLab(l.testCode, l.flag, l.valueNum, locale);
          return [
            formatDate(l.collectedAt, locale),
            l.employee.name,
            l.employee.nationalId,
            l.employee.department ?? "—",
            def ? (locale === "ar" ? def.nameAr : def.nameEn) : l.testName,
            l.resultType === "QUANTITATIVE" ? formatValue(l.valueNum) : (l.valueText ?? "—"),
            t(`flag.${l.flag}`),
            action,
          ];
        }),
      };
    }
  }
}

/** Aggregate-only view for the administrative viewer role — counts, never names. */
export async function buildAggregateSummary(locale: Locale): Promise<ReportTable> {
  const t = makeTranslator(locale);
  const employees = await db.employee.findMany({
    where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
    select: {
      department: true,
      nationalId: true,
      name: true,
      dob: true,
      gender: true,
      phone: true,
      employeeNo: true,
      jobTitle: true,
      hireDate: true,
      bloodType: true,
      vaccinations: { where: { status: "ACTIVE" }, select: { vaccineCode: true, doseNumber: true, givenAt: true, nextDueAt: true } },
    },
  });

  const byDept = new Map<string, { total: number; complete: number; immunised: number }>();
  for (const emp of employees) {
    const key = emp.department ?? t("common.none");
    const entry = byDept.get(key) ?? { total: 0, complete: 0, immunised: 0 };
    entry.total++;
    if (completeness(emp).missing.length === 0) entry.complete++;
    const outstanding = OCCUPATIONAL_VACCINES.some((vac) =>
      nextVaccineDue(
        vac.code,
        emp.vaccinations.filter((v) => v.vaccineCode === vac.code),
      ),
    );
    if (!outstanding) entry.immunised++;
    byDept.set(key, entry);
  }

  return {
    title: t("rep.title"),
    columns: [t("emp.department"), t("emp.count"), t("emp.completeness"), t("dash.hbvProtected")],
    rows: [...byDept.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([dept, v]) => [dept, v.total, `${percent(v.complete, v.total)}%`, `${percent(v.immunised, v.total)}%`]),
  };
}
