'use client';

import { MyPayBandScreen, type MyPayBand } from '@yukthix/ui/performance';
import { loadState } from '../../../../../lib/yx-org';
import { usePerf } from '../../../../../lib/yx-performance';

// My pay band (PAY-39, M06 batch PM7): my grade's range and where I sit; shown only when the company turns it on.
export default function YxMyPayBandPage() {
  const band = usePerf<MyPayBand>('/me/pay-band');
  return <MyPayBandScreen state={loadState(band)} onRetry={() => void band.refetch()} band={band.data ?? null} />;
}
