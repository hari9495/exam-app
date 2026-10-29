import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CountryPacksScreen, type LiveCountryPacks } from './country-packs';
import type { NecSummary, PackStatus } from './live/types-5i';

// PAY-51 · Country packs: the designed screen with the live page's data.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const UAE = (on: boolean): PackStatus => ({
  country: 'AE',
  needed: true,
  switchedOn: on,
  manifest: { version: '2026-v1', currency: 'AED', requires: ['AE.WPS'], settings: [{ key: 'establishmentId', label: 'Employer establishment id', pattern: '\\d{13}' }] },
  missing: on ? [] : ['Employer establishment id'],
  settings: {},
});
const US: PackStatus = { country: 'US', needed: true, switchedOn: true, manifest: { version: '2026-v1', currency: 'USD', requires: [], settings: [] }, missing: [], settings: {} };
const NEC: NecSummary = { year: 2026, threshold: '600', rows: [{ consultantId: 'k1', name: 'Jordan Lee', paid: '5400.00', due: true, w9: false, tin: null }, { consultantId: 'k2', name: 'Sam Rivera', paid: '1200.00', due: true, w9: true, tin: '•••••4321' }] };
const packs = (o: Partial<LiveCountryPacks> = {}): LiveCountryPacks => ({
  state: 'ready',
  onRetry: vi.fn(),
  entities: [{ id: 'e1', name: 'Kaveri Foods FZE', shortName: 'KF FZE', keys: [] }],
  entityId: 'e1',
  onEntity: vi.fn(),
  status: UAE(false),
  nec: null,
  year: 2026,
  onYear: vi.fn(),
  today: '2026-10-29',
  onSwitchOn: vi.fn(async () => ({})),
  onEosb: vi.fn(async () => ({ total: '4200.00', rows: [{ employeeId: 'p1', accrued: '0', monthly: '4200' }] })),
  onNecFile: vi.fn(async () => ({})),
  onNecCopy: vi.fn(async () => ({})),
  onW9: vi.fn(async () => ({})),
  onSearch: vi.fn(async () => [{ id: 'p1', name: 'Lakshmi Devi', employeeCode: 'GW-014' }]),
  onWpsIds: vi.fn(async () => ({})),
  runs: [{ id: 'run1', label: 'Payroll · 2026-09' }],
  onWpsFile: vi.fn(async () => ({})),
  ...o,
});
const dialog = (name: RegExp) => screen.findByRole('dialog', { name }).catch(() => screen.findByRole('alertdialog', { name }));

describe('Country packs (PAY-51 live)', () => {
  it('switching on checks each setting against the pack, then sends them', async () => {
    const live = packs();
    render(<CountryPacksScreen live={live} />);
    expect(screen.getByText('Not switched on')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Switch on' }));
    const dlg = await dialog(/Switch on the UAE pack/);
    await ue.click(within(dlg).getByRole('button', { name: 'Switch on' }));
    expect(await within(dlg).findByText('Employer establishment id: check the format.')).toBeInTheDocument();
    expect(live.onSwitchOn).not.toHaveBeenCalled();
    await ue.type(within(dlg).getByLabelText(/Employer establishment id/), '1234567890123');
    await ue.click(within(dlg).getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(live.onSwitchOn).toHaveBeenCalledWith({ establishmentId: '1234567890123' }));
  });

  it('UAE: the WPS file needs an approved payroll; the provision needs a month', async () => {
    const live = packs({ status: UAE(true) });
    render(<CountryPacksScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Make the WPS file' }));
    expect(await screen.findByText('Choose an approved payroll.')).toBeInTheDocument();
    expect(live.onWpsFile).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /Approved payroll/ }));
    await ue.click(await screen.findByRole('option', { name: 'Payroll · 2026-09' }));
    await ue.click(screen.getByRole('button', { name: 'Make the WPS file' }));
    await waitFor(() => expect(live.onWpsFile).toHaveBeenCalledWith('run1'));
    await ue.click(screen.getByRole('button', { name: 'Work out the provision' }));
    expect(await screen.findByText('Choose the month.')).toBeInTheDocument();
    expect(live.onEosb).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /Month/ }));
    await ue.click(await screen.findByRole('option', { name: 'Oct 2026' }));
    await ue.click(screen.getByRole('button', { name: 'Work out the provision' }));
    await waitFor(() => expect(live.onEosb).toHaveBeenCalledWith('2026-10'));
    expect(await screen.findByText('4200.00 AED')).toBeInTheDocument();
  });

  it('UAE: WPS ids pressed too early show every field error', async () => {
    const live = packs({ status: UAE(true) });
    render(<CountryPacksScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Record WPS ids' }));
    const dlg = await dialog(/WPS ids/);
    await ue.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('Choose the person.')).toBeInTheDocument();
    expect(within(dlg).getByText('A UAE IBAN: AE and 21 digits.')).toBeInTheDocument();
    expect(live.onWpsIds).not.toHaveBeenCalled();
  });

  it('US: a missing W-9 is recorded first; a contractor with a W-9 gets the recipient copy', async () => {
    const live = packs({ status: US, nec: NEC });
    render(<CountryPacksScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Recipient copy' }));
    expect(live.onNecCopy).toHaveBeenCalledWith('k2');
    await ue.click(screen.getByRole('radio', { name: '2025' }));
    expect(live.onYear).toHaveBeenCalledWith(2025);
    await ue.click(screen.getByRole('button', { name: 'Record W-9' }));
    const dlg = await dialog(/W-9 for Jordan Lee/);
    await ue.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(await within(dlg).findByText('The TIN is 9 digits (no dashes).')).toBeInTheDocument();
    expect(live.onW9).not.toHaveBeenCalled();
  });

  it('India needs nothing; no entity chosen; error with retry; no access', async () => {
    const { unmount } = render(<CountryPacksScreen live={packs({ status: { country: 'IN', needed: false, switchedOn: false, manifest: null, missing: [], settings: {} } })} />);
    expect(screen.getByText(/Indian legal entities use the India rules/)).toBeInTheDocument();
    unmount();
    const u2 = render(<CountryPacksScreen live={packs({ entityId: null, status: null })} />);
    expect(screen.getByText('No legal entity chosen')).toBeInTheDocument();
    u2.unmount();
    const live = packs({ state: 'error' });
    const u3 = render(<CountryPacksScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(live.onRetry).toHaveBeenCalled();
    u3.unmount();
    render(<CountryPacksScreen live={packs({ state: 'no-access' })} />);
    expect(screen.getByText(/You don't have access to country packs/)).toBeInTheDocument();
  });
});
