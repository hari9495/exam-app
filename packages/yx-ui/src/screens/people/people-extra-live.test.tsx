import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { LiveIdentityPanel, LiveIntlBankCard, LiveWorkAuthTab, type LiveIntlBank } from './record-extra';
import { LiveBfsiRegister, LiveDisabilityDeclaration, LiveMergeReview, LiveTradingPreclearance, type MergeSide } from './declarations-live';

// The rest of the People screens with live data: identity (PPL-34), work authorisations (PPL-45), international bank
// (PPL-46), disability (PPL-38), the BFSI register (PPL-43), pre-clearance (PPL-44) and merge (PPL-37).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Identity panel (PPL-34)', () => {
  it('loads only when opened, shows consent and checks, and records an attestation', async () => {
    const onLoad = vi.fn();
    const onRecord = vi.fn(async () => undefined);
    wrap(
      <LiveIdentityPanel
        live={{
          onLoad,
          state: 'ready',
          onRetry: vi.fn(),
          onRecord,
          data: { canRecord: true, consent: [{ jurisdiction: 'India (DPDP)', status: 'Given', point: 'Day-1 identity check', on: '2026-10-20' }], checks: [{ id: 'c1', on: '2026-10-20', point: 'Day-1 identity check', result: 'Mismatch: HR review', kind: 'mismatch', by: 'Lakshmi', note: 'Old photo' }] },
        }}
      />,
    );
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(screen.getByText('India (DPDP)')).toBeInTheDocument();
    expect(screen.getByText('Identity flag for HR review')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Record HR attestation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record HR attestation' });
    await ue.click(within(dialog).getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(onRecord).toHaveBeenCalledWith({ point: 'HR attestation', result: 'attested' }));
  });
});

