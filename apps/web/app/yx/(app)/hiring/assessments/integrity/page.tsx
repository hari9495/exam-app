'use client';

import { useRouter } from 'next/navigation';
import { IntegrityQueueScreen, type LiveIncidentRow } from '@yukthix/ui/assessments';
import { useApi } from '../../../../../../lib/yx-hiring';
import { loadState } from '../../../../../../lib/yx-assessments';

// Assessments AS-5 › Integrity review (PRC-16): incidents the analysis opened for flagged attempts (or a reviewer opened),
// high concern first. Opening one goes to its workspace.
export default function YxIntegrityQueuePage() {
  const router = useRouter();
  const rows = useApi<LiveIncidentRow[]>('/asmt/integrity');
  return (
    <IntegrityQueueScreen
      live={{
        state: loadState(rows),
        onRetry: () => void rows.refetch(),
        rows: rows.data ?? [],
        onOpen: (id) => router.push(`/yx/hiring/assessments/integrity/${id}`),
      }}
    />
  );
}
