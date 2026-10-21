'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner, useToast } from '@yukthix/ui';
import { MergeReview, type MergeSide } from '@yukthix/ui/frame';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';

const id = encodeURIComponent;

// People › Merge two records (PPL-37): company-wide HR picks each field, every role of record B moves to record A,
// nothing is deleted and the merge can be undone (People › Merges). The API checks the key and both records.
function Merge() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const keep = params.get('keep') ?? '';
  const merge = params.get('merge') ?? '';
  const data = usePeople<{ a: MergeSide; b: MergeSide; blocked: string | null }>(keep && merge ? `/merges/compare?keep=${id(keep)}&merge=${id(merge)}` : null);
  const write = usePeopleWrite();
  return (
    <MergeReview
      live={{
        state: data.isError ? 'error' : data.data ? 'ready' : 'loading',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onCancel: () => router.back(),
        onMerge: async (input) => {
          const out = await write<{ id: string }>('POST', '/merges', { keepPersonId: keep, mergePersonId: merge, ...input });
          toast({ tone: 'success', title: `${data.data!.b.name}'s record is merged into ${data.data!.a.name}'s`, description: 'You can undo it from this page.' });
          router.push(`/yx/people/merges/${id(out.id)}`);
        },
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
