'use client';

import { useState } from 'react';
import { MyTimesheetScreen, type MyTimesheet } from '@yukthix/ui/time';
import { mondayOf, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Me › Timesheet (§B7): the person's own weeks, submitted to the project manager through P03.
export default function YxTimesheetPage() {
  const today = todayIndia();
  const [week, setWeek] = useState(mondayOf(today));
  const sheet = useTime<MyTimesheet>(`/me/timesheet?week=${week}`);
  const write = useTimeWrite();
  return (
    <MyTimesheetScreen
      state={timeState(sheet)}
      onRetry={() => void sheet.refetch()}
      data={sheet.data ?? null}
      week={week}
      today={today}
      onWeek={setWeek}
      onSave={(w, lines) => write('/me/timesheet', 'PUT', { week: w, lines })}
      onSubmit={(w) => write('/me/timesheet/submit', 'POST', { week: w })}
      onWithdraw={(sid) => write(`/me/timesheet/${encodeURIComponent(sid)}/withdraw`)}
    />
  );
}
