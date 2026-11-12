'use client';

import { useParams } from 'next/navigation';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';

// Settings › Billing & Account (8.6 Analytics, status & tips) (S-7, answer 1321): the drawn page with the settings that were on Company rules, with
// "Different for" where a setting allows it. HR's settings key changes them.
const PAGES = ['8.6'];
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage');

export default function YxSettingsPage() {
  const { page } = useParams<{ page: string }>();
  return <RegistrySettingsPage slug={page} pageIds={PAGES} links={{}} canEdit={canEdit} />;
}
