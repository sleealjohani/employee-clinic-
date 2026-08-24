import type { ReactNode } from "react";

/**
 * Anchor to a file-producing route handler (/api/export/*). These are route
 * handlers that stream a spreadsheet, so they must be a full browser request —
 * a client-side transition would try to render the response as a page.
 */
export function DownloadLink({
  href,
  children,
  className = "btn btn-ghost",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} className={className} download>
      {children}
    </a>
  );
}
