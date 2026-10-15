'use client';

import { useRouter } from 'next/navigation';
import { CalibrationListScreen, type CalibrationSession } from '@yukthix/ui/performance';
import { loadState } from '../../../../../lib/yx-org';
import { usePerf } from '../../../../../lib/yx-performance';

// Calibration sessions (PRF-09, M06 batch PM6): the sessions I facilitate, or every session for HR.
export default function YxCalibrationsPage() {
  const router = useRouter();
  const data = usePerf<{ sessions: CalibrationSession[] }>('/calibrations');
  return <CalibrationListScreen state={loadState(data)} onRetry={() => void data.refetch()} sessions={data.data?.sessions ?? []} onOpen={(id) => router.push(`/yx/performance/calibrations/${encodeURIComponent(id)}`)} />;
}
