'use client';

import { useState } from 'react';
import { TimesheetScreen, type MyTimesheet } from '@yukthix/ui/time';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Me › My timesheet (TIM-15, the designed screen): the person's own week (no key; the API reads only their record);
// submitted to the project managers through P03.
export default function YxTimesheetPage() {
  const today = todayIndia();
  const [week, setWeek] = useState(mondayOf(today));
  const sheet = useTime<MyTimesheet>(`/me/timesheet?week=${week}`);
  const write = useTimeWrite();
  return (
    <TimesheetScreen
      live={{
        state: timeState(sheet),
        onRetry: () => void sheet.refetch(),
        data: sheet.data ?? null,
        week: mondayOf(today),
        today,
        onWeek: setWeek,
        onSave: (w, lines) => write('/me/timesheet', 'PUT', { week: w, lines }),
        onSubmit: (w) => write('/me/timesheet/submit', 'POST', { week: w }),
        onWithdraw: (tid) => write(`/me/timesheet/${encodeURIComponent(tid)}/withdraw`),
      }}
    />
  );
}
