'use client';

import { useState } from 'react';
import { ExpenseReportsScreen, type ExpenseReport, type ReportKind } from '@yukthix/ui/expenses';
import type { LegalEntity } from '@yukthix/ui/org';
import { loadState, todayIst, useOrg } from '../../../../../lib/yx-org';
import { useExp, useExpDownload } from '../../../../../lib/yx-expenses';
import { useScope, useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Expense reports (EXP-09, the designed screen with `live`): spend with its charts, advance ageing, unpaid, over limit,
// GST input and approver patterns, filtered by period and department, exported as CSV or Excel. The API checks
// expense.report.view for the legal entities it is granted for.
export default function YxExpenseReportsPage() {
  const sp = useScopeParams();
  const picked = useScope().scope.entity;
  const today = todayIst();
  const [kind, setKind] = useState<ReportKind>('summary');
  const [f, setF] = useState({ from: `${today.slice(0, 8)}01`, to: today, departments: [] as string[] });
  const query = `?from=${f.from}&to=${f.to}${f.departments.length ? `&departmentId=${f.departments.join(',')}` : ''}`;
  const report = useExp<ExpenseReport>(withParams(`/reports/${kind}${query}`, sp.entity));
  const entities = useOrg<LegalEntity[]>('/legal-entities');
  const download = useExpDownload();
  return (
    <ExpenseReportsScreen
      live={{
        state: loadState(report),
        onRetry: () => void report.refetch(),
        kind,
        report: report.data ?? null,
        from: f.from,
        to: f.to,
        departments: f.departments,
        entityName: picked ? ((entities.data ?? []).find((e) => e.id === picked)?.name ?? null) : null,
        onKind: setKind,
        onFilters: (from, to, departments) => setF({ from, to, departments }),
        onExport: (format) => download(withParams(`/reports/${kind}${query}&format=${format}`, sp.entity)),
      }}
    />
  );
}
