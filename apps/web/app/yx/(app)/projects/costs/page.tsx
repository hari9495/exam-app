'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CostingMarginScreen, type LiveCostsData } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { lastMonths, lastQuarters, useProjects, useProjectsDownload } from '../../../../../lib/yx-projects';

// Projects › Costing & margin (PRJ-04), Projects P-5 (answers 1412, 1413): project totals from the nightly cost job.
// Projects finance sees revenue and margin; a project's manager sees their projects' totals (the API hides small months).
// P-6 (1622): quarters, and the month's project cost journal for accounting.

export default function YxCostsPage() {
  const router = useRouter();
  const months = lastMonths(12);
  const periods = [...months, ...lastQuarters(4)];
  const [month, setMonth] = useState(months[1]!);
  const data = useProjects<LiveCostsData>(month.includes('Q') ? `/costs?quarter=${month}` : `/costs?month=${month}`);
  const download = useProjectsDownload();
  const state = loadState(data);
  return (
    <CostingMarginScreen
      live={{
        state: (data.error as { code?: string } | null)?.code === 'PROJECTS_OFF' ? 'off' : state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        months: periods,
        onMonth: setMonth,
        onExport: (m) => download(`/costs/journal?month=${m}`, `project-cost-journal-${m}.csv`),
        onOpen: (id) => router.push(`/yx/projects/${encodeURIComponent(id)}`),
      }}
    />
  );
}
