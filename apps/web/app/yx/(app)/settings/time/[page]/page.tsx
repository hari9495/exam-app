'use client';

import { useParams } from 'next/navigation';
import { TIME_SETTINGS } from '@yukthix/ui/hiring';
import { LEAVE_SETTINGS_PAGES } from '../../../../../../lib/yx-nav';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';

// Settings › Time & Leave pages (S-2, answers 1323, 1324, 1485): the drawn page with the company's settings. HR's settings
// key changes them; HR's leave admins (leave.settings.manage) also change the leave pages (3.6, 3.8, 3.9).
const PAGES = Object.keys(TIME_SETTINGS);
const LINKS: Record<string, string> = {
  'checkin.geofence': '/yx/time/setup/locations',
  'checkin.devices': '/yx/time/setup/devices',
  'shift.editor': '/yx/time/shifts-setup',
  'roster.editor': '/yx/time/roster',
  'leave.type_editor': '/yx/time/setup',
  'leave.year_end_wizard': '/yx/time/setup/year-end',
  'holiday.calendar_editor': '/yx/time/setup/holidays',
  'holiday.feed': '/yx/time/setup/holiday-feeds',
};
const canEdit = (has: (k: string) => boolean, page: { id: string }) => has('org.settings.manage') || (has('leave.settings.manage') && LEAVE_SETTINGS_PAGES.includes(page.id));

export default function YxTimeSettingsPage() {
  const { page } = useParams<{ page: string }>();
  return <RegistrySettingsPage slug={page} pageIds={PAGES} links={LINKS} canEdit={canEdit} />;
}
