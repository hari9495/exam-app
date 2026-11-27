'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import { MobileTimeTabScreen } from '@yukthix/ui/frame';
import { HomeClockCard, type MyAttendance, type MyLeave, type PunchResult } from '@yukthix/ui/time';
import { usePhoneLanding, timeTab } from '../../../../lib/yx-phone';
import { YxNavContext } from '../../../../lib/yx-shell';
import { browserLocation, timeState, todayIndia, useTime, useTimeWrite } from '../../../../lib/yx-time';

// T2-H: the phone's Time tab (the designed landing): today's attendance card with the same punch call as Home, my month's
// late marks and missing punches, leave balances, and the time pages in the person's menu. On a desk: My attendance.
export default function YxTimeTabPage() {
  const router = useRouter();
  const phone = usePhoneLanding('/yx/time/attendance');
  const { nav } = useContext(YxNavContext);
  const attendance = useTime<MyAttendance>(phone ? `/me/attendance?month=${todayIndia().slice(0, 7)}` : null);
  const leave = useTime<MyLeave>(phone ? '/me/leave' : null);
  const write = useTimeWrite();
  if (!phone) return null;
  return (
    <MobileTimeTabScreen
      live={{
        state: timeState(attendance) === 'error' && timeState(leave) === 'error' ? 'error' : attendance.isLoading ? 'loading' : 'ready',
        onRetry: () => void Promise.all([attendance.refetch(), leave.refetch()]),
        clock: attendance.data ? (
          <HomeClockCard
            data={attendance.data}
            now={new Date()}
            getLocation={browserLocation}
            onPunch={(kind, pin, opts) => write<PunchResult>('/me/punch', 'POST', { kind, ...(pin ?? {}), ...(opts?.wfh ? { wfh: true } : {}) })}
            attendanceHref="/yx/time/attendance?view=today"
            onRegularise={() => router.push('/yx/time/attendance?view=today&request=regularise')}
          />
        ) : undefined,
        ...timeTab(nav, attendance.data, leave.data),
        onNavigate: (href) => router.push(href),
      }}
    />
  );
}
