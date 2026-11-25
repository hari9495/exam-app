import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ReadyToOnboardQueue, type LiveReady, type ReadyRow } from './onboarding';
import { BfsiDeclarations, MyDataScreen, TradingPreclearance, type LiveBfsi, type LivePreclearance } from './selfservice';
import type { RehireView } from './live/types';

// People small gaps (builder 3): the not-designated empty states (PPL-43/44), Privacy's How long (PPL-33) and the
// rehire impact in Ready to onboard's Create drawer (PPL-12). Positive and negative.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const day = (iso: string) => new Date(`${iso}T00:00:00`);

describe('PPL-43 / PPL-44: someone who is not a designated person', () => {
  it('annual declarations: the designed empty state, not the form', () => {
    const live = { state: 'not-designated', onRetry: vi.fn() } as unknown as LiveBfsi;
    wrap(<BfsiDeclarations live={live} today={day('2026-10-30')} />);
    expect(screen.getByRole('heading', { name: 'Annual declarations' })).toBeInTheDocument();
    expect(screen.getByText('No declarations for you')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add holding/ })).toBeNull();
  });

  it('pre-clearance: the designed empty state; a designated person still gets the request form', () => {
    const base = { onRetry: vi.fn(), rules: { threshold: 1000000, validDays: 7, decideDays: 2 }, requests: [], onRequest: vi.fn(), onUploadNote: vi.fn(), onReport: vi.fn() };
    const { unmount } = wrap(<TradingPreclearance today={day('2026-10-30')} live={{ ...base, state: 'not-designated' } as LivePreclearance} />);
    expect(screen.getByText('No pre-clearance for you')).toBeInTheDocument();
    unmount();
    wrap(<TradingPreclearance today={day('2026-10-30')} live={{ ...base, state: 'ready' } as LivePreclearance} />);
    expect(screen.queryByText('No pre-clearance for you')).toBeNull();
  });
});

describe('PPL-33: how long each kind of data is kept', () => {
  const log = { enabled: true, company: 'Kaveri Foods', entries: [] };
  it('shows the company retention per class', () => {
    wrap(<MyDataScreen live={{ state: 'ready', onRetry: vi.fn(), onDownload: vi.fn(), log: { ...log, retention: { internal: 8, personal: 3, confidential: 8, special: 0 } } }} />);
    expect(screen.getByRole('columnheader', { name: 'How long' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Address, personal phone.*Exit \+ 3 years/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Joining date, grade.*Exit \+ 8 years/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Salary, bank account.*8 years \(pay and tax records\)/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Aadhaar.*Deleted when you leave/ })).toBeInTheDocument();
  });
  it('an older API without retention: no How long column', () => {
    wrap(<MyDataScreen live={{ state: 'ready', onRetry: vi.fn(), onDownload: vi.fn(), log }} />);
    expect(screen.queryByRole('columnheader', { name: 'How long' })).toBeNull();
  });
});

describe('PPL-12: the rehire impact in the Create drawer', () => {
  const VIEW: RehireView = {
    previous: { employeeCode: 'KF0077', joinedOn: '2019-04-01', exitedOn: '2025-02-14', exitType: 'resignation', rehireEligible: true, breakMonths: 20, sameEntityFy: false },
    options: [
      { key: 'code', label: 'Employee code', choices: ['reuse', 'new'], policy: 'reuse', value: 'reuse', overridden: false, reason: null, meaning: 'Keeps their old employee code.' },
      { key: 'gratuity', label: 'Gratuity service', choices: ['fresh', 'add_prior'], policy: 'fresh', value: 'fresh', overridden: false, reason: null, meaning: 'Gratuity service starts fresh.' },
    ],
    version: 0,
  };
  const ROW: ReadyRow = { id: 'o1', name: 'Suresh Nair', role: 'QA Analyst', dept: '', location: 'Hosur plant', entity: '', manager: '', source: 'Offer', personType: 'Ex-employee rehire', note: '', joining: day('2026-11-16'), offerAccepted: day('2026-10-20'), live: { offerId: 'o1', email: 'suresh@mail.test', internal: false } } as ReadyRow;
  const live = (o: Partial<LiveReady> = {}): LiveReady => ({
    state: 'ready',
    onRetry: vi.fn(),
    today: day('2026-10-30'),
    places: { entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd' }], locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }], departments: [], designations: [], employmentTypes: [], managers: [] },
    onCreate: vi.fn(async () => undefined),
    onJobChange: vi.fn(),
    onRehirePreview: vi.fn(async () => VIEW),
    ...o,
  });

  it('shows the policy per option for the chosen entity; a changed choice needs a reason, then goes with the create', async () => {
    const l = live();
    wrap(<ReadyToOnboardQueue rows={[ROW]} defaultOpenId="o1" live={l} />);
    const drawer = screen.getByRole('dialog');
    expect(await within(drawer).findByText('Everything follows company policy.')).toBeInTheDocument();
    expect(l.onRehirePreview).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), 'e1', '2026-11-16');
    expect(within(drawer).getByText(/Worked here 1 Apr 2019 to 14 Feb 2025 as KF0077 \(resignation\), a break of 20 months/)).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('combobox', { name: 'Gratuity service for this rehire' }));
    await ue.click(await screen.findByRole('option', { name: 'Add prior' }));
    expect(within(drawer).getByText('1 option differs from company policy. Give a reason below.')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('combobox', { name: 'Location' }));
    await ue.click(await screen.findByRole('option', { name: 'Hosur plant' }));
    await ue.click(within(drawer).getByRole('button', { name: 'Create and start pre-boarding' }));
    expect(within(drawer).getByText('Enter a reason. Changes from the policy are recorded.')).toBeInTheDocument();
    expect(l.onCreate).not.toHaveBeenCalled();
    await waitFor(() => expect(within(drawer).getByRole('textbox', { name: /Reason for changing the policy default/ })).toHaveFocus());
    await ue.type(within(drawer).getByRole('textbox', { name: /Reason for changing the policy default/ }), 'Agreed in the offer');
    await ue.click(within(drawer).getByRole('button', { name: 'Create and start pre-boarding' }));
    await waitFor(() => expect(l.onCreate).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), expect.objectContaining({ legalEntityId: 'e1', locationId: 'l1', joiningOn: '2026-11-16' }), { gratuity: { value: 'add_prior', reason: 'Agreed in the offer' } }));
  });

  it('a preview that fails still lets HR create; nothing changed sends no choices', async () => {
    const l = live({ onRehirePreview: vi.fn(async () => Promise.reject(new Error('No such legal entity.'))) });
    wrap(<ReadyToOnboardQueue rows={[ROW]} defaultOpenId="o1" live={l} />);
    const drawer = screen.getByRole('dialog');
    expect(await within(drawer).findByText(/No such legal entity\. You can still create the joiner/)).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('combobox', { name: 'Location' }));
    await ue.click(await screen.findByRole('option', { name: 'Hosur plant' }));
    await ue.click(within(drawer).getByRole('button', { name: 'Create and start pre-boarding' }));
    await waitFor(() => expect(l.onCreate).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined));
  });
});
