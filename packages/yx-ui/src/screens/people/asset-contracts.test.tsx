import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AssetContractsScreen } from './asset-contracts';
import { AssetPageScreen } from './asset-page';
import { liveAssetPage } from './asset-page-samples';
import { CONTRACTS, liveContracts } from './it-asset-samples';

// IT assets part 3 (answer 2717, notice window 2714): asset contracts, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Asset contracts (live)', () => {
  it('lists active contracts with supplier, place, end, renewal, assets of the cap and value; one in its notice window says so', async () => {
    show(<AssetContractsScreen live={liveContracts()} />);
    const t = screen.getByRole('table', { name: 'Asset contracts' });
    expect(within(t).getByText('AMC-2026-014')).toBeInTheDocument();
    expect(within(t).getByText('Company-wide')).toBeInTheDocument();
    expect(within(t).getByText(/Give notice by 16 Nov 2026/)).toBeInTheDocument();
    expect(within(t).getByText('3 of 50')).toBeInTheDocument();
    expect(within(t).getByText('Renewed 2 times')).toBeInTheDocument();
    expect(within(t).getByRole('columnheader', { name: /Value/ })).toBeInTheDocument();
    expect(within(t).queryByText('SUP-2025-03')).toBeNull();
    await ue.click(screen.getByRole('radio', { name: 'Ended' }));
    expect(within(screen.getByRole('table', { name: 'Asset contracts' })).getByText('SUP-2025-03')).toBeInTheDocument();
  });

  it('a contract opens in a drawer with the assets it covers and a count of the rest; a tag opens the asset', async () => {
    const onOpenAsset = vi.fn();
    show(<AssetContractsScreen live={liveContracts({ onOpenAsset })} />);
    await ue.click(screen.getByRole('link', { name: 'AMC-2026-014' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText(/Tacit: renews by itself for another 12 months/)).toBeInTheDocument();
    expect(within(d).getByText('45 days · give notice by 16 Nov 2026')).toBeInTheDocument();
    expect(within(d).getByText('1 more asset is at places you do not look after.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('link', { name: 'LT-0419' }));
    expect(onOpenAsset).toHaveBeenCalledWith('a2');
  });

  it('add: required fields say so; the cap is checked; a good form sends the contract with its assets', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'k9' });
    show(<AssetContractsScreen live={liveContracts({ onSave })} />);
    await ue.click(screen.getByRole('button', { name: 'Add contract' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add contract' }));
    expect(await within(d).findByText('Choose the type.')).toBeInTheDocument();
    expect(within(d).getByText('Enter the contract number.')).toBeInTheDocument();
    expect(within(d).getByText('Choose the supplier.')).toBeInTheDocument();
    expect(within(d).getByText('Give the start date.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    const pick = async (name: string, option: string) => {
      await ue.click(within(d).getByRole('combobox', { name }));
      await ue.click(await screen.findByRole('option', { name: option }));
    };
    await pick('Type', 'Maintenance (AMC)');
    await pick('Supplier', 'Redington Ltd');
    await ue.type(within(d).getByRole('textbox', { name: /^Contract number/ }), 'AMC-27');
    await ue.type(within(d).getByRole('textbox', { name: /^Starts on/ }), '01/01/2027{Enter}');
    expect(within(d).getByText('Ends on 31 Dec 2027.')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /^Asset cap/ }), '1');
    await ue.click(within(d).getByRole('combobox', { name: 'Assets covered' }));
    await ue.click(await screen.findByRole('option', { name: 'LT-0418 · Dell Latitude 5440' }));
    await ue.click(await screen.findByRole('option', { name: 'LT-0419 · Dell Latitude 5440' }));
    await ue.keyboard('{Escape}');
    await ue.click(within(d).getByRole('radio', { name: 'Express' }));
    await ue.click(within(d).getByRole('button', { name: 'Add contract' }));
    expect(await within(d).findByText('It covers 2 assets; the cap is 1.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.clear(within(d).getByRole('textbox', { name: /^Asset cap/ }));
    await ue.click(within(d).getByRole('button', { name: 'Add contract' }));
    expect(onSave).toHaveBeenCalledWith(null, { kind: 'amc', number: 'AMC-27', supplierId: 's2', legalEntityId: 'e1', locationId: null, startsOn: '2027-01-01', months: 12, renewal: 'express', noticeDays: 30, supportHours: null, value: null, assetCap: null, assetIds: ['a1', 'a2'] });
  });

  it('edit sends the version and keeps the assets; a refusal stays in the drawer', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Someone else changed this contract. Reload it.'));
    show(<AssetContractsScreen live={liveContracts({ onSave })} />);
    await ue.click(screen.getByRole('link', { name: 'AMC-2026-014' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Edit contract' }));
    const d = await screen.findByRole('dialog', { name: /Edit AMC-2026-014/ });
    await ue.click(within(d).getByRole('button', { name: 'Save contract' }));
    expect(await within(d).findByText('Someone else changed this contract. Reload it.')).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith('k1', expect.objectContaining({ assetIds: ['a1', 'a2'], value: '185000.00', version: 2 }));
  });

  it('negative: view only has no Add or Edit; without money there is no Value column', async () => {
    show(<AssetContractsScreen live={liveContracts({ canAdd: false, money: false, rows: CONTRACTS.map((k) => ({ ...k, value: undefined, canManage: false })) })} />);
    expect(screen.queryByRole('button', { name: 'Add contract' })).toBeNull();
    expect(within(screen.getByRole('table', { name: 'Asset contracts' })).queryByRole('columnheader', { name: /Value/ })).toBeNull();
    await ue.click(screen.getByRole('link', { name: 'AMC-2026-014' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByRole('button', { name: 'Edit contract' })).toBeNull();
    expect(within(d).queryByText('Value')).toBeNull();
  });
});

describe('Asset page: Contracts tab (answer 2717)', () => {
  it('lists the contracts covering the device; the number opens the contract', async () => {
    const onOpenContract = vi.fn();
    show(<AssetPageScreen live={liveAssetPage({ onOpenContract })} />);
    await ue.click(screen.getByRole('tab', { name: 'Contracts (1)' }));
    await ue.click(screen.getByRole('link', { name: 'AMC-2026-014' }));
    expect(onOpenContract).toHaveBeenCalledWith('k1');
  });

  it('negative: none says so', async () => {
    show(<AssetPageScreen live={liveAssetPage({ data: { ...liveAssetPage().data!, contracts: [] } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Contracts (0)' }));
    expect(screen.getByText('No contracts you see cover this device.')).toBeInTheDocument();
  });
});
