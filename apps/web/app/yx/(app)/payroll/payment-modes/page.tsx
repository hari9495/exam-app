'use client';

import { PaymentModesScreen, type PaymentModeRow } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { useNames } from '../../../../../lib/yx-pay-5j';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';

// Payroll › Payment modes (PAY-10.09): cash or cheque instead of the bank, asked for here and approved in Approvals.
export default function YxPayPaymentModesPage() {
  const perms = useYxPermissions();
  const modes = usePay<PaymentModeRow[]>('/payment-modes');
  const write = usePayWrite();
  const search = usePeopleSearch();
  const nameOf = useNames();
  return (
    <PaymentModesScreen
      state={payState(modes)}
      onRetry={() => void modes.refetch()}
      modes={modes.data ?? null}
      nameOf={nameOf}
      can={{ request: perms.has('payroll.payment.record') }}
      onSearch={search}
      onRequest={(x) => write('/payment-modes', x)}
    />
  );
}
