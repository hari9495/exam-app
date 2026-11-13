'use client';

import { useParams } from 'next/navigation';
import { SETTINGS_GROUPS, SettingsPageScreen } from '@yukthix/ui/hiring';
import { INTEGRATION_PAGES, IntegrationSettingsPage } from '../../../../../../lib/yx-integration-pages';

// Settings › Integrations & Developers (S-10, answer 1327): 7.1 Integrations, 7.5 Calendar & chat, 7.6 AI and 7.7
// Developers on the older routes checked in the S-10 security check (the /v2 Integrations and Calendar pages retired).
export default function YxIntegrationSettingsPage() {
  const { page } = useParams<{ page: string }>();
  const id = INTEGRATION_PAGES[page];
  if (!id) return <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.1" state="no-access" />;
  return <IntegrationSettingsPage id={id} />;
}
