import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdvisoriesScreen, LoansScreen, MyDeclarationsScreen, NomineeDrawer, PaymentModesScreen, PayslipQueriesScreen, ProofCheckScreen, RegistersScreen, RunPaymentsScreen, TaxCertificatesScreen } from './operations';
import { PAYSLIPS, PEOPLE, RUN } from './fixtures-5j';
import { ADVISORIES, CERTIFICATES, DECLARATIONS, DISBURSEMENTS, ENTITIES, LOANS, MODES, PROOFS, QUERIES, REGISTERS } from './fixtures-ops';

// Payroll operations screens with sample data (the affordance guard opens these in light and dark).
const ok = async () => ({}) as never;
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const search = async () => PEOPLE.map((p) => ({ id: p.employeeId, name: p.name, employeeCode: p.employeeCode ?? undefined }));
const meta: Meta = { title: 'Screens/Pay/Live ops', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Payments: S = {
  name: 'PAY-10 · Run payments',
  render: () => (
    <RunPaymentsScreen
      state="ready"
      run={{ ...RUN, status: 'approved' }}
      payslips={PAYSLIPS.map((s, i) => ({ ...s, status: 'approved', paymentStatus: i ? 'sent' : 'failed' }))}
      disbursements={DISBURSEMENTS}
      nameOf={nameOf}
      can={{ record: true }}
      onBack={() => undefined}
      onResults={ok}
      onUploadResults={async () => ({ recorded: 2 })}
      onDisburse={ok}
    />
  ),
};

export const PaymentModes: S = { name: 'PAY-10 · Payment modes', render: () => <PaymentModesScreen state="ready" modes={MODES} nameOf={nameOf} can={{ request: true }} onSearch={search} onRequest={ok} /> };

export const Loans: S = { name: 'PAY-17 · Loans and advances', render: () => <LoansScreen state="ready" loans={LOANS} nameOf={nameOf} can={{ manage: true }} onSearch={search} onRequest={ok} onChange={ok} /> };

export const MyLoans: S = { name: 'PAY-18 · My loans', render: () => <LoansScreen state="ready" loans={LOANS} nameOf={nameOf} mine can={{ manage: false }} onRequest={ok} onChange={ok} /> };

export const Queries: S = { name: 'PAY-20 · Payslip queries', render: () => <PayslipQueriesScreen state="ready" queries={QUERIES} nameOf={nameOf} status="open" onStatus={() => undefined} onReply={ok} onClose={ok} /> };

export const Declarations: S = {
  name: 'PAY-22 · My tax declarations',
  render: () => <MyDeclarationsScreen state="ready" data={DECLARATIONS} certificates={[{ id: 'c3', taxYear: '2025-26', form: 'form16', payDocumentId: 'pd1' }]} onDeclare={ok} onProof={ok} onPartA={ok} />,
};

export const Proofs: S = { name: 'PAY-23 · Proof checking', render: () => <ProofCheckScreen state="ready" lines={PROOFS} status="pending" onStatus={() => undefined} onFile={ok} onDecide={ok} /> };

export const Registers: S = {
  name: 'CMP-09 · Statutory registers',
  render: () => (
    <RegistersScreen
      state="ready"
      entities={ENTITIES}
      entityId="e1"
      onEntity={() => undefined}
      month="2026-09"
      onMonth={() => undefined}
      registers={REGISTERS}
      can={{ generate: true, sign: true, download: true }}
      onGenerate={ok}
      onDownload={ok}
      onFreeze={ok}
      onSign={ok}
      onPack={ok}
    />
  ),
};

export const Advisories: S = { name: 'CMP-12 · Advisories', render: () => <AdvisoriesScreen state="ready" entities={ENTITIES} entityId="e1" onEntity={() => undefined} advisories={ADVISORIES} onReview={ok} /> };

export const Certificates: S = {
  name: 'PAY-5.08 · Tax certificates',
  render: () => (
    <TaxCertificatesScreen
      state="ready"
      entities={ENTITIES}
      entityId="e1"
      onEntity={() => undefined}
      taxYear="2025-26"
      onTaxYear={() => undefined}
      certificates={CERTIFICATES}
      nameOf={nameOf}
      can={{ importZip: true, issueAll: true }}
      onImportZip={async () => ({ files: 3, matched: 2, unmatched: ['ABCDE9999Z_Q4.pdf'] })}
      onPartA={ok}
      onIssue={ok}
      onIssueAll={async () => ({ issued: 1, failed: [] })}
    />
  ),
};

export const Nominee: S = { name: 'DOC-19 · Add a nominee', render: () => <NomineeDrawer onSearch={search} onClose={() => undefined} onSave={ok} /> };
