'use client';

import { useRouter } from 'next/navigation';
import { MyInterviewsScreen, type MyInterviewRow } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useHiring } from '../../../../../lib/yx-hiring';

// Hiring › My interviews (M10 batch AT5): the interviews you are on the panel for and the scorecards you owe.
// Replaces /v2/panel/interviews, which now redirects here.
export default function YxMyInterviewsPage() {
  const router = useRouter();
  const rows = useHiring<MyInterviewRow[]>('/interviews/mine');
  return <MyInterviewsScreen state={loadState(rows)} onRetry={() => void rows.refetch()} rows={rows.data ?? []} onOpen={(id) => router.push(`/yx/hiring/interviews/${encodeURIComponent(id)}`)} />;
}
