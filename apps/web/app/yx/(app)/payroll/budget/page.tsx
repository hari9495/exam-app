'use client';

import { useEffect, useState } from 'react';
import { PayrollBudgetScreen, type PayrollBudget, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { todayIndia } from '../../../../../lib/yx-time';

/** "2026-27" for any day from 1 Apr 2026 to 31 Mar 2027. */
const taxYearOf = (iso: string) => {
  const y = Number(iso.slice(0, 4)) - (Number(iso.slice(5, 7)) < 4 ? 1 : 0);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};
const shift = (ty: string, n: number) => {
  const y = Number(ty.slice(0, 4)) + n;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

// Payroll › Budget (founder decision 21 Oct 2026): the monthly payroll budget per legal entity, set by payroll set-up;
// the finance Home's "Payroll cost vs budget" reads it.
export default function YxPayrollBudgetPage() {
  // Everyone who sees the runs reads the budget; only payroll set-up changes it (the API says per entity).
  const entities = usePay<SetupEntity[]>('/budgets/entities');
  const editable = entities.data ?? [];
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && editable.length) setEntityId(editable[0].id);
  }, [editable, entityId]);
  const now = taxYearOf(todayIndia());
  const [taxYear, setTaxYear] = useState(now);
  const budget = usePay<PayrollBudget>(entityId ? `/budgets?entityId=${encodeURIComponent(entityId)}&taxYear=${taxYear}` : null);
  const write = usePayWrite();
  return (
    <PayrollBudgetScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={editable}
      entityId={entityId}
      onEntity={setEntityId}
      taxYears={[shift(now, -1), now, shift(now, 1)]}
      taxYear={taxYear}
      onTaxYear={setTaxYear}
      budget={budget.data ?? null}
      onSave={(months) => write('/budgets', { legalEntityId: entityId, months }, 'PUT')}
    />
  );
}
