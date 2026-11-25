'use client';

import { useState } from 'react';
import { AutoRosterScreen, type AutoRosterData } from '@yukthix/ui/time';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Roster › Auto-roster (TIM-34): the designed AutoRosterScreen. The API decides the reach (a manager's own team, or
// roster.manage in scope), fills only empty days as drafts through the roster's rule guard, and publish checks again.
export default function YxAutoRosterPage() {
  const [week, setWeek] = useState(mondayOf(todayIndia()));
  const [locationId, setLocationId] = useState<string | null>(null);
  const q = useTime<AutoRosterData>(`/auto-roster?week=${week}${locationId ? `&locationId=${locationId}` : ''}`);
  const write = useTimeWrite();
  return (
    <AutoRosterScreen
      live={{
        state: timeState(q),
        data: q.data ?? null,
        week,
        onWeek: setWeek,
        onLocation: setLocationId,
        onRetry: () => void q.refetch(),
        onDemand: (id, rows) => write('/auto-roster/demand', 'PUT', { locationId: id, rows }),
        onGenerate: (id, w) => write('/auto-roster/generate', 'POST', { locationId: id, week: w }),
        onPublish: (w) => write('/roster/publish', 'POST', { week: w }),
        openShiftsHref: '/yx/time/open-shifts',
      }}
    />
  );
}
