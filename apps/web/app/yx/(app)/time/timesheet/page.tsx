'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TimesheetScreen, type MyProject, type NotSentWeek, type MyTimesheet, type PrefillSuggestions, type PrefillTools, type TimeSummaryWeek } from '@yukthix/ui/time';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';
import { useMyLeaveLive } from '../../../../../lib/yx-my-leave';

// Me › Timesheet (§B7, TIM-15): the person's own weeks, submitted to the project manager through P03.
export default function YxTimesheetPage() {
  const today = todayIndia();
  const [week, setWeek] = useState(mondayOf(today));
  const sheet = useTime<MyTimesheet>(`/me/timesheet?week=${week}`);
  // Batch D A3: last week's sheet while this week is shown, for "Copy last week".
  const thisWeek = mondayOf(today);
  const lastWeek = useTime<MyTimesheet>(week === thisWeek ? `/me/timesheet?week=${mondayOf(new Date(Date.parse(`${thisWeek}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10))}` : null);
  // Keka ideas: the Time summary of a year (my own weeks).
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const summary = useTime<{ year: number; years: number[]; weeks: TimeSummaryWeek[] }>(`/me/timesheet/summary?year=${year}`);
  // Batch D A5: my past weeks not sent (12 weeks; Show older: a year).
  const [notSentWeeks, setNotSentWeeks] = useState(12);
  const notSent = useTime<{ weeks: NotSentWeek[] }>(`/me/timesheet/not-sent?weeks=${notSentWeeks}`);
  // T2-D 55: my projects with my hours.
  const myProjects = useTime<MyProject[]>('/me/timesheet/projects');
  const write = useTimeWrite();
  // Batch D A8: Request leave opens My leave's drawer here, so unsaved hours stay on the grid.
  const leave = useMyLeaveLive();
  const queryClient = useQueryClient();
  // Connecting a tool refreshes only the tools and suggestions, so unsaved hours on the grid stay.
  const tool = async (path: string) => {
    await write(path, 'POST', undefined, false);
    await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'time' && String(q.queryKey[1]).startsWith('/tools') });
  };
  // TIM-43: my tools; suggestions only while they are on, a tool is connected and the week has started.
  const tools = useTime<PrefillTools>('/tools');
  const suggest = useTime<PrefillSuggestions>(tools.data?.enabled && tools.data.tools.some((t) => t.connected) && week <= today ? `/tools/suggestions?week=${week}` : null);
  return (
    <TimesheetScreen
      live={{
        state: timeState(sheet),
        onRetry: () => void sheet.refetch(),
        data: sheet.data ?? null,
        week,
        today,
        lastWeek: lastWeek.data ?? null,
        leave: { data: leave.data, live: leave },
        myProjects: { state: timeState(myProjects), data: myProjects.data ?? null, onRetry: () => void myProjects.refetch() },
        notSent: { state: timeState(notSent), data: notSent.data ?? null, onShowOlder: notSentWeeks < 52 ? () => setNotSentWeeks(52) : undefined },
        onWeek: setWeek,
        onSave: (w, lines) => write('/me/timesheet', 'PUT', { week: w, lines }),
        onSubmit: (w) => write('/me/timesheet/submit', 'POST', { week: w }, true, 'Week sent to the project manager'),
        summary: { state: timeState(summary), data: summary.data ?? null, onYear: setYear },
        onWithdraw: (sid) => write(`/me/timesheet/${encodeURIComponent(sid)}/withdraw`, 'POST', undefined, true, 'Week withdrawn; you can change it'),
        prefill: {
          tools: { state: timeState(tools), data: tools.data ?? null, onRetry: () => void tools.refetch() },
          suggestions: { state: suggest.isError ? 'error' : suggest.data ? 'ready' : 'loading', data: suggest.data ?? null, onRetry: () => void suggest.refetch() },
          onConnect: (provider) => tool(`/tools/${provider}/connect`),
          onDisconnect: (provider) => tool(`/tools/${provider}/disconnect`),
        },
      }}
    />
  );
}
