'use client';

import { useState } from 'react';
import { AttendanceReportsScreen, type AttendanceReport, type NightRegister } from '@yukthix/ui/time';
import { lastMonth, timeState, useTime } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Team / HR › Attendance reports (TIM-16): late marks and early exits, and overtime, for a manager's team (by person)
// or HR's scope (by department and site); the register of women night-shift workers for HR (attendance.view).
export default function YxAttendanceReportsPage() {
  const { entity } = useScopeParams();
  const [report, setReport] = useState<'late' | 'ot' | 'night'>('late');
  const [month, setMonth] = useState(lastMonth());
  const rows = useTime<AttendanceReport>(report === 'night' ? null : withParams(`/reports/attendance?month=${month}`, entity));
  const night = useTime<NightRegister>(report === 'night' ? withParams(`/reports/night?month=${month}`, entity) : null);
  const base = { month, onMonth: setMonth, onReport: setReport };
  return report === 'night' ? (
    <AttendanceReportsScreen live={{ ...base, report, state: timeState(night), onRetry: () => void night.refetch(), data: night.data ?? null }} />
  ) : (
    <AttendanceReportsScreen live={{ ...base, report, state: timeState(rows), onRetry: () => void rows.refetch(), data: rows.data ?? null }} />
  );
}
