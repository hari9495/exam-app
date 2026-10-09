'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MyCalendarScreen, type CalendarItem, type TaskView } from '@yukthix/ui/desk';
import { API_BASE } from '../../../../../lib/api-client';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › My calendar (M14 SD-1.11, US-G-009): reminders, snoozes, tasks due and resolve-by times for the next
// eight weeks, my open tasks, and the private iCal link (shown once; a new link or "off" stops the old one at once).
export default function YxDeskCalendarPage() {
  const router = useRouter();
  const range = useMemo(() => {
    const from = new Date(Date.now() - 86_400_000);
    return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(new Date(from.getTime() + 57 * 86_400_000).toISOString())}`;
  }, []);
  const cal = useDesk<{ items: CalendarItem[]; feed: { createdAt: string } | null }>(`/me/calendar?${range}`);
  const tasks = useDesk<TaskView[]>('/tasks');
  const write = useDeskWrite();
  return (
    <MyCalendarScreen
      state={deskState(cal)}
      onRetry={() => void cal.refetch()}
      items={cal.data?.items ?? []}
      tasks={tasks.data ?? []}
      feed={cal.data?.feed ?? null}
      onOpenTicket={(id) => router.push(`/yx/desk/tickets/${encodeURIComponent(id)}`)}
      onNewFeed={async () => `${API_BASE}${(await write<{ path: string }>('/me/calendar-feed', 'POST')).path}`}
      onRevokeFeed={async () => {
        await write('/me/calendar-feed', 'DELETE');
      }}
    />
  );
}
