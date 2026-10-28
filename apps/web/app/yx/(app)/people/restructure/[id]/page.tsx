'use client';

import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { RestructureRecord, type ContinuityItemData, type RestructureRecordData } from '@yukthix/ui/frame';
import { loadState, todayIst, useYxPermissions } from '../../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../../lib/yx-people';

const enc = encodeURIComponent;

// People › Restructure › one restructure: approval (once, by someone other than the sender), each person's result or
// reason, and the PPL-10 continuity checklist of each person who moved between legal entities.
export default function YxRestructureRecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const data = usePeople<RestructureRecordData>(`/restructures/${enc(id)}`);
  const write = usePeopleWrite();
  const r = data.data;
  // Payroll without the change key only keeps the checklist: letters are HR's (approve/reject/cancel come back false).
  const hr = useYxPermissions().has('employee.change.manage');
  return (
    <RestructureRecord
      state={loadState(data) === 'no-access' ? 'forbidden' : data.isError ? 'error' : r ? 'ready' : 'loading'}
      onRetry={() => void data.refetch()}
      data={r ?? null}
      today={new Date(`${todayIst()}T00:00:00`)}
      onApprove={async () => {
        const out = await write<RestructureRecordData>('POST', `/restructures/${enc(id)}/approve`, {});
        toast(
          out.status === 'scheduled'
            ? { tone: 'success', title: `${out.title} approved`, description: `The people move on ${new Date(`${out.effectiveDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}.` }
            : { tone: out.failed ? 'default' : 'success', title: `${out.moved} ${out.moved === 1 ? 'person' : 'people'} moved`, ...(out.failed ? { description: `${out.failed} couldn't move; the reasons are in the list.` } : {}) },
        );
      }}
      onReject={async (reason) => {
        await write('POST', `/restructures/${enc(id)}/reject`, { reason });
        toast({ tone: 'success', title: `${r?.title ?? 'Restructure'} rejected` });
      }}
      onCancel={async (reason) => {
        await write('POST', `/restructures/${enc(id)}/cancel`, { reason });
        toast({ tone: 'success', title: `${r?.title ?? 'Restructure'} cancelled` });
      }}
      onItems={(employeeId) => write<ContinuityItemData[]>('GET', `/restructures/continuity?restructureId=${enc(id)}&employeeId=${enc(employeeId)}`)}
      onItem={async (item, done) => {
        await write('PUT', `/restructures/continuity/${enc(item.id)}`, { done, version: item.version });
        toast({ tone: 'success', title: done ? `“${item.title}” done` : `“${item.title}” reopened` });
      }}
      onLetters={hr ? (people, letterType) => router.push(`/yx/people/letters?people=${people.map(enc).join(',')}${letterType ? `&type=${enc(letterType)}` : ''}`) : undefined}
    />
  );
}
