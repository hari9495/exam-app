import { ReactNode } from 'react';
import Link from 'next/link';
import { PrudentMark } from './PrudentMark';
import './invigilator.css';

interface AuthPageLayoutProps {
  /** Card heading, e.g. "Forgot Password". */
  title: string;
  /** Small uppercase kicker above the title. Optional. */
  eyebrow?: string;
  /** Card body: the form and its states. */
  children: ReactNode;
  /** Org logo, when the page knows which org it is for. Falls back to the platform mark. */
  logoUrl?: string | null;
  /** Org name, shown next to the org logo once branding is detected. */
  logoLabel?: string | null;
  /** Org primary, so the submit action matches the org's colour like the login page does.
   *  Defaults (via the CSS var fallback) to Prudent's Science Blue. */
  primaryColor?: string | null;
  onPrimaryColor?: string | null;
  panelHeading: string;
  panelCopy: string;
  panelHighlights: string[];
}

/**
 * The signed-out page shell, in the Invigilator design: a greyscale slate form side with colour
 * rationed to the primary action, and Prudent's navy marketing panel on the right. Shared by
 * forgot-password, reset-password, get-started and the walk-in registration page so every front
 * door of the product matches the login page. The login page keeps its own inline copy because it
 * carries SSO detection the others don't.
 *
 * The panel is md-and-up only -- walk-in registrations arrive by QR scan on a phone, where the
 * form is the whole job. Styling lives in the shared invigilator.css (scoped under .inv).
 */
export function AuthPageLayout({
  title,
  eyebrow,
  children,
  logoUrl,
  logoLabel,
  primaryColor,
  onPrimaryColor,
  panelHeading,
  panelCopy,
  panelHighlights,
}: AuthPageLayoutProps) {
  return (
    <div
      className="inv flex min-h-screen flex-col"
      style={{
        ['--org-primary' as string]: primaryColor || '#0053e2',
        ['--org-on-primary' as string]: onPrimaryColor || '#ffffff',
      }}
    >
      <header className="inv-header flex items-center px-6 py-4 md:px-16">
        <Link href="/" className="flex items-center gap-2.5" style={{ color: 'var(--ink)' }}>
          <PrudentMark className="h-7 aspect-[100/148]" />
          <span className="inv-wordmark text-lg">Prudent Hire</span>
        </Link>
      </header>

      <main className="grid flex-1 md:grid-cols-2">
        <div className="flex flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            {logoUrl && (
              <div className="mb-8 flex items-center justify-center gap-0">
                <img src={logoUrl} alt="Organization logo" className="max-h-16 object-contain" />
                {logoLabel && <p className="inv-wordmark -ml-4 text-xl">{logoLabel}</p>}
              </div>
            )}

            <div className="inv-card p-7">
              {eyebrow && <div className="inv-eyebrow mb-1.5">{eyebrow}</div>}
              <h1 className="inv-title mb-6">{title}</h1>
              {children}
            </div>

            <p className="inv-eyebrow mt-6 text-center" style={{ letterSpacing: '0.06em' }}>
              &copy; 2026 Prudent Consulting
            </p>
          </div>
        </div>

        <aside className="inv-aside hidden flex-col justify-center gap-7 px-16 py-12 md:flex">
          <PrudentMark className="inv-watermark-mark" />
          <div>
            <div className="inv-eyebrow mb-3">Assessment platform</div>
            <h2 className="inv-headline max-w-md">{panelHeading}</h2>
          </div>
          <p className="inv-sub max-w-md">{panelCopy}</p>
          <ul className="flex max-w-md flex-col gap-3.5">
            {panelHighlights.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="inv-marker" aria-hidden="true" />
                <span className="inv-proof">{item}</span>
              </li>
            ))}
          </ul>
          <div className="inv-record mt-2">REC &middot; proctored &middot; integrity-scored &middot; panel-ready</div>
        </aside>
      </main>
    </div>
  );
}
