import { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { PrudentMark } from './PrudentMark';

interface AuthPageLayoutProps {
  /** Card heading, e.g. "Staff login". */
  title: string;
  /** Card body: the form and its states. */
  children: ReactNode;
  /** Org logo, when the page knows which org it is for. Falls back to the platform mark. */
  logoUrl?: string | null;
  /** Org name, shown next to the org logo once branding is detected. */
  logoLabel?: string | null;
  panelHeading: string;
  panelCopy: string;
  panelHighlights: string[];
}

/**
 * The signed-out page shell: form card on the left, explanatory panel on the
 * right. Shared by /login and the walk-in registration page so the two front
 * doors of the product look like the same product.
 *
 * The panel is md-and-up only -- walk-in registrations arrive by QR scan on a
 * phone, where the form is the whole job.
 */
export function AuthPageLayout({
  title,
  children,
  logoUrl,
  logoLabel,
  panelHeading,
  panelCopy,
  panelHighlights,
}: AuthPageLayoutProps) {
  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col items-center justify-center bg-white px-6 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            {logoUrl ? (
              <div className="flex items-center gap-0">
                <img src={logoUrl} alt="Organization logo" className="max-h-20 object-contain" />
                {logoLabel && (
                  <p className="-ml-6 text-center text-2xl font-medium tracking-tight text-brand-navy">{logoLabel}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <PrudentMark className="h-9 aspect-[100/148] text-brand-navy" />
                <p className="text-2xl font-medium tracking-tight text-brand-navy">Prudent Hire</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#CDD8F0] bg-white p-7 shadow-[0_24px_72px_rgba(0,30,96,0.12)]">
            <h1 className="mb-6 text-center text-lg font-medium text-brand-navy">{title}</h1>
            {children}
          </div>

          <p className="mt-6 text-center text-xs text-recruiter-text-tertiary">
            &copy; {new Date().getFullYear()} Prudent Consulting. All rights reserved.
          </p>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-brand-navy px-16 py-12 md:flex md:flex-col md:items-center md:justify-center md:gap-6">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0,83,226,0.3) 0%, transparent 70%)' }}
          aria-hidden="true"
        />
        <PrudentMark className="pointer-events-none absolute bottom-6 right-6 h-48 aspect-[100/148] text-white/10" />
        <h2 className="relative max-w-md text-4xl font-medium leading-tight tracking-tight text-white">{panelHeading}</h2>
        <p className="relative max-w-md text-lg leading-relaxed text-white/60">{panelCopy}</p>
        <ul className="relative flex max-w-md flex-col gap-3">
          {panelHighlights.map((item) => (
            <li key={item} className="flex items-start gap-3 text-base text-white/70">
              <Check size={18} className="mt-1 shrink-0 text-brand-picton" />
              {item}
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
