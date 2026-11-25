'use client';

import { useRouter } from 'next/navigation';
import { IncidentComposerScreen, type CurrentMaintenance, type MaintenanceRow, type MaintenanceSettingRow } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../lib/yx-console';

interface Overview {
  now: string;
  current: CurrentMaintenance | null;
  windows: MaintenanceRow[];
  settings: { numbers: MaintenanceSettingRow[]; blockDates: number[] };
}

// Console › Planned maintenance (C-5, answers 948 and 1053): the designed YX-10 screen's maintenance part. Staff schedule
// a window, another staff member approves it, and every company sees the banner before and during it (never a sign-in
// block). The rules are platform settings with defaults.
export default function ConsoleMaintenancePage() {
  const router = useRouter();
  const data = useConsole<Overview>('/maintenance');
  const write = useConsoleWrite();
  const can = useConsoleKeys();
  const now = data.data ? new Date(data.data.now) : new Date();
  return (
    <IncidentComposerScreen
      incidents={[]}
      me=""
      now={now}
      live={{
        state: loadState(data),
        // Staff roles (answer 1058): Customer success sees the windows; a Security lead schedules them.
        canManage: can('platform.maintenance.manage'),
        onRetry: () => void data.refetch(),
        now,
        windows: data.data?.windows ?? [],
        settings: data.data?.settings ?? { numbers: [], blockDates: [] },
        current: data.data?.current ?? null,
        onSchedule: (input) => write('/maintenance', 'POST', input),
        onApprove: (id, version) => write(`/maintenance/${encodeURIComponent(id)}/approve`, 'POST', { version }),
        onCancel: (id, version, reason) => write(`/maintenance/${encodeURIComponent(id)}/cancel`, 'POST', { version, reason }),
        // Answer 1183: the rules change only on Console › Platform settings (security key and a reason).
        onOpenPlatformSettings: can('platform.settings.manage') ? () => router.push('/staff/platform-settings') : undefined,
      }}
    />
  );
}
