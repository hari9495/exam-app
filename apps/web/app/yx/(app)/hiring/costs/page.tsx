'use client';

import { toCsv } from '@yukthix/ui';
import { RecruitingCostsScreen, type CostEntry } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';
import { costMonths, costRow, quarterOf, type ApiCost } from '../../../../../lib/yx-hiring-costs';

type Overview = { from: string; to: string; hires: number; jobs: { id: string; title: string }[] };

// Hiring › Recruiting costs: the designed HIR-11 screen with `live`. Rupees in and out (the API keeps Decimal 14,2).
// Months and the quarter are India time; the API checks the key (org:manage_settings) and refuses acting for someone.
export default function YxHiringCostsPage() {
  const costs = useHiring<ApiCost[]>('/costs');
  const overview = useHiring<Overview>('/costs/overview');
  const write = useHiringWrite();
  const state = loadState(costs, overview);
  const quarter = overview.data ? quarterOf(overview.data.from, overview.data.to) : { label: '', months: [] };
  return (
    <RecruitingCostsScreen
      rows={(costs.data ?? []).map(costRow)}
      hires={overview.data?.hires ?? 0}
      state={state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'error'}
      live={{
        quarter,
        months: costMonths(new Date()),
        jobs: (overview.data?.jobs ?? []).map((j) => ({ value: j.id, label: j.title })),
        onRetry: () => void Promise.all([costs.refetch(), overview.refetch()]),
        onSave: async (input, id) => {
          await write(id ? 'PUT' : 'POST', id ? `/costs/${encodeURIComponent(id)}` : '/costs', input);
        },
        onDelete: async (id) => {
          await write('DELETE', `/costs/${encodeURIComponent(id)}`);
        },
        onExport: (rows: CostEntry[]) => {
          const csv = toCsv(
            ['Month', 'Cost type', 'Source', 'Job', 'Amount (INR)', 'Origin', 'Entered by', 'Note'],
            rows.map((r) => [r.period, r.type, r.source, r.job ?? 'General spend', r.amount.toFixed(2), r.origin, r.enteredBy, r.note ?? '']),
          );
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
          a.download = 'recruiting-costs.csv';
          a.click();
          URL.revokeObjectURL(a.href);
        },
      }}
    />
  );
}
