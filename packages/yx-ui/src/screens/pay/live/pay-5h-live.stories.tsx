import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsultantTaxScreen } from './consultants';
import { ENTITIES } from './fixtures-ops';
import type { NonSalaryReturn } from './types-5h';

// Batch 5h screens with sample data (the affordance guard opens these in light and dark).
const ok = async () => ({}) as never;
const meta: Meta = { title: 'Screens/Pay/Live 5h', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const RETURNS: NonSalaryReturn[] = [
  { id: 'r1', formCode: '140', taxYear: '2026-27', quarter: 2, status: 'reconciled', tokenNo: null, reconciliation: { ok: true, lines: [] }, fileId: 'f1', rows: 4, tds: '15400.00' },
  { id: 'r2', formCode: '140', taxYear: '2026-27', quarter: 1, status: 'filed', tokenNo: 'TKN123456', reconciliation: { ok: true, lines: [] }, fileId: 'f0', rows: 3, tds: '9000.00' },
];

export const ConsultantTax: S = {
  name: 'Consultant TDS returns',
  render: () => (
    <ConsultantTaxScreen
      state="ready"
      entities={ENTITIES}
      entityId="e1"
      onEntity={() => undefined}
      returns={RETURNS}
      can={{ challans: true, file: true, certificates: true }}
      onPrepareChallans={async () => [{ section: '194J_B', tds: '8400.00', status: 'draft' }]}
      onDraft={ok}
      onReconcile={ok}
      onMakeFile={ok}
      onDownload={ok}
      onFiled={ok}
      onImport={async () => ({ formCode: '131', matched: [{ name: 'Asha Rao' }], unmatched: [] })}
    />
  ),
};
