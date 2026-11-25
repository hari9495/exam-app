import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { IssuedLettersRegister, type LiveLetters } from './documents';
import { MyDataScreen, PreclearanceQueue, TradingPreclearance, type LiveMyData, type LivePreclearance, type LivePreclearanceQueue } from './selfservice';
import { InternationalBankTab, PayTab, type LiveIntlBank } from './record';
import type { Letter } from './live/types';

// The last People rows made live (people-design-map, feat/yukthix-people-last): PPL-28 held letters, PPL-33 Request a
// correction and Nominate someone, PPL-44 the trading window, PPL-46 split pay.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const dialog = () => within(screen.getByRole('dialog'));

describe('PPL-28 held letters', () => {
  const held: Letter = { id: 'h1', title: 'Relieving letter: Neha Ghosh', letterType: 'relieving', personId: 'p5', person: 'Neha Ghosh', referenceNo: null, verifyCode: null, status: 'held', renderError: null, issuedAt: null, personSigns: false, acceptedAt: null, signature: null, supersededById: null, hold: { reason: 'Held until clearance is done.', by: 'Lakshmi Venkatesan', at: '2026-10-31T12:30:00Z' } };
  const live = (over: Partial<LiveLetters> = {}): LiveLetters => ({ state: 'ready', onRetry: vi.fn(), rows: [held], verifyUrl: (c) => c, onDownload: vi.fn(), onRelease: vi.fn(async () => {}), ...over });

  it('shows Held; Release says who held it, when and why, then releases', async () => {
    const l = live();
    render(<ToastProvider><IssuedLettersRegister rows={[]} live={l} /></ToastProvider>);
    expect(screen.getAllByText('Held').length).toBeGreaterThan(0);
    await ue.click(within(screen.getByRole('row', { name: /Neha Ghosh/ })).getByRole('button', { name: /More actions/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Release letter' }));
    expect(dialog().getByText('Lakshmi Venkatesan')).toBeInTheDocument();
    expect(dialog().getByText('31 Oct 2026')).toBeInTheDocument();
    expect(dialog().getByText('Held until clearance is done.')).toBeInTheDocument();
    await ue.click(dialog().getByRole('button', { name: 'Release letter' }));
    expect(l.onRelease).toHaveBeenCalledWith(held);
  });

  it('no Release without the action (a viewer who cannot issue letters)', async () => {
    render(<ToastProvider><IssuedLettersRegister rows={[]} live={live({ onRelease: undefined })} /></ToastProvider>);
    expect(within(screen.getByRole('row', { name: /Neha Ghosh/ })).queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
  });
});

describe('PPL-33 my data', () => {
  const log = { enabled: true, company: 'Kaveri Foods', retention: { internal: 8, personal: 3, confidential: 8, special: 1 }, entries: [] };
  const page = (over: Partial<LiveMyData> = {}) => {
    const live: LiveMyData = { state: 'ready', onRetry: vi.fn(), log, onDownload: vi.fn(async () => {}), onCorrect: vi.fn(async () => {}), nominee: null, onNominate: vi.fn(async () => {}), onRemoveNominee: vi.fn(async () => {}), ...over };
    render(<ToastProvider><MyDataScreen live={live} /></ToastProvider>);
    return live;
  };

  it('Request a correction: pressed too early says what is missing; filled, it goes to HR', async () => {
    const live = page();
    await ue.click(screen.getByRole('button', { name: 'Request a correction' }));
    await ue.click(dialog().getByRole('button', { name: 'Send to HR' }));
    expect(dialog().getByText('Choose what is wrong.')).toBeInTheDocument();
    expect(dialog().getByText('Say what is wrong and what it should be.')).toBeInTheDocument();
    expect(live.onCorrect).not.toHaveBeenCalled();
    await ue.click(dialog().getByRole('combobox', { name: 'What is wrong' }));
    await ue.click(await screen.findByRole('option', { name: 'Joining date, grade, birthday' }));
    await ue.type(dialog().getByRole('textbox', { name: /What it should be/ }), 'Joined 6 Jan, not 7 Jan');
    await ue.click(dialog().getByRole('button', { name: 'Send to HR' }));
    expect(live.onCorrect).toHaveBeenCalledWith({ correctionField: 'internal', correctionText: 'Joined 6 Jan, not 7 Jan' });
  });

  it('Nominate someone: a name, a relation and an email or phone; a bad phone is refused; the nominee then shows', async () => {
    const live = page();
    await ue.click(screen.getByRole('button', { name: 'Nominate someone' }));
    await ue.type(dialog().getByRole('textbox', { name: /Full name/ }), 'Lakshmi Iyer');
    await ue.type(dialog().getByRole('textbox', { name: /Relation to you/ }), 'Sister');
    await ue.click(dialog().getByRole('button', { name: 'Save nominee' }));
    expect(dialog().getByText('Give an email or a phone number to reach them.')).toBeInTheDocument();
    await ue.type(dialog().getByRole('textbox', { name: /Phone/ }), '12');
    await ue.click(dialog().getByRole('button', { name: 'Save nominee' }));
    expect(dialog().getByText('Enter 8 to 15 digits, with + and the country code if abroad.')).toBeInTheDocument();
    await ue.clear(dialog().getByRole('textbox', { name: /Phone/ }));
    await ue.type(dialog().getByRole('textbox', { name: /Phone/ }), '+91 98450 12345');
    await ue.click(dialog().getByRole('button', { name: 'Save nominee' }));
    expect(live.onNominate).toHaveBeenCalledWith({ name: 'Lakshmi Iyer', relation: 'Sister', phone: '+919845012345' });
  });

  it('shows the nominee with Remove (asked first)', async () => {
    const live = page({ nominee: { name: 'Ravi Iyer', relation: 'Brother', email: null, phone: '+919845012345', since: '2026-11-01T10:00:00Z' } });
    expect(screen.getByText('Your nominee: Ravi Iyer (Brother)')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Remove nominee' }));
    await ue.click(dialog().getByRole('button', { name: 'Remove nominee' }));
    expect(live.onRemoveNominee).toHaveBeenCalled();
  });
});

describe('PPL-44 trading window', () => {
  const rules = { threshold: 1000000, validDays: 7, decideDays: 2 };
  it('closed: the person sees why and until when; Request is refused without calling the API; the rule text is whole', async () => {
    const live: LivePreclearance = { state: 'ready', onRetry: vi.fn(), rules, requests: [], onRequest: vi.fn(async () => {}), onUploadNote: vi.fn(), onReport: vi.fn(), window: { endsOn: new Date(2026, 9, 16), reopensOn: new Date(2026, 9, 17), reason: 'Quarterly results due' } };
    render(<ToastProvider><TradingPreclearance today={new Date(2026, 9, 5)} live={live} /></ToastProvider>);
    expect(screen.getByText('Trading window closed until 16 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText(/never during a closed trading window/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Request pre-clearance' }));
    expect((await screen.findAllByText(/reopens on 17 Oct 2026/)).length).toBeGreaterThan(0);
    expect(live.onRequest).not.toHaveBeenCalled();
  });

  it('the officer closes the window for a period; pressed too early it says what is missing; Remove asks first', async () => {
    const windows = { rows: [{ id: 'w1', startsOn: new Date(2026, 9, 1), endsOn: new Date(2026, 9, 16), reason: 'Quarterly results due' }], onClose: vi.fn(async () => {}), onRemove: vi.fn(async () => {}) };
    const live: LivePreclearanceQueue = { state: 'ready', onRetry: vi.fn(), rules, rows: [], onDecide: vi.fn(), windows };
    render(<ToastProvider><PreclearanceQueue live={live} /></ToastProvider>);
    expect(screen.getByText('Quarterly results due')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Close the window' }));
    await ue.click(dialog().getByRole('button', { name: 'Close the window' }));
    expect(dialog().getByText('Choose the first closed day.')).toBeInTheDocument();
    expect(dialog().getByText('Say why the window is closed.')).toBeInTheDocument();
    expect(windows.onClose).not.toHaveBeenCalled();
    await ue.click(dialog().getByRole('button', { name: 'Cancel' }));
    await ue.click(screen.getByRole('button', { name: 'Remove' }));
    await ue.click(dialog().getByRole('button', { name: 'Remove' }));
    expect(windows.onRemove).toHaveBeenCalledWith('w1');
  });
});

describe('PPL-46 split pay', () => {
  const accounts = [
    { account: 'salary', label: 'Salary account · HDFC0001234 · XXXX 2333' },
    { account: 'abroad', label: 'Account abroad · XXXX 3456 · AED' },
  ];
  const intl = (over: Partial<NonNullable<LiveIntlBank['split']>> = {}): LiveIntlBank => ({
    name: 'Arjun Kulkarni',
    current: { country: 'AE', iban: 'XXXX 3456', bic: 'ECBKAEAD', currency: 'AED', usableFrom: new Date(2026, 0, 1) },
    waiting: false,
    onSend: vi.fn(async () => {}),
    onCancel: vi.fn(),
    split: { accounts, current: null, waiting: false, net: 49812, onSend: vi.fn(async () => {}), ...over },
  });

  it('a split above net pay shows the designed message and is not sent', async () => {
    const live = intl();
    render(<ToastProvider><InternationalBankTab persona="hr" splits={[]} net={0} live={live} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Add account' }));
    const value = screen.getByLabelText(/Value for Account abroad/);
    await ue.clear(value);
    await ue.type(value, '60000');
    expect(screen.getByText("This split can't be saved")).toBeInTheDocument();
    expect(screen.getAllByText('Fixed amounts and percentages are more than the net pay.').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(live.split!.onSend).not.toHaveBeenCalled();
  });

  it('a split that fits is sent for approval, the account abroad untouched when no IBAN is typed', async () => {
    const live = intl();
    render(<ToastProvider><InternationalBankTab persona="hr" splits={[]} net={0} live={live} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Add account' }));
    const value = screen.getByLabelText(/Value for Account abroad/);
    await ue.clear(value);
    await ue.type(value, '2500');
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(live.split!.onSend).toHaveBeenCalledWith([{ account: 'salary', rule: 'remainder', value: 0 }, { account: 'abroad', rule: 'fixed', value: 2500 }]);
    expect(live.onSend).not.toHaveBeenCalled();
  });

  it('nothing changed: Send says what to do', async () => {
    const live = intl();
    render(<ToastProvider><InternationalBankTab persona="hr" splits={[]} net={0} live={live} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect((await screen.findAllByText('Enter a new IBAN, or change the split, then send it.')).length).toBeGreaterThan(0);
    expect(live.split!.onSend).not.toHaveBeenCalled();
  });

  it('the Pay tab shows the account abroad and the split read only, with Change', async () => {
    const onChange = vi.fn();
    const live = intl({ current: { lines: [{ account: 'abroad', rule: 'remainder', value: 0 }, { account: 'salary', rule: 'fixed', value: 2500 }], usableFrom: new Date(2026, 0, 1) }, onSend: undefined });
    const pay = { kind: 'shown' as const, currency: 'INR', ctc: 600000, from: new Date(2026, 3, 1), next: null, lastNet: { amount: 49812, note: 'Oct 2026' }, taxRegime: null, lines: [], outside: [], banks: [] };
    render(<ToastProvider><PayTab pay={pay as never} name="Arjun" persona="hr" self={false} access={null} intl={live} onChangeAbroad={onChange} /></ToastProvider>);
    expect(screen.getByText('Bank accounts (international)')).toBeInTheDocument();
    expect(screen.getByText('The rest')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add account' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Change' }));
    expect(onChange).toHaveBeenCalled();
  });
});
