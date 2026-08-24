import { db } from "@/lib/db";
import { completeness } from "@/lib/clinical/rules";
import { computeDueItems, type DueItem } from "@/lib/clinical/due";
import type { Locale } from "@/lib/i18n/core";

/**
 * Loads everything the due engine needs in one pass. At this clinic's scale
 * (under 150 employees) a full scan is cheaper and simpler than incremental
 * bookkeeping, and it can never drift out of sync with the records.
 */
export async function loadDueItems(locale: Locale): Promise<DueItem[]> {
  const employees = await db.employee.findMany({
    where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
    select: {
      id: true,
      name: true,
      department: true,
      nationalId: true,
      dob: true,
      gender: true,
      phone: true,
      employeeNo: true,
      jobTitle: true,
      hireDate: true,
      bloodType: true,
      vaccinations: {
        where: { status: "ACTIVE" },
        select: { vaccineCode: true, doseNumber: true, givenAt: true, nextDueAt: true },
      },
      labResults: {
        where: { status: { not: "ENTERED_IN_ERROR" } },
        select: {
          id: true,
          testCode: true,
          flag: true,
          collectedAt: true,
          requiresReview: true,
          reviewedAt: true,
          criticalNotifiedAt: true,
        },
      },
    },
  });

  return computeDueItems(
    employees.map((emp) => ({
      id: emp.id,
      name: emp.name,
      department: emp.department,
      missingFields: completeness(emp).missing,
      vaccinations: emp.vaccinations,
      labs: emp.labResults,
    })),
    locale,
  );
}
