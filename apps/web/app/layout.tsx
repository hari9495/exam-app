import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from '../components/ui';
import { SuperAdminActingBanner } from '../components/SuperAdminActingBanner';

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
