'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TeamLeaveCalendarScreen, type TeamCalendar } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Leave calendar (TIM-20, the designed screen; YX-AT-14): a manager's team, HR's people in leave.view scope. The screen
// asks for the range on screen (the weeks or the month); answering happens in the shared Approvals inbox (P03).
export default function YxTeamLeavePage() {
  const sp = useScopeParams();
  const router = useRouter();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const cal = useTime<TeamCalendar>(range ? withParams(`/team/calendar?from=${range.from}&to=${range.to}`, sp.entity) : null);
  // Keep the last range on screen while the next one loads (no blank page on Next week).
  const [last, setLast] = useState<TeamCalendar | null>(null);
  useEffect(() => {
    if (cal.data) setLast(cal.data);
  }, [cal.data]);
  return (
    <TeamLeaveCalendarScreen
      live={{
        state: cal.isError ? timeState(cal) : (cal.data ?? last) ? 'ready' : 'loading',
        onRetry: () => void cal.refetch(),
        data: cal.data ?? last,
        today: todayIndia(),
        onRange: (from, to) => setRange((r) => (r?.from === from && r.to === to ? r : { from, to })),
        onReview: () => router.push('/yx/approvals'),
      }}
    />
  );
}
