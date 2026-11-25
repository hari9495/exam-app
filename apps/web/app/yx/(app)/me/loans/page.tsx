'use client';

import { LoanRequestScreen, type LoanRules, type LoanView } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';

// Me › Loans and advances (PAY-18): ask for an advance or loan within the company's rules (founder decision 8, checked
// again on the server) and see what is left to repay. Approval goes to the Approvals inbox.
export default function YxMyLoansPage() {
  const loans = usePay<LoanView[]>('/loans');
  const rules = usePay<LoanRules>('/loans/rules');
  const write = usePayWrite();
  return (
    <LoanRequestScreen
      live={{
        state: payState(loans, rules),
        onRetry: () => void Promise.all([loans.refetch(), rules.refetch()]),
        loans: loans.data ?? null,
        rules: rules.data ?? null,
        onRequest: (x) => write('/loans', x),
      }}
    />
  );
}
