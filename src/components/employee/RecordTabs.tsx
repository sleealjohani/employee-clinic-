import Link from "next/link";

export type TabKey =
  | "overview"
  | "visits"
  | "labs"
  | "allergies"
  | "vaccines"
  | "education"
  | "notes";

export function RecordTabs({
  employeeId,
  active,
  labels,
  counts,
}: {
  employeeId: string;
  active: TabKey;
  labels: Record<TabKey, string>;
  counts: Partial<Record<TabKey, number>>;
}) {
  const tabs: TabKey[] = ["overview", "visits", "labs", "allergies", "vaccines", "education", "notes"];

  return (
    <nav className="mb-4 overflow-x-auto no-print">
      <ul className="flex min-w-max gap-1 border-b">
        {tabs.map((tab) => {
          const isActive = tab === active;
          return (
            <li key={tab}>
              <Link
                href={`/employees/${employeeId}?tab=${tab}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold transition-colors"
                style={{
                  color: isActive ? "var(--accent-text)" : "var(--text-muted)",
                  borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                  marginBottom: "-1px",
                }}
              >
                {labels[tab]}
                {counts[tab] !== undefined && counts[tab]! > 0 && (
                  <span
                    className="num rounded-full px-1.5 text-[0.66rem] font-bold"
                    style={{
                      background: isActive ? "var(--accent-soft)" : "var(--surface-3)",
                      color: isActive ? "var(--accent-text)" : "var(--text-faint)",
                    }}
                  >
                    {counts[tab]}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
