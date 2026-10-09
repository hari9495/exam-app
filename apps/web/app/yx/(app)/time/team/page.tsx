'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TeamLeaveScreen, type TeamCalendar } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime } from '../../../../../lib/yx-time';

const plus = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// Team › Leave calendar (TIM-20, YX-AT-14): a manager's team, HR's people in leave.view scope. Approving happens in
// the shared Approvals inbox (P03).
export default function YxTeamLeavePage() {
  const router = useRouter();
  const [from, setFrom] = useState(todayIndia());
  const cal = useTime<TeamCalendar>(`/team/calendar?from=${from}&to=${plus(from, 27)}`);
  return <TeamLeaveScreen state={timeState(cal)} onRetry={() => void cal.refetch()} data={cal.data ?? null} onRange={setFrom} approvalsHref="/yx/approvals" onNavigate={(href) => router.push(href)} />;
}
