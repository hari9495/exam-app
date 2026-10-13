'use client';

import { MyEwaScreen, type MyEwa } from '@yukthix/ui/pay';
import { usePay, usePayWrite } from '../../../../../lib/yx-pay';

// Me › Get paid early (PAY-9.05, PAY-26): draw part of the pay already earned this month.
export default function YxMyEwaPage() {
  const me = usePay<MyEwa>('/me/ewa');
  const write = usePayWrite();
  return <MyEwaScreen data={me.data ?? null} onDraw={(amount) => write('/me/ewa/draws', { amount, acceptDisclosure: true })} />;
}
