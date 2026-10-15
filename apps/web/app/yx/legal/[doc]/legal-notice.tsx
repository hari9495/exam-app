'use client';

import { LegalNoticeScreen, type LegalDoc } from '@yukthix/ui/auth';
import components from '../../../../lib/open-source-notices.json';

// The privacy / grievance contact is YukthiX's to publish (APX-G G-23); until it is set the page says so.
const CONTACT = process.env.NEXT_PUBLIC_YX_PRIVACY_EMAIL || null;

export function LegalNotice({ doc }: { doc: LegalDoc }) {
  return <LegalNoticeScreen doc={doc} contactEmail={CONTACT} components={doc === 'openSource' ? components : undefined} />;
}
