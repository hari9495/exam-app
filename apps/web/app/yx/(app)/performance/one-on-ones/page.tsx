'use client';

import { useRouter } from 'next/navigation';
import { OneOnOnesScreen, type Choice, type OneOnOneSummary } from '@yukthix/ui/performance';
import { loadState } from '../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

// 1:1s (PRF-05, M06 batch PM3): with my manager and my direct reports; only the two people see a 1:1.
export default function YxOneOnOnesPage() {
  const router = useRouter();
  const data = usePerf<{ meetings: OneOnOneSummary[]; partners: Choice[] }>('/one-on-ones');
  const write = usePerfWrite();
  const open = (id: string) => router.push(`/yx/performance/one-on-ones/${encodeURIComponent(id)}`);
  return (
    <OneOnOnesScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      meetings={data.data?.meetings ?? []}
      partners={data.data?.partners ?? []}
      onCreate={async (input) => open((await write<{ id: string }>('POST', '/one-on-ones', input)).id)}
      onOpen={open}
    />
  );
}
