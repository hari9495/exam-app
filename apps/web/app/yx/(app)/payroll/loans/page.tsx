'use client';

import { LoansScreen, type LoanRepayments, type LoanView } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayRead, usePayWrite } from '../../../../../lib/yx-pay';
import { useNames } from '../../../../../lib/yx-pay-5j';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';

// Payroll › Loans and advances (PAY-17): requests go to Approvals; payroll pauses, reschedules or closes (never its own).
export default function YxPayLoansPage() {
  const perms = useYxPermissions();
  const loans = usePay<LoanView[]>('/loans');
  const write = usePayWrite();
  const read = usePayRead();
  const search = usePeopleSearch();
  const nameOf = useNames();
  return (
    <LoansScreen
      live={{
        // GET /loans also answers employees (their own requests), so this payroll page checks the key itself.
        state: perms.data === undefined ? 'loading' : !perms.has('payroll.loan.manage') ? 'no-access' : payState(loans),
        onRetry: () => void loans.refetch(),
        loans: loans.data ?? null,
        nameOf,
        can: { manage: perms.has('payroll.loan.manage') },
        onSearch: search,
        onRequest: (x) => write('/loans', x),
        onChange: (l, x) => write(`/loans/${encodeURIComponent(l.id)}/schedule-changes`, x),
        onRepayments: (l) => read<LoanRepayments>(`/loans/${encodeURIComponent(l.id)}/repayments`),
      }}
    />
  );
}
