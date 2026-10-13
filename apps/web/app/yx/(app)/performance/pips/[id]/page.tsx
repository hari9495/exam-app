'use client';

import { useParams, useRouter } from 'next/navigation';
import { PipScreen, type Pip } from '@yukthix/ui/performance';
import { loadState } from '../../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';

// One improvement plan (PRF-12, M06 batch PM8): acknowledgement, check-ins, outcome, the letter and the exit link.
export default function YxPipPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/pips/${encodeURIComponent(id)}`;
  const pip = usePerf<Pip>(base);
  const write = usePerfWrite();
  const version = pip.data?.version ?? 0;
  return (
    <PipScreen
      state={loadState(pip)}
      onRetry={() => void pip.refetch()}
      pip={pip.data ?? null}
      onBack={() => router.push('/yx/performance/pips')}
      onAcknowledge={(comment) => write('POST', `${base}/acknowledge`, { comment, version })}
      onCheckin={(checkinId, note) => write('POST', `${base}/checkins`, { checkinId, note })}
      onOutcome={(input) => write('POST', `${base}/outcome`, { ...input, version })}
      onLetter={() => write('POST', `${base}/letter`)}
      onStartExit={(input) => write('POST', `${base}/start-exit`, input)}
    />
  );
}
