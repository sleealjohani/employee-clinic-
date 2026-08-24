/* eslint-disable @next/next/no-img-element */

/**
 * The logo ships as SVG traced from the hospital's own artwork, so it stays
 * crisp at any size and on any background — the PNGs are only for contexts
 * that cannot take vectors.
 *
 * Both lockups are rendered and CSS picks one, so the correct version is in the
 * markup the server sends and there is no flash on first paint.
 */
export function Logo({ height = 40 }: { height?: number }) {
  return (
    <span className="clinic-logo" style={{ display: "inline-block", height, lineHeight: 0 }}>
      <img
        className="clinic-logo-light"
        src="/brand/logo.svg"
        alt="مستشفى الحديثة العام — Al Hadeethah General Hospital"
        height={height}
        style={{ height, width: "auto" }}
      />
      <img
        className="clinic-logo-dark"
        src="/brand/logo-white.svg"
        alt="مستشفى الحديثة العام — Al Hadeethah General Hospital"
        height={height}
        style={{ height, width: "auto" }}
      />
    </span>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/brand/mark.svg"
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
