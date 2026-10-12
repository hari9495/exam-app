'use client';

import { useState } from 'react';
import { ExpenseReportsScreen, type ExpenseReport, type ReportKind } from '@yukthix/ui/expenses';
import { loadState, todayIst } from '../../../../../lib/yx-org';
import { useExp, useExpDownload } from '../../../../../lib/yx-expenses';

// Expense reports (EXP-09, M05 batch E5): spend, unpaid, advance ageing, over limit, GST input and approver patterns,
// each exportable as CSV. The API checks expense.report.view for the legal entities it is granted for.
export default function YxExpenseReportsPage() {
  const today = todayIst();
  const [kind, setKind] = useState<ReportKind>('summary');
  const [range, setRange] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const query = `?from=${range.from}&to=${range.to}`;
  const report = useExp<ExpenseReport>(`/reports/${kind}${query}`);
  const download = useExpDownload();
  return (
    <ExpenseReportsScreen
      state={loadState(report)}
      onRetry={() => void report.refetch()}
      kind={kind}
      report={report.data ?? null}
      from={range.from}
      to={range.to}
      onKind={setKind}
      onRange={(from, to) => setRange({ from, to })}
      onExport={() => download(`/reports/${kind}${query}&format=csv`)}
    />
  );
}
