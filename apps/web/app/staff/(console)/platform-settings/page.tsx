'use client';

import { PlatformSettingsScreen, type PlatformSettingRow } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../lib/yx-console';

// Console › Platform settings (answer 1125): every YukthiX-wide value; a change needs the security key (the API asks for
// it again) and a reason, checked against the setting's own range, audited before and after.
export default function ConsolePlatformSettingsPage() {
  const q = useConsole<PlatformSettingRow[]>('/settings');
  const can = useConsoleKeys();
  const write = useConsoleWrite();
  return (
    <PlatformSettingsScreen
      state={loadState(q)}
      onRetry={() => void q.refetch()}
      rows={q.data ?? []}
      canChange={can('platform.settings.manage')}
      onChange={(key, value, reason) => write(`/settings/${encodeURIComponent(key)}`, 'PUT', { value, reason })}
    />
  );
}
