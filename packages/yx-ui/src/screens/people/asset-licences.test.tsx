import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AssetLicencesScreen } from './asset-licences';
import { AssetPageScreen } from './asset-page';
import { liveAssetPage } from './asset-page-samples';
import { LICENCES, liveLicences } from './it-asset-samples';
import { MyAssetsScreen } from './live/exits';

// IT assets part 4 (answer 2718): software licences and their seats, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Software licences (live)', () => {
  it('lists current licences with seats in use of bought: over quota in red, all in use in amber; expired ones apart', async () => {
    show(<AssetLicencesScreen live={liveLicences()} />);
    const t = screen.getByRole('table', { name: 'Software licences' });
    expect(within(t).getByText('4 of 3')).toBeInTheDocument();
    expect(within(t).getByText('Over quota by 1').closest('[data-tone]')).toHaveAttribute('data-tone', 'danger');
    expect(within(t).getByText('All in use').closest('[data-tone]')).toHaveAttribute('data-tone', 'warning');
    expect(within(t).getByText('Company-wide')).toBeInTheDocument();
    expect(within(t).getByText('Does not expire')).toBeInTheDocument();
    expect(within(t).getByRole('columnheader', { name: /Cost/ })).toBeInTheDocument();
    expect(within(t).queryByText('Adobe Acrobat Pro 2024')).toBeNull();
    await ue.click(screen.getByRole('radio', { name: 'Expired' }));
    expect(within(screen.getByRole('table', { name: 'Software licences' })).getByText('Adobe Acrobat Pro 2024')).toBeInTheDocument();
  });

  it('a licence opens with its seats: a leaver is marked, a device tag opens the asset, the rest are counted', async () => {
    const onOpenAsset = vi.fn();
    show(<AssetLicencesScreen live={liveLicences({ onOpenAsset })} />);
    await ue.click(screen.getByRole('link', { name: 'Microsoft 365 E3' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText('4 seats are in use: 1 more than the 3 bought.')).toBeInTheDocument();
    expect(within(d).getByText('Leaving: on their clearance')).toBeInTheDocument();
    expect(within(d).getByText('1 more seat is on devices at places you do not look after.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('link', { name: 'LT-0418' }));
    expect(onOpenAsset).toHaveBeenCalledWith('a1');
  });

  it('free a seat: asks first, sends the reason, toast', async () => {
    const onFreeSeat = vi.fn().mockResolvedValue({ ok: true });
    show(<AssetLicencesScreen live={liveLicences({ onFreeSeat })} />);
    await ue.click(screen.getByRole('link', { name: 'Tally Prime' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Free seat' }));
    const c = await screen.findByRole('dialog', { name: /Free the seat of Meera Iyer/ });
    await ue.type(within(c).getByRole('textbox', { name: /^Reason/ }), 'Moved to Zoho Books');
    await ue.click(within(c).getByRole('button', { name: 'Free seat' }));
    expect(onFreeSeat).toHaveBeenCalledWith('l3', 'q6', 'Moved to Zoho Books');
    expect((await screen.findAllByText('Seat freed: Tally Prime.')).length).toBeGreaterThan(0);
  });

  it('give a seat to a person or a device; nobody chosen says so', async () => {
    const onGiveSeat = vi.fn().mockResolvedValue({ id: 'q9' });
    show(<AssetLicencesScreen live={liveLicences({ onGiveSeat })} />);
    await ue.click(screen.getByRole('link', { name: 'Tally Prime' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Give a seat' }));
    const d = await screen.findByRole('dialog', { name: /Give a seat of Tally Prime/ });
    await ue.click(within(d).getByRole('button', { name: 'Give seat' }));
    expect(await within(d).findByText('Choose the person.')).toBeInTheDocument();
    expect(onGiveSeat).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('radio', { name: 'A device' }));
    await ue.click(within(d).getByRole('combobox', { name: 'Device' }));
    await ue.click(await screen.findByRole('option', { name: 'LT-0419 · Dell Latitude 5440' }));
    await ue.click(within(d).getByRole('button', { name: 'Give seat' }));
    expect(onGiveSeat).toHaveBeenCalledWith('l3', { assetId: 'a2' });
  });

  it('negative: every seat in use without over quota refuses before sending; with over quota it warns and sends', async () => {
    const onGiveSeat = vi.fn().mockResolvedValue({ id: 'q9' });
    const { unmount } = show(<AssetLicencesScreen rows={LICENCES} today="2026-11-26" giving="l2" />);
    let d = await screen.findByRole('dialog', { name: /Give a seat of AutoCAD 2026/ });
    await ue.click(within(d).getByRole('button', { name: 'Give seat' }));
    expect(await within(d).findByText('Free a seat, add seats, or allow over quota on the licence.')).toBeInTheDocument();
    unmount();
    show(<AssetLicencesScreen live={liveLicences({ onGiveSeat, open: 'l1' })} />);
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Give a seat' }));
    d = await screen.findByRole('dialog', { name: /Give a seat of Microsoft 365 E3/ });
    expect(within(d).getByText('All 3 seats are in use. This seat goes over quota.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('combobox', { name: 'Person' }));
    await ue.click(await screen.findByRole('option', { name: 'Kavya Reddy' }));
    await ue.click(within(d).getByRole('button', { name: 'Give seat' }));
    expect(onGiveSeat).toHaveBeenCalledWith('l1', { employeeId: 'p3' });
  });

  it('a refusal from the server stays in the give drawer', async () => {
    const onGiveSeat = vi.fn().mockRejectedValue(new Error('This person already has a seat of this licence.'));
    show(<AssetLicencesScreen live={liveLicences({ onGiveSeat, open: 'l3' })} />);
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Give a seat' }));
    const d = await screen.findByRole('dialog', { name: /Give a seat/ });
    await ue.click(within(d).getByRole('combobox', { name: 'Person' }));
    await ue.click(await screen.findByRole('option', { name: 'Meera Iyer' }));
    await ue.click(within(d).getByRole('button', { name: 'Give seat' }));
    expect(await within(d).findByText('This person already has a seat of this licence.')).toBeInTheDocument();
  });

  it('add: required fields say so; a good form sends the licence', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'l9' });
    show(<AssetLicencesScreen live={liveLicences({ onSave })} />);
    await ue.click(screen.getByRole('button', { name: 'Add licence' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add licence' }));
    expect(await within(d).findByText('Enter the software.')).toBeInTheDocument();
    expect(within(d).getByText('Enter 1 to 100000 seats.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /^Software/ }), 'Zoho Books');
    await ue.type(within(d).getByRole('textbox', { name: /^Seats/ }), '25');
    await ue.type(within(d).getByRole('textbox', { name: /^Expires on/ }), '31/03/2027{Enter}');
    await ue.click(within(d).getByRole('checkbox', { name: /Allow over quota/ }));
    await ue.click(within(d).getByRole('button', { name: 'Add licence' }));
    expect(onSave).toHaveBeenCalledWith(null, { software: 'Zoho Books', softwareVersion: null, supplierId: null, legalEntityId: 'e1', locationId: null, seats: 25, expiresOn: '2027-03-31', cost: null, allowOverQuota: true });
  });

  it('negative: fewer seats than in use without over quota is refused; edit sends the version', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'l2' });
    show(<AssetLicencesScreen live={liveLicences({ onSave, open: 'l2' })} />);
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Edit licence' }));
    const d = await screen.findByRole('dialog', { name: /Edit AutoCAD 2026/ });
    const seats = within(d).getByRole('textbox', { name: /^Seats/ });
    await ue.clear(seats);
    await ue.type(seats, '1');
    await ue.click(within(d).getByRole('button', { name: 'Save licence' }));
    expect(await within(d).findByText('2 seats are in use. Keep at least 2, or allow over quota.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.clear(seats);
    await ue.type(seats, '4');
    await ue.click(within(d).getByRole('button', { name: 'Save licence' }));
    expect(onSave).toHaveBeenCalledWith('l2', expect.objectContaining({ seats: 4, cost: '310000.00', allowOverQuota: false, version: 1 }));
  });

  it('negative: view only has no Add, Give, Free or Edit; without money there is no Cost', async () => {
    show(<AssetLicencesScreen live={liveLicences({ canAdd: false, money: false, rows: LICENCES.map((l) => ({ ...l, cost: undefined, canManage: false })) })} />);
    expect(screen.queryByRole('button', { name: 'Add licence' })).toBeNull();
    expect(within(screen.getByRole('table', { name: 'Software licences' })).queryByRole('columnheader', { name: /Cost/ })).toBeNull();
    await ue.click(screen.getByRole('link', { name: 'Microsoft 365 E3' }));
    const d = await screen.findByRole('dialog');
    for (const b of ['Edit licence', 'Give a seat', 'Free seat']) expect(within(d).queryByRole('button', { name: b })).toBeNull();
    expect(within(d).queryByText('Cost')).toBeNull();
  });
});

describe('Asset page: Licences tab (answer 2718)', () => {
  it('lists the seats on the device; an expired licence says so; the name opens the licence', async () => {
    const onOpenLicence = vi.fn();
    show(<AssetPageScreen live={liveAssetPage({ onOpenLicence })} />);
    await ue.click(screen.getByRole('tab', { name: 'Licences (2)' }));
    const t = screen.getByRole('table', { name: 'Licence seats on this device' });
    expect(within(t).getByText('Expired')).toBeInTheDocument();
    await ue.click(within(t).getByRole('link', { name: 'Microsoft 365 E3' }));
    expect(onOpenLicence).toHaveBeenCalledWith('l1');
  });

  it('negative: none says so', async () => {
    show(<AssetPageScreen live={liveAssetPage({ data: { ...liveAssetPage().data!, licences: [] } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Licences (0)' }));
    expect(screen.getByText('No licence seats you see are on this device.')).toBeInTheDocument();
  });
});

describe('My assets: my software licences (answer 2718)', () => {
  it('lists the seats given to me; none: no licences table', () => {
    const { unmount } = show(<MyAssetsScreen state="ready" rows={[]} onAcknowledge={() => Promise.resolve()} seats={[{ seatId: 'q1', software: 'Microsoft 365', softwareVersion: 'E3', expiresOn: '2027-03-31', givenOn: '2026-11-03' }]} />);
    expect(within(screen.getByRole('table', { name: 'My software licences' })).getByText('Microsoft 365 E3')).toBeInTheDocument();
    unmount();
    show(<MyAssetsScreen state="ready" rows={[]} onAcknowledge={() => Promise.resolve()} seats={[]} />);
    expect(screen.queryByRole('table', { name: 'My software licences' })).toBeNull();
  });
});
