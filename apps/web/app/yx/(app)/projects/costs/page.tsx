'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CostingMarginScreen, type LiveCostsData } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useProjects } from '../../../../../lib/yx-projects';

// Projects › Costing & margin (PRJ-04), Projects P-5 (answers 1412, 1413): project totals from the nightly cost job.
// Projects finance sees revenue and margin; a project's manager sees their projects' totals (the API hides small months).
const lastMonths = (n: number) => {
  const out: string[] = [];
  const d = new Date();
  for (let i = 1; i <= n; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i + 1, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

export default function YxCostsPage() {
  const router = useRouter();
  const months = lastMonths(12);
  const [month, setMonth] = useState(months[1]!);
  const data = useProjects<LiveCostsData>(`/costs?month=${month}`);
  const state = loadState(data);
  return (
    <CostingMarginScreen
      live={{
        state: (data.error as { code?: string } | null)?.code === 'PROJECTS_OFF' ? 'off' : state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        months,
        onMonth: setMonth,
        onOpen: (id) => router.push(`/yx/projects/${encodeURIComponent(id)}`),
      }}
    />
  );
}
