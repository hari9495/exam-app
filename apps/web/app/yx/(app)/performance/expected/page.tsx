'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ExpectationsScreen, type Expectations } from '@yukthix/ui/performance';
import { loadState } from '../../../../../lib/yx-org';
import { usePerf } from '../../../../../lib/yx-performance';

// Performance › What is expected of me (T2-C item 68, answer 2842): read-only competencies for the person's job and the
// company's values. ?employee=<id> opens a report's page for their manager chain (the API decides; 404 otherwise).
export default function YxExpectationsPage() {
  const router = useRouter();
  const employee = useSearchParams().get('employee');
  const data = usePerf<Expectations>(employee ? `/expectations?employeeId=${encodeURIComponent(employee)}` : '/expectations');
  return (
    <ExpectationsScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      onPerson={(id) => router.push(id ? `/yx/performance/expected?employee=${encodeURIComponent(id)}` : '/yx/performance/expected')}
    />
  );
}
