'use client';

import { useParams, useRouter } from 'next/navigation';
import { ErrorState, Spinner, useToast } from '@yukthix/ui';
import { MergeReview } from '@yukthix/ui/frame';
import { usePeople, usePeopleWrite } from '../../../../../../../lib/yx-people';

interface Merged {
  name: string;
  intoName: string;
  mergedAt: string;
  mergedBy: string | null;
  note: string | null;
  moved: string[];
  employeeLinked: boolean;
}

// People › Possible same person › a merged record (PPL-37): what unmerge puts back, and Unmerge with a note.
export default function YxMergedPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const merged = usePeople<Merged>(`/persons/${encodeURIComponent(id)}/merge`);
  const write = usePeopleWrite();
  if (merged.isError) return <ErrorState title="We couldn't load the merged record" description="It may have been unmerged already." onRetry={() => void merged.refetch()} />;
  if (!merged.data) return <Spinner label="Loading" size="md" />;
  const m = merged.data;
  return (
    <MergeReview
      mode="unmerge"
      liveUnmerge={{
        ...m,
        mergedAt: new Date(m.mergedAt),
        onUnmerge: async (note) => {
          await write('POST', `/persons/${encodeURIComponent(id)}/unmerge`, { note });
          toast({ tone: 'success', title: `${m.name} unmerged` });
          router.push('/yx/people/same-person');
        },
      }}
    />
  );
}
