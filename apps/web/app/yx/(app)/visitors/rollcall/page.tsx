'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RollCallScreen, type RollCallData } from '@yukthix/ui/visitors';
import { loadState } from '../../../../../lib/yx-org';
import { useOpenVisitorPdf, useVisitors } from '../../../../../lib/yx-visitors';

// Visitors › Roll-call (VIS-06, answer 612): everyone on site now at one location (visitors checked in, employees whose
// last check-in today was there), for reception, security and HR; printed as one A4 PDF. The API checks the reach.
export default function YxVisitorRollCallPage() {
  const asked = useSearchParams()?.get('locationId') ?? null;
  const [picked, setPicked] = useState<string | null>(asked);
  const data = useVisitors<RollCallData>(`/rollcall${picked ? `?locationId=${encodeURIComponent(picked)}` : ''}`);
  const openPdf = useOpenVisitorPdf();
  const locationId = picked ?? data.data?.location.id ?? null;
  return (
    <RollCallScreen
      data={{ location: { id: '', name: '' }, locations: [], at: new Date().toISOString(), visitors: [], employees: [] }}
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onLocation: setPicked,
        onPrint: () => openPdf(`/rollcall.pdf?locationId=${encodeURIComponent(locationId ?? '')}`),
      }}
    />
  );
}
