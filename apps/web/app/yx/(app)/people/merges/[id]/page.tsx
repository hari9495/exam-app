'use client';

import { useParams } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { MergeReview, type MergeRecordView } from '@yukthix/ui/frame';
import { usePeople, usePeopleWrite } from '../../../../../../lib/yx-people';

const enc = encodeURIComponent;

// People › a merge of two records (PPL-37): what it moved, and Unmerge (every moved row goes back, with an audit note).
export default function YxMergeRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const data = usePeople<MergeRecordView>(`/merges/${enc(id)}`);
  const write = usePeopleWrite();
  return (
    <MergeReview
      liveUnmerge={{
        state: data.isError ? 'error' : data.data ? 'ready' : 'loading',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onUnmerge: async (note) => {
          await write('POST', `/merges/${enc(id)}/unmerge`, { note });
          toast({ tone: 'success', title: `${data.data!.merged.name}'s record is split from ${data.data!.kept.name}'s again` });
        },
      }}
    />
  );
}
