'use client';

import { useParams } from 'next/navigation';
import { PEOPLE_SETTINGS } from '@yukthix/ui/hiring';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';

// Settings › People & Access pages (S-4, answer 1323): 2.7 Exit & lifecycle policies and 2.10 Audit & data retention with
// the company's settings that had no screen. HR's settings key changes them (the audit log's length needs the access key
// too). Their other settings are still on Company rules and Access and privacy, linked from the page (S-7 moves them).
const PAGES = Object.keys(PEOPLE_SETTINGS);
const SCREENS: Record<string, string> = { 'company-rules': '/yx/settings/company-rules', 'access-settings': '/yx/settings/access-settings' };
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage');

export default function YxPeopleSettingsPage() {
  const { page } = useParams<{ page: string }>();
  return <RegistrySettingsPage slug={page} pageIds={PAGES} links={{}} screens={SCREENS} canEdit={canEdit} />;
}
