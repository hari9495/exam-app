import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/notify';
import { RegistersLiveScreen, VendorComplianceLiveScreen, type ComplianceView, type ProofDetail } from './compliance-live';
import { ContractWorkersLiveScreen, type LiveWorker } from './contract-live';

const st = (s: ComplianceView['matrix'][number]['statuses'][number]['status'][]) => (['pf', 'esi', 'wage_register', 'wage_payment', 'pt_lwf'] as const).map((type, i) => ({ type, status: s[i], proofId: ['open', 'overdue'].includes(s[i]) ? null : `p-${type}` }));
const VIEW: ComplianceView = {
  month: '2026-09',
  dueOn: '2026-10-15',
  wageDueOn: '2026-10-07',
  proofTypes: ['pf', 'esi', 'wage_register', 'wage_payment', 'pt_lwf'],
  matrix: [{ contractorId: 'c2', contractor: 'Vetri Security Agency', workers: 2, statuses: st(['verified', 'discrepancy', 'submitted', 'overdue', 'open']), held: true, released: null, standing: 'action_needed', documents: { total: 1, verified: 0, expiring: 1, expired: 0 } }],
  alerts: [{ key: 'a1', type: 'Short ESI challan', contractorId: 'c2', contractor: 'Vetri Security Agency', month: '2026-09', detail: 'Challan covers 1 workers; 2 were deployed', liability: 650, severity: 'High' }],
};
const PROOF: ProofDetail = { id: 'p-esi', contractorId: 'c2', contractor: 'Vetri Security Agency', month: '2026-09', proofType: 'esi', status: 'submitted', reference: '26091544901', amount: '650.00', workersCovered: 1, paidOn: null, note: null, hasFile: false, submittedBy: 'Lakshmi', submittedOn: '2026-10-14', mine: false, checks: [{ id: 'covered', status: 'fail', label: 'Workers covered ≥ workers deployed', detail: 'Short by 1.' }] };
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const base = { state: 'ready' as const, today: '2026-10-21', months: ['2026-09'], month: '2026-09', onMonth: () => {}, view: VIEW, canSubmit: true, canVerify: true, onProof: async () => PROOF, onAddProof: vi.fn(async () => ({})), onDecideProof: vi.fn(async () => ({})), onRelease: vi.fn(async () => ({})), onResolve: vi.fn(async () => ({})), onDocuments: async () => [], onAddDocument: vi.fn(async () => ({})), onDecideDocument: vi.fn(async () => ({})) };

