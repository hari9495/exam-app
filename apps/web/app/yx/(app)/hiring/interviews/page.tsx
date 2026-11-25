'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InterviewCalendarScreen, type InterviewRangeRow, type LiveInterviewCalendar, type MyInterviewRow } from '@yukthix/ui/hiring';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { useHiring } from '../../../../../lib/yx-hiring';

const DAY = 86_400_000;
/** The API refuses more than 62 days; load a month either side of the date the calendar shows. */
const range = (at: Date) => ({ from: new Date(at.getTime() - 31 * DAY).toISOString(), to: new Date(at.getTime() + 31 * DAY).toISOString() });

// Hiring › Interviews (HIR-06): the designed InterviewCalendarScreen with `live`. Recruiters (pipeline:manage) see the
// company's week; everyone else their own interviews (and their jobs' as hiring manager) with the scorecards they owe.
// Times are India time. A calendar entry or a scorecard line opens HIR-07.
export default function YxInterviewsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const [at, setAt] = useState(() => new Date());
  const r = range(at);
  const events = useHiring<InterviewRangeRow[]>(`/interviews?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);
  const mine = useHiring<MyInterviewRow[]>('/interviews/mine');
  const failed = events.error ?? mine.error;
  const status = (failed as { status?: number } | null)?.status;
  const state: LiveInterviewCalendar['state'] = failed ? (status === 403 ? 'denied' : 'error') : events.data && mine.data ? 'ready' : 'loading';
  return (
    <InterviewCalendarScreen
      live={{
        state,
        onRetry: () => void Promise.all([events.refetch(), mine.refetch()]),
        persona: perms.has('pipeline:manage') ? 'recruiter' : 'interviewer',
        now: new Date(),
        events: events.data ?? [],
        mine: mine.data ?? [],
        // The calendar's date is an India wall-clock date; noon keeps it inside that day in any zone.
        onDate: (d) => {
          const noon = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 6, 30));
          if (Math.abs(noon.getTime() - at.getTime()) > 21 * DAY) setAt(noon);
        },
        onOpen: (id) => router.push(`/yx/hiring/interviews/${encodeURIComponent(id)}`),
        // HIR-27: recruiting plans bulk interview days.
        onInterviewDays: perms.has('pipeline:manage') ? () => router.push('/yx/hiring/interview-days') : undefined,
      }}
    />
  );
}
