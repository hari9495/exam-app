'use client';

import { useParams, useRouter } from 'next/navigation';
import { OneOnOneScreen, type OneOnOne } from '@yukthix/ui/performance';
import { loadState } from '../../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';

// One 1:1 (PRF-05, M06 batch PM3): agenda, shared notes, my private note (only mine), action items.
export default function YxOneOnOnePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/one-on-ones/${encodeURIComponent(id)}`;
  const m = usePerf<OneOnOne>(base);
  const write = usePerfWrite();
  return (
    <OneOnOneScreen
      state={loadState(m)}
      onRetry={() => void m.refetch()}
      meeting={m.data ?? null}
      onBack={() => router.push('/yx/performance/one-on-ones')}
      onUpdate={(input) => write('PUT', base, input)}
      onAgenda={(text) => write('POST', `${base}/agenda`, { text })}
      onAgendaDone={(itemId, done) => write('PUT', `${base}/agenda/${encodeURIComponent(itemId)}`, { done })}
      onPrivateNote={(text) => write('PUT', `${base}/private-note`, { text })}
      onAction={(input) => write('POST', `${base}/actions`, input)}
      onActionDone={(actionId, done) => write('PUT', `${base}/actions/${encodeURIComponent(actionId)}`, { done })}
    />
  );
}
