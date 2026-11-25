'use client';

import { TaxWorkspaceScreen } from '@yukthix/ui/pay';
import { useLiveTax } from '../../../../../lib/yx-pay-tax';

// Me › Tax (PAY-22 tax workspace with PAY-41 inside): how the monthly tax is worked out, compare regimes, choose one.
export default function YxMyTaxPage() {
  return <TaxWorkspaceScreen live={useLiveTax('overview')} />;
}
