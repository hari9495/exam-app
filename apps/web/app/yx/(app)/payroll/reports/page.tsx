'use client';

import { useState } from 'react';
import { PayrollReportsScreen, type PayReport, type PayReportKind, type ReportFilters, type ReportOptions } from '@yukthix/ui/pay';
import { payState, usePay, usePayDownload } from '../../../../../lib/yx-pay';

// Payroll › Payroll reports (PAY-25): read-only reports for the legal entities the person's payroll.reports.view
// reaches. The API narrows every query to those entities (and the database pay guard to the same); a CSV export holds
// every row of the filters and is audited.
const NO_FILTERS: ReportFilters = { legalEntityId: null, from: null, to: null, departmentId: null, locationId: null };

export default function YxPayReportsPage() {
  const options = usePay<ReportOptions>('/reports');
  const [kind, setKind] = useState<PayReportKind>('register');
  const [filters, setFilters] = useState<ReportFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const query = new URLSearchParams(Object.entries(filters).filter((x): x is [string, string] => !!x[1])).toString();
  const path = `/reports/${kind}?${query}${query ? '&' : ''}`;
  const report = usePay<PayReport>(options.data ? `${path}page=${page}` : null);
  const download = usePayDownload();
  return (
    <PayrollReportsScreen
      live={{
        state: payState(options),
        onRetry: () => void options.refetch(),
        options: options.data ?? null,
        kind,
        onKind: (k) => {
          setKind(k);
          setPage(1);
        },
        filters,
        onFilters: (f) => {
          setFilters(f);
          setPage(1);
        },
        page,
        onPage: setPage,
        report: report.data ?? null,
        reportState: payState(report),
        onReportRetry: () => void report.refetch(),
        onExport: () => download(`/payroll${path}format=csv`, `payroll-${kind}.csv`),
      }}
    />
  );
}
