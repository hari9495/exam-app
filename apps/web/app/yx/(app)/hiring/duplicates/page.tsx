'use client';

import { useRouter } from 'next/navigation';
import { DuplicatesScreen, type DuplicatePairView } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';

// Hiring › Possible duplicates (M10 batch AT4, D10): same phone, same name and number, or a similar résumé.
export default function YxHiringDuplicatesPage() {
  const router = useRouter();
  const pairs = useHiring<DuplicatePairView[]>('/duplicates');
  const write = useHiringWrite();
  return (
    <DuplicatesScreen
      state={loadState(pairs)}
      onRetry={() => void pairs.refetch()}
      pairs={pairs.data ?? []}
      onOpen={(id) => router.push(`/yx/hiring/candidates/${encodeURIComponent(id)}`)}
      onMerge={(keptId, mergedId, choices) => write('POST', `/candidates/${keptId}/merge`, { mergedId, ...choices })}
    />
  );
}
