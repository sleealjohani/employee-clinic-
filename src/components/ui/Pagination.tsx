import Link from "next/link";
import { getT } from "@/lib/i18n";
export function safePage(value?: string) {
  return Math.min(100000, Math.max(1, Math.floor(Number(value) || 1)));
}
export async function Pagination({
  total,
  page,
  size = 25,
  base,
  params = {},
}: {
  total: number;
  page: number;
  size?: number;
  base: string;
  params?: Record<string, string | undefined>;
}) {
  const t = await getT();
  const pages = Math.max(1, Math.ceil(total / size));
  const url = (p: number) =>
    base +
    "?" +
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(params).filter((x): x is [string, string] =>
          Boolean(x[1]),
        ),
      ),
      page: String(p),
    }).toString();
  if (pages === 1) return null;
  return (
    <nav className="pagination" aria-label={t("v2.pageOf", { page, pages })}>
      {page > 1 ? (
        <Link className="btn btn-ghost" href={url(page - 1)}>
          {t("v2.previousPage")}
        </Link>
      ) : (
        <span />
      )}
      <span>{t("v2.pageOf", { page, pages })}</span>
      {page < pages ? (
        <Link className="btn btn-ghost" href={url(page + 1)}>
          {t("v2.nextPage")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
