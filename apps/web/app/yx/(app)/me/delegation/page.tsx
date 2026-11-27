'use client';

import { DelegationPhone, DelegationScreen } from '@yukthix/ui/frame';
import { usePhone } from '../../../../../lib/yx-phone';
import { useLiveDelegation } from '../../../../../lib/yx-delegation';

// Delegation (PLT-07, design audit step 2) on the P03 approvals engine: who approves for me while I am away.
export default function YxDelegationPage() {
  const phone = usePhone();
  const live = useLiveDelegation();
  // T2-H: on a phone, the designed phone layout with the same form and calls.
  return phone ? <DelegationPhone live={live} /> : <DelegationScreen live={live} />;
}
