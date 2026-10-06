import { cx } from '../lib/cx';

/*
 * PLACEHOLDERS — replace with the designer's SVG wordmark and X monogram when delivered
 * (BRAND-GUIDELINES.md §3.1, LOGO-DESIGN-BRIEF.md). Until then the wordmark is set in
 * IBM Plex Sans semibold with the X in the action colour, and the monogram is an "X" in a square.
 * Keep the component names and props; only the markup inside changes when the SVGs arrive.
 * Styles live in careers.css (.yx-logo, .yx-monogram, .yx-powered-by).
 */

export type BrandSize = 'sm' | 'md' | 'lg';

export interface LogoProps {
  /** sm 16 px (footers, "Powered by"), md 22 px (headers), lg 28 px (sign-in). */
  size?: BrandSize;
  className?: string;
}

/** YukthiX wordmark (placeholder). One accessible name: "YukthiX". */
export function Logo({ size = 'md', className }: LogoProps) {
  return (
    <span className={cx('yx-logo', className)} data-size={size} role="img" aria-label="YukthiX">
      <span aria-hidden="true">Yukthi</span>
      <span aria-hidden="true" className="yx-logo__x">
        X
      </span>
    </span>
  );
}

/** X monogram (placeholder) for the top of the rail and favicons (§1). sm 24 px, md 32 px, lg 40 px. */
export function Monogram({ size = 'md', className }: LogoProps) {
  return (
    <span className={cx('yx-monogram', className)} data-size={size} role="img" aria-label="YukthiX">
      <span aria-hidden="true">X</span>
    </span>
  );
}

export interface PoweredByProps {
  /** White-label tenants (D15) hide the lockup entirely (BRAND-GUIDELINES.md Part 5.1). */
  whiteLabel?: boolean;
  href?: string;
  className?: string;
}

/** Small "Powered by YukthiX" footer lockup for employee and candidate surfaces. */
export function PoweredBy({ whiteLabel, href = 'https://yukthix.com', className }: PoweredByProps) {
  if (whiteLabel) return null;
  return (
    <a className={cx('yx-powered-by', className)} href={href} target="_blank" rel="noopener noreferrer" aria-label="Powered by YukthiX">
      <span>Powered by</span>
      <Logo size="sm" />
    </a>
  );
}
