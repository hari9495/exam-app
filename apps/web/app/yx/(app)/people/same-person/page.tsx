'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { SamePersonQueue, type SamePersonRow } from '@yukthix/ui/frame';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';

// People › More › Possible same person (PPL-36): records that may be one human, the evidence side by side, and HR's
// decision (company-wide employee.change.manage; the API checks).
export default function YxSamePersonPage() {
  const router = useRouter();
  const { toast } = useToast();
  const list = usePeople<{ rows: SamePersonRow[] }>('/same-person');
  const write = usePeopleWrite();
  return (
    <SamePersonQueue
      rows={[]}
      live={{
        state: list.isError ? 'error' : list.data ? 'ready' : 'loading',
        onRetry: () => void list.refetch(),
        rows: list.data?.rows ?? [],
        onNotSame: async (r) => {
          await write('POST', '/same-person/not-same', { personId: r.a.personId, intoPersonId: r.b.personId });
          toast({ tone: 'success', title: 'Marked as not the same person' });
        },
        onReviewMerge: (r) => router.push(`/yx/people/same-person/merge?a=${encodeURIComponent(r.a.personId)}&b=${encodeURIComponent(r.b.personId)}`),
      }}
    />
  );
}
