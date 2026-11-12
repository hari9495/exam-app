'use client';

import { useRouter } from 'next/navigation';
import { IncidentComposerScreen, type LiveIncidents } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../lib/yx-console';

type Overview = Pick<LiveIncidents, 'incidents' | 'containments' | 'products' | 'settings'>;

// Console › Incidents (C-8, YX-10; answer 1124): staff declare an incident and post updates a second staff member
// approves; companies with an affected product see the latest approved update in the availability banner.
export default function ConsoleIncidentsPage() {
  const router = useRouter();
  const can = useConsoleKeys();
  const data = useConsole<Overview>('/incidents');
  const write = useConsoleWrite();
  const d = data.data;
  return (
    <IncidentComposerScreen
      incidents={[]}
      me=""
      now={new Date()}
      liveIncidents={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        incidents: d?.incidents ?? [],
        containments: d?.containments ?? [],
        products: d?.products ?? [],
        settings: d?.settings ?? { leadHours: 1, leadHoursDefault: 1 },
        onOpen: (input) => write('/incidents', 'POST', input),
        onUpdate: (id, input) => write(`/incidents/${encodeURIComponent(id)}/updates`, 'POST', input),
        onReview: (id, updateId, approve, note) => write(`/incidents/${encodeURIComponent(id)}/updates/${encodeURIComponent(updateId)}/review`, 'POST', { approve, ...(note ? { note } : {}) }),
        onMarkBreach: (id, containmentId) => write(`/incidents/${encodeURIComponent(id)}/breach`, 'POST', { containmentId }),
        // Answer 1261: the lead time changes only in Console › Platform settings.
        onOpenPlatformSettings: can('platform.settings.manage') ? () => router.push('/staff/platform-settings') : undefined,
      }}
    />
  );
}
