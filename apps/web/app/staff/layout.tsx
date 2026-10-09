import type { Metadata } from 'next';

// The YukthiX platform staff sign-in: its own page, never linked from the company screens, kept out
// of search engines.
export const metadata: Metadata = { title: { absolute: 'YukthiX staff' }, robots: { index: false, follow: false } };

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <div className="yx-root">{children}</div>;
}
