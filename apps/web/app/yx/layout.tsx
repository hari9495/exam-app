import type { Metadata } from 'next';
import { YxLanguageProvider } from '../../lib/yx-language';

export const metadata: Metadata = { title: { absolute: 'YukthiX', template: '%s | YukthiX' } };

// YukthiX pages (P12 §7) use the YukthiX design system (packages/yx-ui), loaded in the root layout.
export default function YxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="yx-root">
      <YxLanguageProvider>{children}</YxLanguageProvider>
    </div>
  );
}