describe('Vendor compliance, live (CLB-03)', () => {
  it('shows each proof, the bill hold and the alerts with their possible liability', () => {
    wrap(<VendorComplianceLiveScreen {...base} />);
    const row = within(screen.getByRole('table', { name: 'Contractor by proof type' })).getByRole('row', { name: /Vetri Security Agency/ });
    expect(row).toHaveTextContent('Discrepancy');
    expect(row).toHaveTextContent('Overdue');
    expect(row).toHaveTextContent('Held');
    expect(screen.getByRole('table', { name: 'Liability alerts' })).toHaveTextContent('₹650');
    expect(screen.getByText(/1 liability alert · estimated exposure ₹650/)).toBeInTheDocument();
  });

  it('will not verify a proof whose check fails', () => {
    wrap(<VendorComplianceLiveScreen {...base} defaultProof={PROOF} />);
    expect(screen.getByRole('button', { name: 'Mark verified' })).toBeDisabled();
    expect(screen.getByText(/A check failed, so it cannot be verified/)).toBeInTheDocument();
  });

  it('read only: no Override, no Resolve, and empty cells cannot be filled', () => {
    wrap(<VendorComplianceLiveScreen {...base} canSubmit={false} canVerify={false} />);
    expect(screen.queryByRole('button', { name: 'Override' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve with note' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add the proof/ })).not.toBeInTheDocument();
  });

  it('releasing a held bill needs a reason of a sentence', async () => {
    const p = { ...base, onRelease: vi.fn(async () => ({})) };
    wrap(<VendorComplianceLiveScreen {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Override' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Release bill' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Wages paid in cash on 6 Oct; register seen on site.');
    await userEvent.click(confirm);
    await waitFor(() => expect(p.onRelease).toHaveBeenCalledWith('c2', 'Wages paid in cash on 6 Oct; register seen on site.'));
  });
});

describe('Registers & returns, live (CLB-04)', () => {
  it('offers Excel only for registers with data, and says what the others need', () => {
    const onDownload = vi.fn();
    wrap(
      <RegistersLiveScreen
        state="ready"
        months={['2026-09']}
        month="2026-09"
        onMonth={() => {}}
        year={2026}
        returns={[]}
        onDownload={onDownload}
        onInspectionPack={() => {}}
        onReturnFile={() => {}}
        view={{
          month: '2026-09',
          establishments: [{ id: 'hsr', name: 'Hosur plant' }],
          chart: { months: ['2026-09'], sites: [{ siteId: 'hsr', site: 'Hosur plant', values: [4] }] },
          registers: [
            { id: 'r1', kind: 'contractors', name: 'Register of contractors', siteId: 'hsr', site: 'Hosur plant', contractorId: null, period: '2026-09', format: 'Form XII', status: 'ready', rows: 2, why: null },
            { id: 'r3', kind: 'muster', name: 'Muster roll', siteId: 'hsr', site: 'Hosur plant', contractorId: null, period: '2026-09', format: 'Form XVI', status: 'no_data', rows: 0, why: 'Needs daily attendance of contract workers.' },
          ],
        }}
      />,
    );
    expect(within(screen.getByRole('row', { name: /Register of contractors/ })).getByRole('button', { name: 'Excel' })).toBeInTheDocument();
    const muster = screen.getByRole('row', { name: /Muster roll/ });
    expect(muster).toHaveTextContent('No data yet');
    expect(muster).toHaveTextContent('Needs daily attendance of contract workers.');
    expect(within(muster).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Contract workers identifiers (CLB-02)', () => {
  const w: LiveWorker = { id: 'w1', personId: 'p', name: 'Anbu Selvan', contractorId: 'c', contractor: 'Vetri', licenceNo: 'L1', legalEntity: { id: 'e', name: 'E' }, site: { id: 's', name: 'Hosur plant' }, work: 'Security guard', skill: 'semi_skilled', wage: '16240.00', fromOn: '2026-03-11', toOn: null, status: 'deployed', aadhaarLast4: '1073', uanLast4: '4512', esicLast4: '0011', gatePass: 'GP-4101', gatePassValidTo: '2026-12-31' };
  const props = { state: 'ready' as const, today: '2026-10-21', workers: [w], contractors: [], sites: [], onDeploy: async () => ({}), onApprove: async () => ({}), onRelease: async () => ({}) };

  it('shows identifiers masked, and in full only on Show for someone who may', async () => {
    const onReveal = vi.fn(async () => '548550001073');
    wrap(<ContractWorkersLiveScreen {...props} canManage canReveal onReveal={onReveal} />);
    const row = screen.getByRole('row', { name: /Anbu Selvan/ });
    expect(row).toHaveTextContent('ID XXXX XXXX 1073');
    expect(row).toHaveTextContent('GP-4101');
    expect(row).not.toHaveTextContent('548550001073');
    await userEvent.click(within(row).getByText('Anbu Selvan'));
    const drawer = await screen.findByRole('dialog', { name: 'Anbu Selvan' });
    await userEvent.click(within(drawer).getAllByRole('button', { name: 'Show' })[0]);
    expect(onReveal).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), 'aadhaar');
    expect(await within(drawer).findByText('548550001073')).toBeInTheDocument();
  });

  it('no Show for someone without the identity key', async () => {
    wrap(<ContractWorkersLiveScreen {...props} canManage={false} />);
    await userEvent.click(within(screen.getByRole('row', { name: /Anbu Selvan/ })).getByText('Anbu Selvan'));
    const drawer = await screen.findByRole('dialog', { name: 'Anbu Selvan' });
    expect(within(drawer).queryByRole('button', { name: 'Show' })).not.toBeInTheDocument();
    expect(drawer).toHaveTextContent('XXXX XXXX 1073');
  });
});
