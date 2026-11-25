'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { SamePersonQueue, type LiveSamePerson, type SamePersonRow } from '@yukthix/ui/frame';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';

// People › More › Possible same person (PPL-36): records that may be one human, the evidence side by side, and HR's
// decision (company-wide employee.change.manage; the API checks). The Merged view (PPL-37, ?view=merged) lists every
// merged record so Unmerge can be found after the day of the merge.
export default function YxSamePersonPage() {
  const router = useRouter();
  const { toast } = useToast();
  const list = usePeople<{ rows: SamePersonRow[] }>('/same-person');
  const merged = usePeople<{ rows: LiveSamePerson['merged'] }>('/same-person/merged');
  const write = usePeopleWrite();
  const view = useSearchParams().get('view') === 'merged' ? 'merged' : 'check';
  return (
    <SamePersonQueue
      rows={[]}
      view={view}
      live={{
        state: list.isError || merged.isError ? 'error' : list.data && merged.data ? 'ready' : 'loading',
        onRetry: () => void (list.refetch(), merged.refetch()),
        rows: list.data?.rows ?? [],
        merged: merged.data?.rows ?? [],
        onNotSame: async (r) => {
          await write('POST', '/same-person/not-same', { personId: r.a.personId, intoPersonId: r.b.personId });
          toast({ tone: 'success', title: 'Marked as not the same person' });
        },
        onReviewMerge: (r) => router.push(`/yx/people/same-person/merge?a=${encodeURIComponent(r.a.personId)}&b=${encodeURIComponent(r.b.personId)}`),
        onOpenMerged: (personId) => router.push(`/yx/people/same-person/merged/${encodeURIComponent(personId)}`),
      }}
    />
  );
}
