'use client';

import { useState } from 'react';
import { StandbyScreen, type StandbyCallOut, type StandbyData } from '@yukthix/ui/time';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Roster › Standby and call-outs (TIM-38): the designed StandbyScreen. The API checks the reach (a manager's own team, or
// roster.manage in scope), the slot and call-out rules, and the roster rules before a shift moves.
export default function YxStandbyPage() {
  const [week, setWeek] = useState(mondayOf(todayIndia()));
  const q = useTime<StandbyData>(`/standby?week=${week}`);
  const write = useTimeWrite();
  return (
    <StandbyScreen
      live={{
        state: timeState(q),
        data: q.data ?? null,
        onRetry: () => void q.refetch(),
        week,
        onWeek: setWeek,
        onSlot: (input) => write('/standby/slots', 'POST', input),
        onCancelSlot: (id) => write(`/standby/slots/${id}/cancel`, 'POST'),
        onCallOut: (input) => write<StandbyCallOut>('/standby/call-outs', 'POST', input),
        onMove: (input) => write('/standby/move', 'POST', input),
      }}
    />
  );
}
