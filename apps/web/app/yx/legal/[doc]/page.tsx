import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { LegalNotice } from './legal-notice';

// SEC-02 legal notices (the sign-in footer's links), public: no sign-in needed.
const DOCS = { privacy: 'privacy', terms: 'terms', accessibility: 'accessibility', grievance: 'grievance', 'open-source': 'openSource' } as const;
const TITLES: Record<keyof typeof DOCS, string> = { privacy: 'Privacy notice', terms: 'Terms of use', accessibility: 'Accessibility statement', grievance: 'Grievance officer', 'open-source': 'Open-source notices' };
type Slug = keyof typeof DOCS;
const isSlug = (s: string): s is Slug => Object.hasOwn(DOCS, s);

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return { title: isSlug(doc) ? TITLES[doc] : 'Not found' };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isSlug(doc)) notFound();
  return <LegalNotice doc={DOCS[doc]} />;
}
