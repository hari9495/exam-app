'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BulkInterviewDayScreen, InterviewDaySheet, type InterviewDayView } from '@yukthix/ui/hiring';
import { formatDate } from '@yukthix/ui';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';
import { useAuth } from '../../../../../lib/auth-context';

type DayRow = { id: string; name: string; day: string; status: string; jobTitle: string; candidates: number };
type Options = { jobs: { value: string; label: string; stages: { value: string; label: string }[] }[]; people: { value: string; label: string }[]; slotMinutes: number; today: string };

// Hiring › Interviews › Interview days (HIR-27): the designed BulkInterviewDayScreen with `live`. Recruiting (the key that
// schedules interviews) plans a day, Auto-assigns the job's candidates of one stage and sends; each candidate becomes an
// ordinary HIR-06 interview and keeps its own send result. Never while acting for someone else (the API checks both).
export default function YxInterviewDaysPage() {
  const router = useRouter();
  const params = useSearchParams();
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const canManage = perms.has('pipeline:manage') && !(impersonating || actingSuperAdmin);
  const days = useHiring<DayRow[]>('/interview-days');
  const picked = params.get('day') ?? days.data?.[0]?.id ?? null;
  const day = useHiring<InterviewDayView>(picked ? `/interview-days/${encodeURIComponent(picked)}` : null);
  const [planning, setPlanning] = useState(false);
  const options = useHiring<Options>('/interview-days/options', planning);
  const write = useHiringWrite();
  const state = loadState(days, ...(picked ? [day] : []));
  const open = (id: string) => router.push(`/yx/hiring/interview-days?day=${encodeURIComponent(id)}`);
  return (
    <>
      <BulkInterviewDayScreen
        live={{
          state: state === 'no-access' ? 'denied' : state,
          onRetry: () => void Promise.all([days.refetch(), day.refetch()]),
          days: (days.data ?? []).map((d) => ({ value: d.id, label: `${d.name} · ${formatDate(new Date(`${d.day}T00:00:00`))}` })),
          day: picked ? (day.data ?? null) : null,
          canManage,
          onPickDay: open,
          onPlan: () => setPlanning(true),
          onAssign: () => write('POST', `/interview-days/${encodeURIComponent(picked!)}/assign`),
          onSend: () => write<{ sent: number; failed: number }>('POST', `/interview-days/${encodeURIComponent(picked!)}/send`),
        }}
      />
      {planning && options.data && (
        <InterviewDaySheet
          open
          onOpenChange={(o) => !o && setPlanning(false)}
          jobs={options.data.jobs}
          people={options.data.people}
          slotMinutes={options.data.slotMinutes}
          today={new Date(`${options.data.today}T00:00:00`)}
          onCreate={async (input) => {
            const made = await write<{ id: string }>('POST', '/interview-days', input);
            open(made.id);
          }}
        />
      )}
    </>
  );
}
