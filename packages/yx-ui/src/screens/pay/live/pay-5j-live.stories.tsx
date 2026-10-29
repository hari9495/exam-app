import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatutoryHubScreen } from './compliance';
import { FnfCalculator } from '../../people/exits';
import { MyPayslipsScreen, MyTaxScreen } from './employee';
import { DETAIL, FILINGS, FNF, HUB, MY_PAYSLIPS, PEOPLE, PREVIOUS, RETURNS, RUN } from './fixtures-5j';

// Batch 5j wired payroll screens with sample data (the affordance guard opens these in light and dark).
const ok = async () => ({}) as never;
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const meta: Meta = { title: 'Screens/Pay/Live 5j', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const MyPayslips: S = {
  name: 'PAY-21 · My payslips',
  render: () => <MyPayslipsScreen state="ready" payslips={MY_PAYSLIPS} onOpen={async (id) => (id === 's0' ? PREVIOUS : DETAIL)} onPdf={ok} onQuery={ok} />,
};
export const MyTax: S = {
  name: 'PAY-41 · My tax',
  render: () => (
    <MyTaxScreen
      state="ready"
      workspace={{ taxYear: '2026-27', regime: 'new', canChooseRegime: true, dates: { regimeCutoff: '2026-05-31' }, panStatus: 'ok' }}
      onCompare={async () => ({
        taxYear: '2026-27',
        current: 'new',
        lower: 'new',
        regimes: [
          { regime: 'new', taxable: '651000.00', annualTax: '0.00', monthTds: '0.00' },
          { regime: 'old', taxable: '626000.00', annualTax: '38220.00', monthTds: '3185.00' },
        ],
      })}
      onChooseRegime={ok}
    />
  ),
};
export const Statutory: S = {
  name: 'CMP-01 · Statutory filings',
  render: () => (
    <StatutoryHubScreen
      state="ready"
      entities={[{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] }]}
      entityId="e1"
      onEntity={() => undefined}
      month="2026-09"
      onMonth={() => undefined}
      hub={HUB}
      filings={FILINGS}
      returns={RETURNS}
      can={{ generate: true, markFiled: true }}
      onGenerate={ok}
      onUploaded={ok}
      onFiled={ok}
      onDownload={ok}
      onCreateReturn={ok}
      onReconcile={ok}
      onReturnFile={ok}
      onUploadFvu={ok}
      onReturnFiled={ok}
    />
  ),
};
export const Fnf: S = {
  name: 'PPL-22 · Full and final',
  render: () => (
    <FnfCalculator
      today={new Date(2026, 9, 19)}
      live={{ state: 'ready', onRetry: () => undefined, settlements: FNF, nameOf, can: { manage: true, waiveNotice: true, prepare: true }, onOpenRun: () => undefined, onRecalculate: ok, onSubmit: ok, onHold: ok, onAdd: ok, onWaiveNotice: ok, onSecondRun: async () => ({ runId: 'r10' }) }}
    />
  ),
};
