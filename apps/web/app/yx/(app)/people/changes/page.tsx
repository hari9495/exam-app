'use client';

import { useState } from 'react';
import { useToast } from '@yukthix/ui';
import { ChangeActionSheet } from '@yukthix/ui/frame';
import { ChangeDrawer, ChangeReview, ReasonDialog, type ChangeRecord, type Impact, type PersonOption } from '@yukthix/ui/history';
import type { OrgChartData, TeamMember } from '@yukthix/ui/workforce';
import { todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { chartPeople, useChangeOptions, usePeople, usePeopleWrite, useRaiseChange } from '../../../../../lib/yx-people';
import { CHANGE_LABEL } from '../../../../../lib/yx-changes';

const id = encodeURIComponent;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const dateText = (iso: string) => day(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// People › Change action (PPL-04, design audit step 3; P06 §4.3): pick a person and raise a promotion, transfer,
// manager change, pay revision or correction; what waits for approval opens the review. Approving is a step-up action
// and never one's own change (YX-SEC-11). A manager with request.raise_on_behalf raises for their team; HR approves.
export default function YxChangeActionPage() {
  const { toast } = useToast();
  const perms = useYxPermissions();
  const today = todayIst();
  const canManage = perms.has('employee.change.manage');
  const canApprove = perms.has('employee.change.approve');
  const onBehalf = !canManage && perms.has('request.raise_on_behalf');
  const rows = usePeople<ChangeRecord[]>('/changes');
  const employees = usePeople<PersonOption[]>(canManage ? '/employees' : null);
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>(onBehalf ? '/team' : null);
  const chart = usePeople<OrgChartData>(onBehalf ? '/org-chart' : null);
  const everyone = chartPeople(chart.data);
  const subjects: PersonOption[] = canManage ? (employees.data ?? []) : everyone.filter((p) => (team.data?.members ?? []).some((m) => m.id === p.id && m.relation !== 'dotted'));
  const options = useChangeOptions(subjects, perms.has('employee.salary.manage'), canManage || onBehalf);
  const raise = useRaiseChange();
  const write = usePeopleWrite();
  const [starting, setStarting] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ChangeRecord | null>(null);
  const [rejecting, setRejecting] = useState<ChangeRecord | null>(null);
  const pending = (rows.data ?? []).filter((r) => r.status === 'pending').sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const what = (r: ChangeRecord) => `${CHANGE_LABEL[r.changeType].toLowerCase()} for ${r.employeeName ?? 'the employee'}`;
  return (
    <ChangeActionSheet
      persona={canManage ? 'hr' : 'mgr'}
      kind="Promotion"
      effective={day(today)}
      today={day(today)}
      live={{
        state: rows.isError ? 'error' : rows.data ? 'ready' : 'loading',
        onRetry: () => void rows.refetch(),
        people: subjects.map((p) => ({ id: p.id, name: p.name, role: p.designation ?? '', department: [p.department, p.location].filter(Boolean).join(' · ') })),
        waiting: pending.map((r) => ({ id: r.id, name: r.employeeName ?? 'Employee', kind: CHANGE_LABEL[r.changeType], effective: day(r.effectiveDate), note: `raised ${dateText(r.requestedAt)}`, canOpen: canApprove })),
        onStart: (personId) => setStarting(personId),
        onOpenWaiting: (changeId) => setReviewing(pending.find((r) => r.id === changeId) ?? null),
        children: (
          <>
            {starting && (
              <ChangeDrawer
                options={{ ...options, ...(onBehalf ? { managers: everyone, types: ['promotion', 'transfer', 'redesignation', 'manager_change'] } : {}) }}
                employeeId={starting}
                onPreview={raise.onPreview}
                onSubmit={async (input) => {
                  await raise.onSubmit(input);
                  toast({ tone: 'success', title: `${CHANGE_LABEL[input.changeType]} for ${subjects.find((s) => s.id === input.employeeId)?.name ?? 'the employee'} sent for approval` });
                }}
                onClose={() => setStarting(null)}
              />
            )}
            {reviewing && !rejecting && (
              <ChangeReview
                row={reviewing}
                onPreview={(changeId) => write<Impact>('GET', `/changes/${id(changeId)}/preview`)}
                onApprove={async (confirmRebase) => {
                  await write('POST', `/changes/${id(reviewing.id)}/approve`, { confirmRebase });
                  toast({ tone: 'success', title: `The ${what(reviewing)} was approved` });
                }}
                onReject={() => setRejecting(reviewing)}
                onClose={() => setReviewing(null)}
              />
            )}
            {rejecting && (
              <ReasonDialog
                ask={{ kind: 'reject', row: rejecting }}
                act={async (reason) => {
                  await write('POST', `/changes/${id(rejecting.id)}/reject`, { reason });
                  toast({ tone: 'success', title: `The ${what(rejecting)} was rejected` });
                }}
                onDone={() => {
                  setRejecting(null);
                  setReviewing(null);
                }}
                onClose={() => setRejecting(null)}
              />
            )}
          </>
        ),
      }}
    />
  );
}
