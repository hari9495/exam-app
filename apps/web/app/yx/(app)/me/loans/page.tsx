'use client';

import { LoansScreen, type LoanView } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';

// Me › Loans and advances (PAY-10.10, PAY-18): ask for an advance or loan and see what is left to repay.
export default function YxMyLoansPage() {
  const loans = usePay<LoanView[]>('/loans');
  const write = usePayWrite();
  return (
    <LoansScreen
      state={payState(loans)}
      onRetry={() => void loans.refetch()}
      loans={loans.data ?? null}
      nameOf={() => ''}
      mine
      can={{ manage: false }}
      onRequest={(x) => write('/loans', x)}
      onChange={() => Promise.resolve()}
    />
  );
}
