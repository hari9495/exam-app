'use client';

import { useParams, useRouter } from 'next/navigation';
import { CalibrationBoardScreen, type CalibrationBoard } from '@yukthix/ui/performance';
import { loadState } from '../../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';

// A calibration board (PRF-09, M06 batch PM6): bands, the guide (a guide only), moves with reasons, sign-off.
export default function YxCalibrationBoardPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/calibrations/${encodeURIComponent(id)}`;
  const board = usePerf<CalibrationBoard>(base);
  const write = usePerfWrite();
  return (
    <CalibrationBoardScreen
      state={loadState(board)}
      onRetry={() => void board.refetch()}
      board={board.data ?? null}
      onBack={() => router.push('/yx/performance/calibrations')}
      onChange={(input) => write('POST', `${base}/changes`, input)}
      onSignOff={() => write('POST', `${base}/sign-off`)}
    />
  );
}
