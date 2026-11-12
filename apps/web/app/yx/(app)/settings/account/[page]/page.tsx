'use client';

import { useParams } from 'next/navigation';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';
import { ACCOUNT_PAGES, AccountSettingsPage } from '../../../../../../lib/yx-account-pages';

// Settings › Billing & Account. 8.1 Plan & add-ons, 8.2 Usage & caps and 8.3 Invoices & payment (read-only) and 8.5
// Data export & closure (S-9, answers 1328 and 1332); 8.6 Analytics, status & tips (S-7, answer 1321) is the drawn page
// with its registry settings, which HR's settings key changes.
const PAGES = ['8.6'];
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage');

export default function YxSettingsPage() {
  const { page } = useParams<{ page: string }>();
  const id = ACCOUNT_PAGES[page];
  if (id) return <AccountSettingsPage id={id} />;
  return <RegistrySettingsPage slug={page} pageIds={PAGES} links={{}} canEdit={canEdit} />;
}
