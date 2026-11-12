'use client';

import { useParams } from 'next/navigation';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';

// Settings › Documents & Communication (5.7 Policies) (S-7, answer 1321): the drawn page with the settings that were on Company rules, with
// "Different for" where a setting allows it. HR's settings key changes them.
const PAGES = ['5.7'];
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage');

export default function YxSettingsPage() {
  const { page } = useParams<{ page: string }>();
  return <RegistrySettingsPage slug={page} pageIds={PAGES} links={{}} canEdit={canEdit} />;
}
