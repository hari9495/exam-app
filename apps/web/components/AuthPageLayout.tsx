import { ReactNode } from 'react';
import { Check } from 'lucide-react';

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
      <div className="flex flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            {logoUrl ? (
              <div className="flex items-center gap-1.5">
                <img src={logoUrl} alt="Organization logo" className="max-h-20 object-contain" />
                {logoLabel && (
                  <p className="text-center text-2xl font-bold tracking-tight text-recruiter-text">{logoLabel}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Prudent Hire" className="h-11 w-11 object-contain" />
                <p className="text-2xl font-bold tracking-tight text-recruiter-text">Prudent Hire</p>
              </div>
            )}
          </div>

          <div className="rounded-md border border-recruiter-border bg-white p-6 shadow-sm">
            <h1 className="mb-6 text-center text-base font-bold text-recruiter-text">{title}</h1>
            {children}
          </div>

          <p className="mt-8 text-center text-xs text-recruiter-text-tertiary">
            © {new Date().getFullYear()} Prudent Consulting. All rights reserved.
          </p>
        </div>
      </div>

      <aside className="hidden flex-col justify-center gap-6 bg-recruiter-bg-subtle px-16 py-12 md:flex">
        <h2 className="text-4xl font-bold leading-tight tracking-tight text-recruiter-text">{panelHeading}</h2>
        <p className="max-w-md text-lg leading-relaxed text-recruiter-text-secondary">{panelCopy}</p>
        <ul className="flex max-w-md flex-col gap-3">
          {panelHighlights.map((item) => (
            <li key={item} className="flex items-start gap-3 text-base text-recruiter-text-secondary">
              <Check size={18} className="mt-1 shrink-0 text-primary" />
              {item}
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
