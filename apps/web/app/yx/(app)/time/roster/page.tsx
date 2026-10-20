'use client';

import { useState } from 'react';
import { RosterScreen, type RosterWeek } from '@yukthix/ui/time';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Roster (TIM-05, the designed screen; M02 §B2, YX-AT-07): a manager's own team (implicit) or roster.manage in scope;
// the API checks each cell.
export default function YxRosterPage() {
  const [week, setWeek] = useState(mondayOf(todayIndia()));
  const roster = useTime<RosterWeek>(`/roster?week=${week}`);
  const write = useTimeWrite();
  return (
    <RosterScreen
      live={{
        state: timeState(roster),
        onRetry: () => void roster.refetch(),
        data: roster.data ?? null,
        week,
        onWeek: setWeek,
        onCells: (cells) => write('/roster/cells', 'PUT', { cells }),
        onCopy: (fromWeek, toWeek) => write('/roster/copy', 'POST', { fromWeek, toWeek }),
        onPublish: (w) => write('/roster/publish', 'POST', { week: w }),
      }}
    />
  );
}
