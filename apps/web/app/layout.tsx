import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from '../components/ui';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
