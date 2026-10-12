'use client';

import { useState } from 'react';
import { ReviewerBlocksScreen, type ReviewerBlock } from '@yukthix/ui/performance';
import { loadState } from '../../../../../lib/yx-org';
import { usePeople } from '../../../../../lib/yx-people';
import { usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

// Reviewer blocks (§15.3, M06 batch PM5): HR who handle concerns keep a pair from reviewing each other.
export default function YxReviewerBlocksPage() {
  const blocks = usePerf<ReviewerBlock[]>('/reviewer-blocks');
  const [q, setQ] = useState('');
  const directory = usePeople<{ people: { id: string; name: string; department: { name: string | null } | null }[] }>(`/directory?limit=25${q ? `&q=${encodeURIComponent(q)}` : ''}`, { keepPrevious: true });
  const write = usePerfWrite();
  return (
    <ReviewerBlocksScreen
      state={loadState(blocks)}
      onRetry={() => void blocks.refetch()}
      blocks={blocks.data ?? []}
      people={(directory.data?.people ?? []).map((p) => ({ id: p.id, name: p.name, department: p.department?.name ?? undefined }))}
      onSearch={setQ}
      onBlock={(input) => write('POST', '/reviewer-blocks', input)}
      onEnd={(id) => write('DELETE', `/reviewer-blocks/${encodeURIComponent(id)}`)}
    />
  );
}
