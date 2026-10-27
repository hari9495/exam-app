'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmptyState, ErrorState, Spinner, useToast } from '@yukthix/ui';
import { MergeReview, type SamePersonRow } from '@yukthix/ui/frame';
import { usePeople, usePeopleWrite } from '../../../../../../lib/yx-people';

// People › Possible same person › Merge two records (PPL-37): HR keeps per field the value they choose, with a note.
function Merge() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const list = usePeople<{ rows: SamePersonRow[] }>('/same-person');
  const write = usePeopleWrite();
  const a = params.get('a');
  const row = list.data?.rows.find((r) => r.a.personId === a && r.b.personId === params.get('b'));
  if (list.isError) return <ErrorState title="We couldn't load the records" description="Retry in a moment." onRetry={() => void list.refetch()} />;
  if (!list.data) return <Spinner label="Loading" size="md" />;
  if (!row) return <EmptyState title="Not a proposed match any more" description="Someone may have decided it already." />;
  return (
    <MergeReview
      live={{
        row,
        onMerge: async (keep, note) => {
          await write('POST', '/same-person/merge', { personId: row.a.personId, intoPersonId: row.b.personId, keep, note });
          toast({ tone: 'success', title: `Records merged into ${row.b.name}` });
          router.push(`/yx/people/same-person/merged/${encodeURIComponent(row.a.personId)}`);
        },
        onCancel: () => router.push('/yx/people/same-person'),
      }}
    />
  );
}

export default function YxMergePage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <Merge />
    </Suspense>
  );
}
