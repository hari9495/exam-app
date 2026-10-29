import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdvisoriesScreen, RegistersScreen, TaxCertificatesScreen } from './operations';
import { PEOPLE } from './fixtures-5j';
import { ADVISORIES, CERTIFICATES, DECLARATIONS, ENTITIES, LOANS, PROOFS, REGISTERS } from './fixtures-ops';

// Payroll operations screens with sample data (the affordance guard opens these in light and dark).
const ok = async () => ({}) as never;
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const search = async () => PEOPLE.map((p) => ({ id: p.employeeId, name: p.name, employeeCode: p.employeeCode ?? undefined }));
const meta: Meta = { title: 'Screens/Pay/Live ops', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

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

