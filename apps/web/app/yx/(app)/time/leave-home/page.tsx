'use client';

import { useRouter } from 'next/navigation';
import { LeaveHomeScreen, type ApplyForForm, type HrLeaveHome, type LeavePlan, type LeaveReport, type LongAbsenceCheck, type LongAbsenceRow } from '@yukthix/ui/time';
import { timeState, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';
import { useYxPermissions } from '../../../../../lib/yx-org';

const id = encodeURIComponent;

// HR › Leave (TIM-17 HR): requests waiting with managers, who is away, what needs HR, long absences. leave.view in
// scope; recording, extending or ending a long absence needs leave.balance.adjust (checked by the API for each person).
// Record long absence (founder decision 1) and Apply for someone (founder answer B, leave.balance.adjust) find people in
// the HR leave scope through the leave report search; the API checks each person again.
export default function YxHrLeaveHomePage() {
  const router = useRouter();
  const home = useTime<HrLeaveHome>('/hr/leave-home');
  const absences = useTime<LongAbsenceRow[]>('/hr/long-absences');
  const write = useTimeWrite();
  const read = useTimeRead();
  // The buttons show only to people who may use them (leave.balance.adjust); the API checks each person anyway.
  const adjust = useYxPermissions().has('leave.balance.adjust');
  const findPeople = async (q: string) => ((await read<LeaveReport>(`/hr/leave-report?report=balances&pageSize=10${q ? `&q=${id(q)}` : ''}`)).rows ?? []).map((r) => ({ id: r.employeeId, label: r.name, detail: [r.code, r.location].filter(Boolean).join(' · ') || null }));
  return (
    <LeaveHomeScreen
      hrLive={{
        state: timeState(home),
        onRetry: () => void home.refetch(),
        data: home.data ?? null,
        onRemind: (rid) => write(`/hr/leave-home/remind/${id(rid)}`, 'POST', undefined, false, 'Approver reminded'),
        onNavigate: (href) => router.push(href),
        hrefs: { approvals: '/yx/approvals', calendar: '/yx/time/team', negative: '/yx/time/balances', yearEnd: '/yx/time/setup/year-end', request: () => '/yx/approvals' },
        absences: {
          data: absences.data ?? null,
          onChange: (aid, how, on, note, version) => write(`/hr/long-absences/${id(aid)}/${how === 'extend' ? 'extend' : 'early-return'}`, 'POST', { on, note, version }, true, how === 'extend' ? 'Absence extended' : 'Early return recorded'),
        },
        record: adjust ? {
          onFindPeople: findPeople,
          onCheck: (q) => read<LongAbsenceCheck>(`/hr/long-absences/check?employeeId=${id(q.employeeId)}&from=${id(q.from)}&to=${id(q.to)}`),
          onRecord: (input) => write('/hr/long-absences', 'POST', input, true, 'Long absence recorded'),
        } : undefined,
        applyFor: adjust ? {
          onFindPeople: findPeople,
          onLoad: (eid) => read<ApplyForForm>(`/hr/leave/${id(eid)}`),
          onPreview: (eid, input) => write<LeavePlan>(`/hr/leave/${id(eid)}/preview`, 'POST', input, false),
          // The dialog says "done" with its own toast (it names the person).
          onApply: (eid, input) => write(`/hr/leave/${id(eid)}`, 'POST', input, true),
        } : undefined,
      }}
    />
  );
}
