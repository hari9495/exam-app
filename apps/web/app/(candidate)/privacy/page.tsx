'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PrivacyCentreScreen } from '@yukthix/ui/assessments';
import { candidateApiFetch } from '../../../lib/candidate-api-client';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { useCandidateBrand } from '../../../lib/hooks/useAttempt';
import { saveBlob } from '../../../lib/yx-pay';

// AS-5 part 3 (PRC-28): the candidate's privacy centre at this company: the consents they gave, what is kept and until
// when, a copy of their data, and a request to erase their recordings and face data (done by the nightly sweep once no
// review or appeal holds them).
interface PrivacyView {
  company: string;
  consents: { what: string; test: string; at: string }[];
  recordings: { frames: number; deleteOn: string | null };
  face: { kept: boolean; deleteOn: string | null };
  held: boolean;
  request: { status: 'waiting' | 'done'; requestedAt: string; doneAt: string | null; dueOn: string } | null;
}
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

export default function CandidatePrivacyPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useCandidateAuth();
  const brand = useCandidateBrand();
  useEffect(() => {
    if (!authLoading && !accessToken) router.push('/session-ended');
  }, [authLoading, accessToken, router]);
  const queryClient = useQueryClient();
  const view = useQuery<PrivacyView>({ queryKey: ['attempt', 'privacy'], queryFn: () => candidateApiFetch('/attempt/privacy', {}, accessToken ?? undefined), enabled: Boolean(accessToken) });
  const erase = useMutation({
    mutationFn: (): Promise<PrivacyView> => candidateApiFetch('/attempt/privacy/erase', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: (v) => queryClient.setQueryData(['attempt', 'privacy'], v),
  });
  const d = view.data;
  return (
    <PrivacyCentreScreen
      live={{
        state: view.isError ? 'error' : d ? 'ready' : 'loading',
        onRetry: () => void view.refetch(),
        brand,
        company: d?.company ?? 'The company',
        consents: (d?.consents ?? []).map((c) => ({ what: c.what, test: c.test, on: day(c.at) ?? '' })),
        recordings: { frames: d?.recordings.frames ?? 0, deleteOn: day(d?.recordings.deleteOn ?? null) },
        face: { kept: d?.face.kept ?? false, deleteOn: day(d?.face.deleteOn ?? null) },
        held: d?.held ?? false,
        request: d?.request ? { status: d.request.status, requestedOn: day(d.request.requestedAt)!, doneOn: day(d.request.doneAt), dueOn: day(d.request.dueOn)! } : null,
        onErase: () => erase.mutateAsync(),
        onDownload: async () => {
          const data = await candidateApiFetch('/attempt/privacy/export', {}, accessToken ?? undefined);
          saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'my-test-data.json');
        },
      }}
    />
  );
}
