'use client';

import { TaxWorkspaceScreen } from '@yukthix/ui/pay';
import { useLiveTax } from '../../../../../lib/yx-pay-tax';

// Me › Tax declarations (PAY-22): the same workspace, opened on Declarations; proofs, Form 12B and Part A are in it.
export default function YxMyTaxDeclarationsPage() {
  return <TaxWorkspaceScreen live={useLiveTax('declarations')} />;
}
