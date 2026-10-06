import type { Metadata } from 'next';

export const metadata: Metadata = { title: { absolute: 'YukthiX', template: '%s | YukthiX' } };

// YukthiX pages (P12 §7) use the YukthiX design system (packages/yx-ui), loaded in the root layout.
export default function YxLayout({ children }: { children: React.ReactNode }) {
  return <div className="yx-root">{children}</div>;
}
