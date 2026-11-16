'use client';

import { useState } from 'react';
import { AccommodationQueueScreen, type AccommodationView } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { loadState } from '../../../../../../lib/yx-assessments';

// Assessments AS-4b › Accommodation requests (PRC-11, answer 2011): test writers decide each item a candidate asked for;
// approved extra time becomes the invitation's. The evidence opens through a short-lived link (each opening audited).
export default function YxAccommodationsPage() {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState<'pending' | 'decided'>('pending');
  const rows = useApi<AccommodationView[]>(`/asmt/accommodations?status=${tab}`);
  const write = useApiWrite();
  return (
    <AccommodationQueueScreen
      live={{
        state: loadState(rows),
        onRetry: () => void rows.refetch(),
        tab,
        onTab: setTab,
        rows: rows.data ?? [],
        onOpenEvidence: async (id) => {
          const { url } = (await apiFetch(`/asmt/accommodations/${id}/evidence`, {}, accessToken ?? undefined)) as { url: string };
          window.open(url, '_blank', 'noopener');
        },
        onDecide: async (id, d) => void (await write('POST', `/asmt/accommodations/${id}/decide`, d)),
      }}
    />
  );
}
