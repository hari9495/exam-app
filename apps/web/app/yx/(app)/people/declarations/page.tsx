'use client';

import { DisabilityDeclaration } from '@yukthix/ui/frame';
import { usePeople } from '../../../../../lib/yx-people';

interface Row {
  employeeId: string;
  name: string;
  category: string;
  percent: number;
  validUntil: string | null;
  verified: boolean;
  expiringSoon: boolean;
}

// People › Declarations (PPL-38): disability declarations for the HR diversity role (Special; each look recorded).
export default function YxDeclarationsPage() {
  const list = usePeople<{ rows: Row[] }>('/disability-declarations');
  return (
    <DisabilityDeclaration
      persona="hr"
      liveList={{
        state: list.isError ? 'error' : list.data ? 'ready' : 'loading',
        onRetry: () => void list.refetch(),
        rows: (list.data?.rows ?? []).map((r) => ({ ...r, validUntil: r.validUntil ? new Date(`${r.validUntil}T00:00:00`) : null })),
      }}
    />
  );
}