describe('Work authorisations (PPL-45)', () => {
  it('flags an expiring visa and an occupation that differs; HR adds a document', async () => {
    const onAdd = vi.fn(async () => undefined);
    wrap(<LiveWorkAuthTab live={{ designation: 'Quality Lead', canAdd: true, onAdd, rows: [{ id: 'w1', country: 'AE', type: 'Employment visa', number: 'XXXX7731', sponsor: 'Kaveri Foods FZE', occupation: 'Quality Inspector', occupationDiffers: true, issued: null, expires: '2026-11-01', daysLeft: 11, status: 'Expiring' }] }} />);
    expect(screen.getByText(/^Employment visa expires on .*Nov 2026$/)).toBeInTheDocument();
    expect(screen.getByText('Differs from designation')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add document' }));
    expect(within(await screen.findByRole('dialog', { name: 'Add a document' })).getByRole('button', { name: 'Add document' })).toBeDisabled();
  });
});

describe('International bank (PPL-46)', () => {
  const base = (o: Partial<LiveIntlBank> = {}): LiveIntlBank => ({ current: null, pending: null, indianAccounts: [], canRequest: true, canDecide: false, self: false, onRequest: vi.fn(async () => undefined), onDecide: vi.fn(async () => undefined), ...o });

  it('the approver decides a waiting change; nobody else sees the buttons', async () => {
    const l = base({ canRequest: false, canDecide: true, pending: { id: 'r1', country: 'AE', currency: 'AED', usableFrom: null, requestedBy: 'Arjun', version: 1, accounts: [{ kind: 'iban', label: 'AE•• •••• 3456', rule: 'remainder', value: 0, bic: 'ECBKAEAD' }] } });
    const { unmount } = wrap(<LiveIntlBankCard live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith(true, null));
    unmount();
    wrap(<LiveIntlBankCard live={{ ...l, canDecide: false }} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('a change needs a valid IBAN and BIC before it is sent', async () => {
    const l = base();
    wrap(<LiveIntlBankCard live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Add accounts' }));
    await ue.type(screen.getByRole('textbox', { name: /^IBAN/ }), 'AE07 0331 2345 6789 0123 457');
    await ue.type(screen.getByRole('textbox', { name: /BIC/ }), 'ECBKAEAD');
    expect(screen.getByText(/Enter a valid IBAN for the country/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeDisabled();
    await ue.clear(screen.getByRole('textbox', { name: /^IBAN/ }));
    await ue.type(screen.getByRole('textbox', { name: /^IBAN/ }), 'AE07 0331 2345 6789 0123 456');
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(l.onRequest).toHaveBeenCalledWith({ country: 'AE', currency: 'AED', accounts: [{ kind: 'iban', iban: 'AE07 0331 2345 6789 0123 456', bic: 'ECBKAEAD', rule: 'remainder', value: 0 }] }));
  });
});

describe('Disability declaration (PPL-38)', () => {
  it('nothing can be saved before consent; the declaration shows with Withdraw once saved', async () => {
    const live = { state: 'ready' as const, onRetry: vi.fn(), company: 'Kaveri Foods', onUpload: vi.fn(async () => 'd1'), onDeclare: vi.fn(async () => undefined), onWithdraw: vi.fn(async () => undefined), onSkip: vi.fn() };
    const { unmount } = wrap(<LiveDisabilityDeclaration live={{ ...live, data: { declaration: null, categories: ['Locomotor disability'] } }} />);
    expect(screen.getByRole('button', { name: 'Save declaration' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Category/ })).toBeDisabled();
    unmount();
    wrap(<LiveDisabilityDeclaration live={{ ...live, data: { declaration: { id: 'x', category: 'Locomotor disability', percent: 45, validUntil: '2031-03-14', adjustments: null, status: 'verified', consentOn: '2026-02-03', certificate: 'verified', version: 2 }, categories: [] } }} />);
    expect(screen.getByText('Locomotor disability · 45%')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Withdraw consent' }));
    await ue.click(within(await screen.findByRole('dialog', { name: /Withdraw your disability declaration/ })).getByRole('button', { name: 'Withdraw consent' }));
    await waitFor(() => expect(live.onWithdraw).toHaveBeenCalled());
  });
});

describe('BFSI register and pre-clearance (PPL-43, PPL-44)', () => {
  it('the officer reviews a submitted declaration (never their own)', async () => {
    const onOpen = vi.fn(async () => ({ id: 'd', year: '2026-27', dueOn: '2026-11-20', holdings: [{ security: 'Deccan Agro', quantity: 350, how: 'Demat' }], related: [], coiHas: false, coiDetails: null, status: 'submitted' as const, attestedAt: '2026-10-21T10:00:00Z', version: 3 }));
    const onReview = vi.fn(async () => undefined);
    wrap(
      <LiveBfsiRegister
        live={{
          state: 'ready',
          onRetry: vi.fn(),
          people: [],
          onDesignate: vi.fn(),
          onOpen,
          onReview,
          onCloseWindow: vi.fn(),
          onExport: vi.fn(),
          data: { year: '2026-27', windows: [], rows: [
            { employeeId: 'e1', declarationId: 'd', name: 'Arjun', type: 'Holdings', due: '2026-11-20', status: 'Done', mine: false, version: 3 },
            { employeeId: 'e2', declarationId: 'd2', name: 'Imran', type: 'Holdings', due: '2026-11-20', status: 'Done', mine: true, version: 3 },
          ] },
        }}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText(/Deccan Agro · 350/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(onReview).toHaveBeenCalled());
  });

  it('a closed trading window: no request can be sent', () => {
    wrap(<LiveTradingPreclearance live={{ today: '2026-10-21', window: { closedTo: '2026-10-30', reason: 'Quarterly results' }, requests: [], onRequest: vi.fn(), onUploadNote: vi.fn(), onReport: vi.fn() }} />);
    expect(screen.getByText('Trading window closed until 30 Oct 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request pre-clearance' })).toBeDisabled();
  });
});

describe('Merge (PPL-37)', () => {
  const side = (name: string, o: Partial<MergeSide> = {}): MergeSide => ({ personId: name, name, email: null, phone: null, dob: null, pan: null, uan: null, employee: null, roles: [], ...o });
  it('the audit note is required; the picks go with it', async () => {
    const onMerge = vi.fn(async () => undefined);
    wrap(<LiveMergeReview live={{ state: 'ready', onRetry: vi.fn(), onCancel: vi.fn(), onMerge, data: { a: side('Arjun', { employee: { id: 'e', code: 'KF0142', joined: '2025-01-01', left: null } }), b: side('Arjun Kulkarni', { phone: '+919845011223' }), blocked: null } }} />);
    await ue.click(screen.getByRole('button', { name: 'Merge records' }));
    expect(screen.getByText('Enter why you are merging. It goes to the link log.')).toBeInTheDocument();
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Keep Name' })).getByRole('radio', { name: 'B' }));
    await ue.type(screen.getByRole('textbox', { name: /Audit note/ }), 'Same phone, confirmed by call');
    await ue.click(screen.getByRole('button', { name: 'Merge records' }));
    await waitFor(() => expect(onMerge).toHaveBeenCalledWith({ picks: { name: 'b', email: 'a', phone: 'a' }, note: 'Same phone, confirmed by call' }));
  });
});
