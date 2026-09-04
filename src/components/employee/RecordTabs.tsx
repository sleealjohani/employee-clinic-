import Link from "next/link";
export type TabKey =
  | "overview"
  | "visits"
  | "labs"
  | "allergies"
  | "vaccines"
  | "education"
  | "notes"
  | "needleStick";
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
  return (
    <nav className="record-tabs no-print" aria-label={labels.overview}>
      {(Object.keys(labels) as TabKey[]).map((tab) => (
        <Link
          key={tab}
          href={"/employees/" + employeeId + "?tab=" + tab}
          className={active === tab ? "active" : ""}
          aria-current={active === tab ? "page" : undefined}
        >
          {labels[tab]}
          {counts[tab] !== undefined && (
            <span className="num">{counts[tab]}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
