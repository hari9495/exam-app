'use client';

import { PayBandScreen, type MyPayBand } from '@yukthix/ui/pay';
import { loadState } from '../../../../../lib/yx-org';
import { usePerf } from '../../../../../lib/yx-performance';

// My pay band (PAY-39): my grade's range and where I sit; nothing when the company turns bands off.
export default function YxMyPayBandPage() {
  const band = usePerf<MyPayBand>('/me/pay-band');
  return <PayBandScreen live={{ state: loadState(band), onRetry: () => void band.refetch(), band: band.data ?? null }} />;
}
