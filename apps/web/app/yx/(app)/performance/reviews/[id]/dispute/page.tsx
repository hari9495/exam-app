'use client';

import { useParams } from 'next/navigation';
import { DisputeRaiseScreen, type ApprovalStep, PerfNoAccessScreen } from '@yukthix/ui/performance';
import { loadState } from '../../../../../../../lib/yx-org';
import { usePerf, usePerfUpload, usePerfWrite, refused } from '../../../../../../../lib/yx-performance';

interface Mine {
  cycle: string;
  score: number | null;
  band: string | null;
  disagreement: { raisedOn: string; answeredOn: string | null } | null;
  escalateBy: string | null;
  why: string | null;
  dispute: { id: string; ref: string; status: 'raised' | 'resolved'; decision: string | null; decisionNote: string | null; files: { id: string; name: string }[] } | null;
  steps: (Omit<ApprovalStep, 'at'> & { at?: string })[];
}
const day = (s: string) => new Date(`${s}T00:00:00`);

// PRF-15 my escalation of a released review (performance builder 3): once HR has answered my disagreement, within the
// company's window; attachments go through the file pipeline. Only the person themself reaches it (the API answers 404).
export default function YxDisputeRaisePage() {
  const { id } = useParams<{ id: string }>();
  const at = `/reviews/${encodeURIComponent(id)}/dispute`;
  const mine = usePerf<Mine>(at);
  const write = usePerfWrite();
  const upload = usePerfUpload();
  const state = loadState(mine);
  const x = mine.data;
  if (refused(mine)) return <PerfNoAccessScreen title="Escalate a rating dispute" what="this review" grantedBy="HR" active="Reviews & cycles" persona="emp" />;
  return (
    <DisputeRaiseScreen
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void mine.refetch(),
        cycle: x?.cycle ?? '',
        score: x?.score ?? null,
        band: x?.band ?? null,
        disagreement: x?.disagreement ? { raisedOn: day(x.disagreement.raisedOn), answeredOn: x.disagreement.answeredOn ? day(x.disagreement.answeredOn) : null } : null,
        escalateBy: x?.escalateBy ? day(x.escalateBy) : null,
        why: x?.why ?? null,
        dispute: x?.dispute ?? null,
        steps: (x?.steps ?? []).map((s) => ({ ...s, at: s.at ? new Date(s.at) : undefined })),
        onRaise: async (input) => void (await write('POST', at, input)),
        onUpload: async (file) => {
          // The escalation is made first; its id comes back with the page's data.
          const now = await mine.refetch();
          const did = now.data?.dispute?.id;
          if (!did) throw new Error('Escalate first, then add attachments.');
          await upload(`/disputes/${encodeURIComponent(did)}/files`, file);
        },
      }}
    />
  );
}
