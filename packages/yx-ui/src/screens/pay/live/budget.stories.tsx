import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayrollBudgetScreen, type PayrollBudget } from './budget';
import type { SetupEntity } from './types-5b';

// Payroll › Budget (founder decision 21 Oct 2026): the monthly payroll budget, April to March, beside the cost of each
// month's payroll. Set by people with payroll set-up rights; others see it read-only.
const meta: Meta = { title: 'Screens/Pay/Payroll budget', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ENTITIES: SetupEntity[] = [
  { id: 'kf', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: ['payroll.setup.manage'] },
  { id: 'tn', name: 'Kaveri Foods (Tamil Nadu) Pvt Ltd', shortName: 'KFPL-TN', keys: ['payroll.setup.manage'] },
];
const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
const COST = ['20850000', '20910000', '21120000', '21300000', '21280000', '21560000'];
const BUDGET: PayrollBudget = {
  entityId: 'kf',
  taxYear: '2026-27',
  canEdit: true,
  months: MONTHS.map((month, i) => ({ month, budget: '21400000.00', cost: COST[i] ? `${COST[i]}.00` : null, changedBy: 'Suresh Pillai', changedOn: '2026-04-02' })),
};

function Budget({ budget }: { budget: PayrollBudget }) {
  const [entityId, setEntityId] = useState<string | null>('kf');
  return <PayrollBudgetScreen state="ready" entities={ENTITIES} entityId={entityId} onEntity={setEntityId} taxYears={['2025-26', '2026-27']} taxYear="2026-27" onTaxYear={() => {}} budget={budget} onSave={async () => ({})} />;
}

export const PAYBudget: S = { name: 'PAY · Payroll budget · set by payroll', render: () => <Budget budget={BUDGET} /> };
export const PAYBudgetEmpty: S = {
  name: 'PAY · Payroll budget · nothing set yet',
  render: () => <Budget budget={{ ...BUDGET, months: BUDGET.months.map((m) => ({ ...m, budget: null, changedBy: null, changedOn: null })) }} />,
};
export const PAYBudgetReadOnly: S = { name: 'PAY · Payroll budget · read only (approver)', render: () => <Budget budget={{ ...BUDGET, canEdit: false }} /> };
