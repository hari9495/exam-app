import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ClraRegistersScreen, type ClraRegistersData, type LiveClraRegisters } from './contract';

// CL-6 (CLB-04, answers 629, 630): the contract labour registers and the annual return. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const data = (over: Partial<ClraRegistersData> = {}): ClraRegistersData => ({
  month: '2026-10', canMake: true, establishments: [{ id: 'hsr', name: 'Hosur plant' }],
  registers: [
    { id: 'r1', type: 'clra_contractors', locationId: 'hsr', location: 'Hosur plant', formatVersion: 'osh-2025-v1', version: 1, status: 'generated', rows: 2 },
    { id: 'r2', type: 'clra_workmen', locationId: 'hsr', location: 'Hosur plant', formatVersion: 'osh-2025-v1', version: 1, status: 'frozen', rows: 5 },
  ],
  waiting: [{ locationId: 'hsr', contractors: ['Sri Lakshmi'] }],
  attendanceWaiting: [{ locationId: 'hsr', contractors: ['Sri Lakshmi', 'Vetri'] }],
  chart: { months: ['2026-09', '2026-10'], series: [{ name: 'Hosur plant', values: [4, 5] }] }, ...over,
});
const live = (over: Partial<LiveClraRegisters> = {}): LiveClraRegisters => ({
  state: 'ready', onRetry: vi.fn(), month: '2026-10', months: [{ value: '2026-10', label: 'Oct 2026' }, { value: '2026-09', label: 'Sep 2026' }], onMonth: vi.fn(), data: data(), canSign: true,
  onMake: vi.fn(async () => undefined), onDownload: vi.fn(async () => undefined), onFreeze: vi.fn(async () => undefined), onSign: vi.fn(async () => undefined),
  returns: {
    state: 'ready', year: 2025, years: [2025, 2024], onYear: vi.fn(), onDraft: vi.fn(async () => undefined), onFiled: vi.fn(async () => undefined),
    data: { year: 2025, canFile: true, daysNote: 'Days from the wage registers', returns: [{ locationId: 'hsr', location: 'Hosur plant', title: 'Annual return of the principal employer', due: '2026-02-15', figures: { contractors: 2, workers: 9, maxWorkersOnADay: 7, daysWorked: 1460, wagesPaid: '912000.00' }, filed: null }] },
  },
  ...over,
});

describe('CLB-04 registers (live)', () => {
  it('lists the month’s registers and what waits for a contractor; freeze and sign go to the register', async () => {
    const l = live();
    show(<ClraRegistersScreen live={l} />);
    expect(screen.getByText('Register of contractors')).toBeInTheDocument();
    // Answer 781: the muster waits for confirmed attendance, the wages for the wage register.
    expect(screen.getByText('Waiting for attendance of 2 contractors')).toBeInTheDocument();
    expect(screen.getByText('Waiting for 1 contractor')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Freeze' }));
    await waitFor(() => expect(l.onFreeze).toHaveBeenCalledWith('r1'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await ue.upload(input, new File(['%PDF'], 'signed.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(l.onSign).toHaveBeenCalledWith('r2', expect.any(File)));
    await ue.click(screen.getAllByRole('button', { name: 'PDF' })[0]!);
    expect(l.onDownload).toHaveBeenCalledWith('r1');
  });

  it('without the signing key: no Freeze or Sign; a reader cannot make registers', () => {
    show(<ClraRegistersScreen live={live({ canSign: false, data: data({ canMake: false }) })} />);
    expect(screen.queryByRole('button', { name: 'Freeze' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sign with DSC')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make registers' })).not.toBeInTheDocument();
  });

  it('making a new version over existing registers needs a reason; a refusal shows', async () => {
    const l = live({ onMake: vi.fn(async () => { throw new Error('Make a month’s registers after the month ends.'); }) });
    show(<ClraRegistersScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Make registers' }));
    const d = screen.getByRole('dialog', { name: /Make the Oct 2026 registers/ });
    await ue.click(within(d).getByRole('button', { name: 'Make registers' }));
    expect(l.onMake).not.toHaveBeenCalled();
    expect(within(d).getAllByText('Say why a new version is needed.').length).toBeGreaterThan(0);
    await ue.type(within(d).getByLabelText(/Why a new version/), 'Wage register corrected');
    await ue.click(within(d).getByRole('button', { name: 'Make registers' }));
    await waitFor(() => expect(l.onMake).toHaveBeenCalledWith('hsr', 'Wage register corrected'));
    expect(await within(d).findByText('Make a month’s registers after the month ends.')).toBeInTheDocument();
  });
});

describe('CLB-04 annual return (live)', () => {
  it('the drafted figures, the draft PDF and recording the filing (day and reference required)', async () => {
    const l = live();
    show(<ClraRegistersScreen live={l} tab="returns" />);
    expect(screen.getByText('Annual return of the principal employer 2025 · Hosur plant')).toBeInTheDocument();
    expect(screen.getByText('1,460')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open draft' }));
    expect(l.returns.onDraft).toHaveBeenCalledWith('hsr', 2025);
    await ue.click(screen.getByRole('button', { name: 'Record filing' }));
    const d = screen.getByRole('dialog', { name: /Record the 2025 return as filed/ });
    await ue.click(within(d).getByRole('button', { name: 'Record filing' }));
    expect(l.returns.onFiled).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Filed on/), '10/02/2026');
    await ue.type(within(d).getByLabelText(/Portal reference/), 'CLC/TN/2026/00417');
    await ue.click(within(d).getByRole('button', { name: 'Record filing' }));
    await waitFor(() => expect(l.returns.onFiled).toHaveBeenCalledWith('hsr', 2025, { filedOn: '2026-02-10', reference: 'CLC/TN/2026/00417' }));
  });

  it('a filed return shows its day and reference and cannot be recorded again', () => {
    const l = live();
    l.returns.data!.returns[0]!.filed = { on: '2026-02-10', reference: 'CLC/TN/2026/00417' };
    show(<ClraRegistersScreen live={l} tab="returns" />);
    expect(screen.getByText(/Filed on 10 Feb 2026 · CLC\/TN\/2026\/00417/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record filing' })).not.toBeInTheDocument();
  });
});
