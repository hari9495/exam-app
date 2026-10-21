'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ScheduledChangesScreen } from '@yukthix/ui/frame';
import { ChangeReview, ReasonDialog, type ChangeRecord, type Impact, type PersonOption } from '@yukthix/ui/history';
import { todayIst, useYxPermissions, loadState } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { CHANGE_LABEL, scheduledRows } from '../../../../../lib/yx-changes';

const id = encodeURIComponent;
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const dateText = (iso: string) => day(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// People › Scheduled changes (PPL-05, design audit step 3; P06 §4.3, Q7): changes waiting for approval or scheduled for a
// future date. Moving a date sends it back for approval; cancelling keeps it on the timeline. The API checks every call.
export default function YxScheduledChangesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const today = todayIst();
  const canManage = perms.has('employee.change.manage');
  const canApprove = perms.has('employee.change.approve');
  const rows = usePeople<ChangeRecord[]>('/changes');
  const people = usePeople<PersonOption[]>(canManage ? '/employees' : null);
  const write = usePeopleWrite();
  const [moving, setMoving] = useState<ChangeRecord | null>(null);
  const [reviewing, setReviewing] = useState<ChangeRecord | null>(null);
  const [rejecting, setRejecting] = useState<ChangeRecord | null>(null);
  const all = rows.data ?? [];
  const find = (changeId: string) => all.find((r) => r.id === changeId)!;
  const what = (r: ChangeRecord) => `${CHANGE_LABEL[r.changeType].toLowerCase()} for ${r.employeeName ?? 'the employee'}`;
  const shown = scheduledRows(all, people.data ?? [], today);
  return (
    <ScheduledChangesScreen
      rows={shown}
      today={day(today)}
      // Pay amounts come only to people with pay access (the API decides); they stay hidden until "Show pay".
      canSeePay={shown.some((r) => r.pay)}
      live={{
        state: loadState(rows),
        onRetry: () => void rows.refetch(),
        ...(canManage ? { onEdit: (changeId: string) => setMoving(find(changeId)), onStart: () => router.push('/yx/people/changes') } : {}),
        ...(canApprove ? { onReview: (changeId: string) => setReviewing(find(changeId)) } : {}),
        onOpen: (changeId) => router.push(`/yx/people/directory/${id(find(changeId).employeeId)}`),
        ...(canManage
          ? {
              onCancel: async (changeId: string, reason: string) => {
                const r = find(changeId);
                await write('POST', `/changes/${id(changeId)}/cancel`, { reason, confirmRebase: true });
                toast({ tone: 'success', title: `The ${what(r)} was cancelled` });
              },
            }
          : {}),
        children: (
          <>
            {moving && (
              <ReasonDialog
                ask={{ kind: 'reschedule', row: moving }}
                act={async (_reason, date) => {
                  await write('PUT', `/changes/${id(moving.id)}`, { effectiveDate: date });
                  toast({ tone: 'success', title: `The ${what(moving)} moved to ${dateText(date!)}`, description: 'It goes back for approval.' });
                }}
                onDone={() => setMoving(null)}
                onClose={() => setMoving(null)}
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
