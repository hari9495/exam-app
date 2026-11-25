'use client';

import { TodayBoardScreen, type TodayBoard } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Team / HR › Today (TIM-01): a manager's team, or HR's people in attendance.view scope: who is in, late, not in, on
// leave, working from home or on duty; who is on site now (roll call). A nudge reminds someone to check in, once a day.
export default function YxTodayPage() {
  const { entity } = useScopeParams();
  const board = useTime<TodayBoard>(withParams('/today', entity));
  const write = useTimeWrite();
  return (
    <TodayBoardScreen
      live={{
        state: timeState(board),
        onRetry: () => void board.refetch(),
        data: board.data ?? null,
        onNudge: (employeeId) => write(`/people/${encodeURIComponent(employeeId)}/nudge`),
        // The field-force map is not built yet (TIM-32), so the board has no map button.
        links: { exceptions: '/yx/time/exceptions', muster: '/yx/time/muster', roster: '/yx/time/roster', fieldMap: null },
      }}
    />
  );
}
