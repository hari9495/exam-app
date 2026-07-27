import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from '../components/ui';
import { SuperAdminActingBanner } from '../components/SuperAdminActingBanner';

// Without this the browser tab fell back to showing the raw hostname, and with
// no icon file it showed the generic globe. `template` lets an individual page
// set its own title and still carry the product name, e.g. "Settings | Prudent
// Hire"; nothing does yet, so `default` is what renders everywhere today.
//
// The favicon comes from app/icon.png, which the App Router picks up by
// filename and links automatically -- no <head> markup needed. It is the mark
// from public/logo.png cropped square to its ink bounds, because that source is
// a wide 3508x2481 banner that would be squashed illegibly into a 16px tab.
export const metadata: Metadata = {
  title: { default: 'Prudent Hire', template: '%s | Prudent Hire' },
  description: 'Automate early screens. Focus human judgment on what matters.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <ToastProvider>
            <AuthProvider>
              <SuperAdminActingBanner />
              {children}
            </AuthProvider>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
