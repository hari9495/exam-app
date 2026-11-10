'use client';

import { useParams, useRouter } from 'next/navigation';
import { ConvertWorkerScreen, type ConversionData } from '@yukthix/ui/desk';
import { loadState } from '../../../../../../../lib/yx-org';
import { useAuth } from '../../../../../../../lib/auth-context';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../../../lib/yx-lifecycle';

// Contract labour › Contract workers › Make employee (CLB-05, CL-7, answer 637): the designed stepper with `live`. The
// joiner flow with the contract_worker source, pre-filled from the person and the deployment; the same person record.
// The API checks the onboarding key, the joiner's place and acting for someone else.
export default function YxConvertWorkerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const q = useLife<ConversionData>(`/lifecycle/joiners/from-contract-worker/${encodeURIComponent(id)}`);
  const places = useJoinerPlaces(q.isSuccess);
  const write = useLifeWrite();
  return (
    <ConvertWorkerScreen
      // Re-mounted once the worker is loaded, so the steps start from the deployment's site.
      key={q.data ? q.data.deploymentId : 'loading'}
      live={{
        state: loadState(q),
        onRetry: () => void q.refetch(),
        data: q.data ?? null,
        places,
        canChange: Boolean(q.data?.canStart) && !impersonating && !actingSuperAdmin,
        onStart: (input) => write<{ id: string }>('POST', `/lifecycle/joiners/from-contract-worker/${encodeURIComponent(id)}`, input),
        onDone: (preboardingId) => router.push(`/yx/people/onboarding/${encodeURIComponent(preboardingId)}`),
      }}
    />
  );
}
