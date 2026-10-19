import type { Metadata } from 'next';

export const metadata: Metadata = { title: { absolute: 'YukthiX', template: '%s | YukthiX' } };

// YukthiX pages (P12 §7) use the YukthiX design system (packages/yx-ui), loaded in the root layout.
export default function YxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="yx-root">
      {/* No language picker on sign-in until YukthiX's own screens are translated (founder, 19 Oct 2026). */}
      {children}
    </div>
  );
}
