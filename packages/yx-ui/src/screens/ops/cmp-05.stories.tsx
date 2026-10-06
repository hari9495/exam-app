import type { Meta, StoryObj } from '@storybook/react-vite';
import { TdsReturnWizardScreen } from './compliance';
import { DEDUCTEE_GAPS } from './compliance-data';

const meta: Meta = { title: 'Screens/Compliance/CMP-05 · TDS return wizard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const Q = 'Q2 tax year 2026-27';

export const Completeness: S = { name: 'Completeness (prior-month rows imported)', render: () => <TdsReturnWizardScreen quarter={Q} months={DEDUCTEE_GAPS} /> };
export const MissingMonth: S = { name: 'Blocked · prior-month rows missing', render: () => <TdsReturnWizardScreen quarter={Q} months={DEDUCTEE_GAPS} missingMonth /> };
export const Reconciliation: S = { name: 'Reconciliation · small difference flagged', render: () => <TdsReturnWizardScreen quarter={Q} months={DEDUCTEE_GAPS} current="reconcile" difference={0.29} /> };
export const Fvu: S = { name: 'Self-file · FVU validation', render: () => <TdsReturnWizardScreen quarter={Q} months={DEDUCTEE_GAPS} current="validate" /> };
export const Partner: S = { name: 'Filing partner', render: () => <TdsReturnWizardScreen quarter={Q} months={DEDUCTEE_GAPS} current="validate" mode="partner" /> };
export const Filed: S = { name: 'Filed and locked', render: () => <TdsReturnWizardScreen quarter={Q} months={DEDUCTEE_GAPS} current="file" filed /> };
export const Correction24Q: S = { name: 'Correction return (24Q, old quarter)', render: () => <TdsReturnWizardScreen form="24Q" quarter="Q4 FY 2025-26 correction" months={DEDUCTEE_GAPS} current="corrections" filed /> };
