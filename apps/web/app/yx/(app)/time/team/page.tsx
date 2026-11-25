'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TeamLeaveCalendarScreen, type TeamCalendar } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

const plus = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// Team › Leave calendar, the TIM-20 design (YX-AT-14): a manager's team, HR's people in leave.view scope. Approving happens in
// the shared Approvals inbox (P03). Batch C item 15: the manager's own team shows attendance dots; a dot opens the day card.
export default function YxTeamLeavePage() {
  const sp = useScopeParams();
  const router = useRouter();
  // Two weeks from today; the Month tab asks for its month.
  const [range, setRange] = useState(() => ({ from: todayIndia(), to: plus(todayIndia(), 13) }));
  const cal = useTime<TeamCalendar>(withParams(`/team/calendar?from=${range.from}&to=${range.to}`, sp.entity));
  return (
    <TeamLeaveCalendarScreen
      live={{ state: timeState(cal), onRetry: () => void cal.refetch(), data: cal.data ?? null, onRange: (from, to) => setRange({ from, to }), approvalsHref: '/yx/approvals', onNavigate: (href) => router.push(href), onOpenDay: (person, on) => router.push(`/yx/time/team/day?person=${encodeURIComponent(person)}&on=${on}`) }}
    />
  );
}
