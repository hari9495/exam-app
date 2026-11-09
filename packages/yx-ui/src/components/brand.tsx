import { cx } from '../lib/cx';
import { useKitWords } from './kit-words';

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
  const { poweredBy } = useKitWords();
  if (whiteLabel) return null;
  return (
    <a className={cx('yx-powered-by', className)} href={href} target="_blank" rel="noopener noreferrer" aria-label={poweredBy.label}>
      {poweredBy.before && <span>{poweredBy.before}</span>}
      <Logo size="sm" />
      {poweredBy.after && <span>{poweredBy.after}</span>}
    </a>
  );
}

export interface TenantLogoProps {
  /** The company's logo (a signed image address); without one, the company name shows in text. */
  src?: string | null;
  /** The company name: the image's alt text, and the text when there is no logo. */
  name: string;
  /** Height cap: sm 24 px (portal headers), md 40 px (the careers banner). Width follows the image, capped too. */
  size?: 'sm' | 'md';
  className?: string;
}

/** Careers answer 357: a company's own logo on its candidate pages, size-capped, with the name as alt text and fallback. */
export function TenantLogo({ src, name, size = 'sm', className }: TenantLogoProps) {
  if (!src) return <span className={cx('yx-tenant-logo', 'yx-tenant-logo--text', className)} data-size={size}>{name}</span>;
  return <img className={cx('yx-tenant-logo', className)} data-size={size} src={src} alt={`${name} logo`} loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}
