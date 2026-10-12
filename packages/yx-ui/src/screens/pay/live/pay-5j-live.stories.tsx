import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrearsScreen, FnfScreen, StatutoryHubScreen } from './compliance';
import { MyPayslipsScreen, MyTaxScreen } from './employee';
import { PayInputsScreen } from './inputs';
import { PayRunScreen, PayRunsScreen } from './runs';
import { BANK_FILES, DETAIL, FILINGS, FNF, HUB, MY_PAYSLIPS, PAYSLIPS, PEOPLE, PREVIOUS, READINESS, RECOVERIES, RETURNS, RUN, VARIANCES, WORKSHEETS } from './fixtures-5j';

// Batch 5j wired payroll screens with sample data (the affordance guard opens these in light and dark).
const ok = async () => ({}) as never;
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const meta: Meta = { title: 'Screens/Pay/Live 5j', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const runProps = {
  state: 'ready' as const,
  run: RUN,
  people: PEOPLE,
  readiness: READINESS,
  progress: null,
  payslips: PAYSLIPS,
  variances: VARIANCES,
  bankFiles: BANK_FILES,
  published: false,
  can: { prepare: true, approve: true, bankGenerate: true, bankRelease: true, publish: true, offcycle: true },
  onBack: () => undefined,
  onWaive: ok,
  onCalculate: ok,
  onPayslip: async () => DETAIL,
  onAck: ok,
  onSubmit: ok,
  onDecide: ok,
  onVoid: ok,
  onGenerateBank: async () => ({ id: 'b2', fileId: 'f2', rows: 2, total: '126620.00', excluded: [] }),
  onReleaseBank: ok,
  onDownload: ok,
  onPublish: ok,
};

export const Runs: S = {
  name: 'PAY-01 · Runs',
  render: () => (
    <PayRunsScreen
      state="ready"
      runs={[RUN, { ...RUN, id: 'r2', runType: 'offcycle', offcycleKind: 'bonus', status: 'approved', totals: { ...RUN.totals!, people: 1, net: '20000.00' } }, { ...RUN, id: 'r0', month: '2026-08', status: 'paid' }]}
      groups={[{ id: 'g1', name: 'Monthly staff', legalEntityId: 'e1' }]}
      thisMonth="2026-10"
      canPrepare
      canOffcycle
      onCreate={async () => ({ id: 'r3' })}
      onOpen={() => undefined}
    />
  ),
};
export const RunChecks: S = { name: 'PAY-02 · Run checks', render: () => <PayRunScreen {...runProps} run={{ ...RUN, status: 'draft' }} /> };
export const RunPayslips: S = { name: 'PAY-03 · Run payslips', render: () => <PayRunScreen {...runProps} /> };
export const RunApproval: S = { name: 'PAY-07 · Waiting for my approval', render: () => <PayRunScreen {...runProps} run={{ ...RUN, status: 'submitted', preparedByMe: false, approval: { canDecide: true, phrase: 'APPROVE KFPL 2026-09', step: 1, steps: 2 } }} /> };
export const RunBank: S = { name: 'PAY-08 · Bank file', render: () => <PayRunScreen {...runProps} run={{ ...RUN, status: 'approved' }} /> };
export const RunPublish: S = { name: 'PAY-09 · Publish', render: () => <PayRunScreen {...runProps} run={{ ...RUN, status: 'paid' }} payslips={PAYSLIPS.map((s) => ({ ...s, status: 'approved' }))} /> };
export const Inputs: S = {
  name: 'PAY-04 … 06 · Inputs',
  render: () => (
    <PayInputsScreen
      state="ready"
      month="2026-09"
      onMonth={() => undefined}
      nameOf={nameOf}
      lop={[{ employeeId: 'p1', lopDays: '2.00', reason: 'Absent without leave', source: 'manual' }]}
      oneTime={[{ id: 'o1', employeeId: 'p2', componentCode: 'bonus', amount: '15000.00', month: '2026-09', endOn: null, source: 'manual', reason: 'Spot award', status: 'approved' }]}
      holds={[{ id: 'h1', employeeId: 'p3', reasonCode: 'exit_pending', note: 'Clearance not done', amount: null, released: false, ageDays: 4 }]}
      onSearch={async () => PEOPLE.map((p) => ({ id: p.employeeId, name: p.name, employeeCode: p.employeeCode ?? undefined }))}
      onSaveLop={ok}
      onAddOneTime={async () => ({ status: 'approved' })}
      onCancelOneTime={ok}
      onAddHold={ok}
      onReleaseHold={ok}
    />
  ),
};
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
  render: () => <FnfScreen state="ready" settlements={FNF} nameOf={nameOf} onOpenRun={() => undefined} onHold={ok} onAdd={ok} onWaiveNotice={ok} onSecondRun={async () => ({ runId: 'r10' })} />,
};
export const Arrears: S = {
  name: 'PAY-28 · Arrears and recoveries',
  render: () => <ArrearsScreen state="ready" worksheets={WORKSHEETS} recoveries={RECOVERIES} nameOf={nameOf} me="u-me" can={{ approve: true, writeOff: true }} onApprove={ok} onCancel={ok} onConfirmBase={ok} onWriteOff={ok} />,
};
