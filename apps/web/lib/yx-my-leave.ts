'use client';

import type { LeaveHistoryPage, LeavePlan, LiveLeaveHome, LongAbsenceRow, MyCompOff, MyEncashment, MyLeave, PersonOption } from '@yukthix/ui/time';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { timeState, useTime, useTimeRead, useTimeWrite } from './yx-time';

const id = encodeURIComponent;

/**
 * Me › Leave's live wiring (TIM-17 … TIM-25): used by My leave and, for "Request leave" on the week (batch D A8), by My
 * timesheet. The API reaches only the signed-in person's own leave.
 */
export function useMyLeaveLive(opts: { startApplying?: boolean; onOpenCard?: () => void } = {}): LiveLeaveHome {
  const { accessToken } = useAuth();
  const leave = useTime<MyLeave>('/me/leave');
  const compOff = useTime<MyCompOff>('/me/comp-off');
  const encash = useTime<MyEncashment>('/me/encashment');
  const absence = useTime<{ absence: LongAbsenceRow | null }>('/me/long-absence');
  const write = useTimeWrite();
  const read = useTimeRead();
  return {
    state: timeState(leave),
    onRetry: () => void leave.refetch(),
    data: leave.data ?? null,
    onPreview: (input) => write<LeavePlan>('/me/leave/preview', 'POST', input, false),
    onApply: (input) => write('/me/leave', 'POST', input, true, 'Leave sent for approval'),
    onResend: (rid, input) => write(`/me/leave/${id(rid)}/resend`, 'POST', input, true, 'Changed and sent again for approval'),
    onWithdraw: (rid) => write(`/me/leave/${id(rid)}/withdraw`, 'POST', undefined, true, 'Leave request withdrawn'),
    onCancel: (rid, reason) => write(`/me/leave/${id(rid)}/cancel`, 'POST', { reason }, true, 'Cancellation sent to your manager'),
    // Batch A D12: cancel some days (to the approver) and extend (a new linked request); the drawers say done.
    onCancelDays: (rid, x) => write(`/me/leave/${id(rid)}/cancel-days`, 'POST', x),
    onExtend: (rid, x) => write(`/me/leave/${id(rid)}/extend`, 'POST', x),
    onChooseHoliday: (hid, choose) => write(`/me/holidays/${id(hid)}/${choose ? 'choose' : 'unchoose'}`, 'POST', undefined, true, choose ? 'Optional holiday taken' : 'Optional holiday given back'),
    // Batch A item 2 (C2): my full leave history, a page at a time.
    onHistory: (q) => {
      const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize) });
      if (q.types.length) p.set('types', q.types.join(','));
      if (q.statuses.length) p.set('statuses', q.statuses.join(','));
      if (q.from) p.set('from', q.from);
      if (q.to) p.set('to', q.to);
      if (q.q) p.set('q', q.q);
      return read<LeaveHistoryPage>(`/me/leave/history?${p.toString()}`);
    },
    onFindPeople: (q) => apiFetch(`/workflow/people?q=${id(q)}`, {}, accessToken ?? undefined) as Promise<PersonOption[]>,
    startApplying: opts.startApplying,
    compOff: { data: compOff.data ?? null, onClaim: (input) => write('/me/comp-off', 'POST', input, true, 'Comp-off claim sent to your manager'), onWithdraw: (cid) => write(`/me/comp-off/${id(cid)}/withdraw`, 'POST', undefined, true, 'Comp-off claim withdrawn') },
    encash: { data: encash.data ?? null, onRequest: (input) => write('/me/encashment', 'POST', input, true, 'Encashment sent for approval'), onWithdraw: (eid) => write(`/me/encashment/${id(eid)}/withdraw`, 'POST', undefined, true, 'Encashment request withdrawn') },
    absence: { data: absence.data?.absence ?? null, onAskReturn: (aid, on, note) => write(`/me/long-absence/${id(aid)}/return-date`, 'POST', { on, note }, true, 'Sent to HR to confirm') },
    onOpenCard: opts.onOpenCard,
  };
}
