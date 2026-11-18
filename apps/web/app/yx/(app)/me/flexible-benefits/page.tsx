'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MyFlexBenefitsScreen, type FlexLedgerView } from '@yukthix/ui/pay';
import { payState } from '../../../../../lib/yx-pay';
import { useApi } from '../../../../../lib/yx-pay-5j';
import { flexYears } from '../../../../../lib/yx-flex';

// Me › My pay › Flexible benefits (PAY-59, answer 2455): the designed screen with the person's own ledger per component
// for this tax year or the last. No key: the API answers for the signed-in person only (never while acting for someone).
export default function YxMyFlexBenefitsPage() {
  const router = useRouter();
  const years = flexYears();
  const [year, setYear] = useState(years[0]);
  const ledger = useApi<FlexLedgerView>(`/benefits/flex/me?taxYear=${encodeURIComponent(year)}`);
  return <MyFlexBenefitsScreen live={{ state: payState(ledger), onRetry: () => void ledger.refetch(), data: ledger.data ?? null, years, year, onYear: setYear, onClaim: () => router.push('/yx/expenses') }} />;
}
