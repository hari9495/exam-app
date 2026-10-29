'use client';

import { useState } from 'react';
import { RosterScreen, type OpenShiftsData, type RosterWeek, type TeamRosterWeek } from '@yukthix/ui/time';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Roster (M02 §B2, YX-AT-07), the TIM-05 design. A planner (a manager's own team, implicit, or roster.manage in scope)
// gets the planning grid with the Open shifts tab; anyone who plans no one gets the Staff view: their own published week,
// and their team's when the company turns on roster.staff_see_team. The API checks every cell and every rule again.
export default function YxRosterPage() {
  const [week, setWeek] = useState(mondayOf(todayIndia()));
  const roster = useTime<RosterWeek>(`/roster?week=${week}`);
  const planner = roster.data ? roster.data.scope !== 'team' || roster.data.people.length > 0 : null;
  const team = useTime<TeamRosterWeek>(planner === false ? `/roster/team?week=${week}` : null);
  const open = useTime<OpenShiftsData>(planner ? '/open-shifts?show=all' : null);
  const write = useTimeWrite();
  if (planner === false)
    return <RosterScreen staffLive={{ state: timeState(team), onRetry: () => void team.refetch(), data: team.data ?? null, week, onWeek: setWeek, swapHref: '/yx/time/shifts' }} />;
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
        onPublish: (w, reason) => write('/roster/publish', 'POST', { week: w, ...(reason ? { reason } : {}) }, true, 'Roster published'),
        autoRosterHref: '/yx/time/auto-roster',
        openShifts: planner
          ? {
              state: timeState(open),
              data: open.data ?? null,
              onRetry: () => void open.refetch(),
              onOffer: (input) => write('/open-shifts', 'POST', input),
              onAward: (id, employeeId, version) => write(`/open-shifts/${id}/award`, 'POST', { employeeId, version }),
              onCancel: (id, version, reason) => write(`/open-shifts/${id}/cancel`, 'POST', { version, ...(reason ? { reason } : {}) }),
            }
          : undefined,
      }}
    />
  );
}
