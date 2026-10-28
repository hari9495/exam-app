'use client';

import { useState } from 'react';
import { RosterScreen, type RosterWeek } from '@yukthix/ui/time';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Roster planner (M02 §B2, YX-AT-07), the TIM-05 design: a manager's own team (implicit) or roster.manage in scope;
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
        onCopy: (fromWeek, toWeek) => write('/roster/copy', 'POST', { fromWeek, toWeek }, true, 'Last week copied as a draft'),
        onPublish: (w) => write('/roster/publish', 'POST', { week: w }, true, 'Roster published'),
      }}
    />
  );
}
