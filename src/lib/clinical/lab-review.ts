import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

// Global queue, not the current page/filter. Import candidates are a separate model.
export const pendingLabReviewWhere = {
  status: "ACTIVE",
  reviewedAt: null,
  employee: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
} satisfies Prisma.LabResultWhereInput;

export function labReviewSnapshot(rows: { id: string; updatedAt: Date }[]) {
  return {
    count: rows.length,
    version: createHash("sha256")
      .update(
        JSON.stringify(
          rows
            .map((r) => [r.id, r.updatedAt.toISOString()])
            .sort((a, b) => a[0].localeCompare(b[0])),
        ),
      )
      .digest("hex"),
  };
}
