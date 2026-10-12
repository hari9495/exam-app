'use client';

import { useParams, useRouter } from 'next/navigation';
import { PeerFormScreen, type PeerForm } from '@yukthix/ui/performance';
import { loadState } from '../../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';

// Answering a feedback request (PRF-07, M06 batch PM5): only the peer questions; the answer is anonymous.
export default function YxPeerFormPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/reviews/${encodeURIComponent(id)}`;
  const form = usePerf<PeerForm>(`${base}/peer-form`);
  const write = usePerfWrite();
  return (
    <PeerFormScreen
      state={loadState(form)}
      onRetry={() => void form.refetch()}
      form={form.data ?? null}
      onBack={() => router.push('/yx/performance/feedback-tasks')}
      onSave={(input, submit) => (submit ? write('POST', `${base}/entries/peer/submit`, input) : write('PUT', `${base}/entries/peer`, input))}
    />
  );
}
