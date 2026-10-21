'use client';

import { useRouter } from 'next/navigation';
import { MergeList, type MergeRecordView } from '@yukthix/ui/frame';
import { usePeople } from '../../../../../lib/yx-people';

// People › Merged records (PPL-37): every merge of two records of one person, each open to undo. Company-wide HR.
export default function YxMergesPage() {
  const router = useRouter();
  const data = usePeople<MergeRecordView[]>('/merges');
  return <MergeList state={data.isError ? 'error' : data.data ? 'ready' : 'loading'} onRetry={() => void data.refetch()} rows={data.data ?? null} onOpen={(id) => router.push(`/yx/people/merges/${encodeURIComponent(id)}`)} />;
}
