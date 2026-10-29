'use client';

import { EwaRequestScreen, type MyEwa } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';

// Me › Get paid early (PAY-26, desktop): draw part of the pay already earned this month, after accepting the recovery.
export default function YxMyEwaPage() {
  const me = usePay<MyEwa>('/me/ewa');
  const write = usePayWrite();
  return <EwaRequestScreen live={{ state: payState(me), onRetry: () => void me.refetch(), data: me.data ?? null, onDraw: (amount) => write('/me/ewa/draws', { amount, acceptDisclosure: true }) }} />;
}
