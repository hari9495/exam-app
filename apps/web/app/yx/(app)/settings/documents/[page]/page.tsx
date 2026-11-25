'use client';

import { useParams } from 'next/navigation';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';

// Settings › Documents & Communication: 5.7 Policies (S-7, answer 1321: the settings that were on Company rules, with
// "Different for" where a setting allows it) and 5.4 Notifications (S-8: the email switch and the digest time, with the
// link to the wording editor). HR's settings key changes them.
const PAGES = ['5.4', '5.7'];
const LINKS: Record<string, string> = { 'ntf.templates': '/yx/settings/emails' };
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage');

export default function YxSettingsPage() {
  const { page } = useParams<{ page: string }>();
  return <RegistrySettingsPage slug={page} pageIds={PAGES} links={LINKS} canEdit={canEdit} />;
}
