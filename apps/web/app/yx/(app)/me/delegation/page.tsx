'use client';

import { DelegationScreen } from '@yukthix/ui/frame';
import { useLiveDelegation } from '../../../../../lib/yx-delegation';

// Delegation (PLT-07, design audit step 2) on the P03 approvals engine: who approves for me while I am away.
export default function YxDelegationPage() {
  const live = useLiveDelegation();
  return <DelegationScreen live={live} />;
}
