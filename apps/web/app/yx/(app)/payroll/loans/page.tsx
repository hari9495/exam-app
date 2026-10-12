'use client';

import { LoansScreen, type LoanView } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { useNames } from '../../../../../lib/yx-pay-5j';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';

// Payroll › Loans and advances (PAY-10.10, PAY-17): requests go to Approvals; payroll pauses, reschedules or closes.
export default function YxPayLoansPage() {
  const perms = useYxPermissions();
  const loans = usePay<LoanView[]>('/loans');
  const write = usePayWrite();
  const search = usePeopleSearch();
  const nameOf = useNames();
  return (
    <LoansScreen
      state={payState(loans)}
      onRetry={() => void loans.refetch()}
      loans={loans.data ?? null}
      nameOf={nameOf}
      can={{ manage: perms.has('payroll.loan.manage') }}
      onSearch={search}
      onRequest={(x) => write('/loans', x)}
      onChange={(l, x) => write(`/loans/${encodeURIComponent(l.id)}/schedule-changes`, x)}
    />
  );
}
