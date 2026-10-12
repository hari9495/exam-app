import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsultantPortalScreen, ConsultantTaxScreen, ConsultantsScreen } from './consultants';
import { ENTITIES } from './fixtures-ops';
import type { ConsultantBatch, ConsultantInvoice, ConsultantRow, NonSalaryReturn } from './types-5h';

// Batch 5h screens with sample data (the affordance guard opens these in light and dark).
const ok = async () => ({}) as never;
const meta: Meta = { title: 'Screens/Pay/Live 5h', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const bank = { holder: 'Asha Rao', ifsc: 'HDFC0001234', account: '•••• 2333', verified: true, verifiedRef: 'PD-778899', usableFrom: '2026-10-01T00:00:00.000Z', usable: true };
export const CONSULTANTS: ConsultantRow[] = [
  { id: 'k1', legalEntityId: 'e1', name: 'Asha Rao', kind: 'individual', email: 'asha@example.test', pan: '•••••••34F', panStatus: 'operative', gstin: null, defaultSection: '194J_B', bank, status: 'active', version: 2, changedByMe: false },
  { id: 'k2', legalEntityId: 'e1', name: 'Nirmal Works', kind: 'firm', email: 'accounts@nirmal.test', pan: null, panStatus: 'missing', gstin: '29ABCDE1234F1Z5', defaultSection: '194C', bank: { ...bank, holder: 'Nirmal Works', account: '•••• 6777', verified: false, usable: false }, status: 'active', version: 1, changedByMe: false },
];
const inv = (x: Partial<ConsultantInvoice>): ConsultantInvoice => ({
  id: 'i1',
  consultantId: 'k1',
  consultant: 'Asha Rao',
  invoiceNo: 'INV-001',
  invoiceDate: '2026-10-05',
  period: '2026-09',
  section: '194J_B',
  taxableValue: '40000.00',
  gst: '7200.00',
  total: '47200.00',
  uploadedVia: 'consultant',
  hasFile: true,
  status: 'approved',
  tds: { amount: '0.00', base: '0.00', rate: '0.10', reason: 'below_threshold', certificateUsed: '0.00' },
  netPayable: '47200.00',
  paidOn: null,
  paymentRef: null,
  paymentReason: null,
  ...x,
});
export const INVOICES: ConsultantInvoice[] = [
  inv({}),
  inv({ id: 'i2', invoiceNo: 'INV-002', taxableValue: '20000.00', gst: '3600.00', total: '23600.00', tds: { amount: '6000.00', base: '60000.00', rate: '0.10', reason: 'normal', certificateUsed: '0.00' }, netPayable: '17600.00', status: 'paid', paidOn: '2026-10-10', paymentRef: 'UTR0001' }),
  inv({ id: 'i3', consultantId: 'k2', consultant: 'Nirmal Works', invoiceNo: 'NW-77', section: '194C', taxableValue: '35000.00', gst: '6300.00', total: '41300.00', uploadedVia: 'staff', hasFile: false, tds: null, netPayable: null, status: 'submitted' }),
  inv({ id: 'i4', consultantId: 'k2', consultant: 'Nirmal Works', invoiceNo: 'NW-76', section: '194C', status: 'failed', paymentReason: 'Account closed', tds: { amount: '7000.00', base: '35000.00', rate: '0.20', reason: 'no_pan', certificateUsed: '0.00' }, netPayable: '34300.00' }),
];
const BATCHES: ConsultantBatch[] = [
  { id: 'b1', fileName: 'consultants-2026-10-12.xlsx', rows: 2, total: '51900.00', sha256: '9f2c4b1d7e6a5c3b2a19f2c4b1d7e6a5', status: 'draft', madeByMe: false, releasePhrase: 'RELEASE 2', createdAt: '2026-10-12T05:00:00.000Z' },
  { id: 'b2', fileName: 'consultants-2026-10-01.xlsx', rows: 1, total: '17600.00', sha256: '1a2b3c4d5e6f7a8b9c0d1a2b3c4d5e6f', status: 'released', madeByMe: true, releasePhrase: 'RELEASE 1', createdAt: '2026-10-01T05:00:00.000Z' },
];
const RETURNS: NonSalaryReturn[] = [
  { id: 'r1', formCode: '140', taxYear: '2026-27', quarter: 2, status: 'reconciled', tokenNo: null, reconciliation: { ok: true, lines: [] }, fileId: 'f1', rows: 4, tds: '15400.00' },
  { id: 'r2', formCode: '140', taxYear: '2026-27', quarter: 1, status: 'filed', tokenNo: 'TKN123456', reconciliation: { ok: true, lines: [] }, fileId: 'f0', rows: 3, tds: '9000.00' },
];
const screen = {
  state: 'ready' as const,
  entities: ENTITIES,
  consultants: CONSULTANTS,
  invoices: INVOICES,
  batches: BATCHES,
  can: { manage: true, release: true },
  onCreate: ok,
  onBankCheck: ok,
  onCertificate: ok,
  onInvoice: ok,
  onInvoiceFile: ok,
  onAdvice: ok,
  onPayout: ok,
  onDownloadBatch: ok,
  onRelease: ok,
  onResults: ok,
};

export const Consultants: S = { name: 'PAY-37 · Consultants', render: () => <ConsultantsScreen {...screen} /> };

export const ConsultantsEmpty: S = { name: 'PAY-37 · Consultants (none yet)', render: () => <ConsultantsScreen {...screen} consultants={[]} invoices={[]} batches={[]} /> };

export const ConsultantTax: S = {
  name: 'PAY-38 · Consultant TDS returns',
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

export const ConsultantPortal: S = {
  name: 'PAY-37 · Consultant’s own page',
  render: () => (
    <ConsultantPortalScreen
      data={{
        me: { id: 'k1', name: 'Asha Rao', company: 'Kaveri Foods Pvt Ltd', pan: '•••••••34F', panStatus: 'operative', bank: { account: '•••• 2333', usable: true } },
        canUpload: true,
        invoices: INVOICES.filter((i) => i.consultantId === 'k1'),
        certificates: [{ id: 'c1', taxYear: '2026-27', quarter: 1, form: 'Form 131' }],
      }}
      onUpload={ok}
      onAdvice={ok}
      onCertificate={ok}
      onSignOut={() => undefined}
    />
  ),
};
