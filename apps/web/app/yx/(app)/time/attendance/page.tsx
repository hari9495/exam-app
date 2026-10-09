'use client';

import { useState } from 'react';
import { MyAttendanceScreen, type MyAttendance, type PunchResult } from '@yukthix/ui/time';
import { browserLocation, timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';

// Me › Attendance (TIM-07 / TIM-12 on the web): no permission key; punches and fixes are the person's own. The
// location is read only when they press Check in or Check out, and only to send with that punch.
export default function YxMyAttendancePage() {
  const [month, setMonth] = useState(todayIndia().slice(0, 7));
  const att = useTime<MyAttendance>(`/me/attendance?month=${month}`);
  const write = useTimeWrite();
  return (
    <MyAttendanceScreen
      state={timeState(att)}
      onRetry={() => void att.refetch()}
      data={att.data ?? null}
      month={month}
      onMonth={setMonth}
      getLocation={browserLocation}
      onPunch={(kind, pin) => write<PunchResult>('/me/punch', 'POST', { kind, ...(pin ?? {}) })}
      onFix={(input) => write('/me/regularise', 'POST', input)}
      onWithdrawFix={(rid) => write(`/me/regularise/${encodeURIComponent(rid)}/withdraw`)}
    />
  );
}
