'use client';

import { ComponentLibraryLiveScreen, type ComponentInput, type PayComponent } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';

// Payroll › Component library (PAY-14, PAY-2.07): the company's components and wage flags; the India starter set.
export default function YxPayComponentsPage() {
  const rows = usePay<PayComponent[]>('/components');
  const write = usePayWrite();
  const body = (c: ComponentInput) => {
    const { code, name, kind, taxable, pfWage, esiWage, ptWage, gratuityWage, bonusWage, codeWagePart, codeExclusion, prorated, onPayslip, inCtc, rounding, status, version } = c;
    return {
      code,
      name,
      kind,
      taxable,
      pfWage,
      esiWage,
      ptWage,
      gratuityWage,
      bonusWage,
      codeWagePart,
      codeExclusion,
      prorated,
      onPayslip,
      inCtc,
      rounding,
      status,
      version,
      ...(c.prorationText ? { prorationText: c.prorationText } : {}),
      ...(c.ledger ? { ledger: c.ledger } : {}),
    };
  };
  return (
    <ComponentLibraryLiveScreen
      state={payState(rows)}
      onRetry={() => void rows.refetch()}
      rows={rows.data ?? null}
      onSave={(id, c) => (id ? write(`/components/${encodeURIComponent(id)}`, body(c), 'PATCH') : write('/components', body(c)))}
      onInstallStarter={() => write<{ componentsAdded: number }>('/components/starter')}
    />
  );
}
