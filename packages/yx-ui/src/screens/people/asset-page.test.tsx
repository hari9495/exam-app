import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AssetPageScreen } from './asset-page';
import { ASSET_PAGE, liveAssetPage } from './asset-page-samples';

// IT assets plan (26 Nov 2026): the asset page, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Asset page (live)', () => {
  it('details: maker, model, invoice and the warranty end; the history tab lists who did what', async () => {
    show(<AssetPageScreen live={liveAssetPage()} />);
    expect(screen.getByRole('heading', { name: 'Dell Latitude 5440' })).toBeInTheDocument();
    expect(screen.getByText('Latitude 5440 (i5, 16 GB)')).toBeInTheDocument();
    expect(screen.getByText('DL/25-26/1187')).toBeInTheDocument();
    expect(screen.getByText(/36 months · ends 14 Aug 2028/)).toBeInTheDocument();
    expect(screen.getByText(/Arjun Nair since 2 Sept? 2026 · confirmed/)).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'History' }));
    const h = screen.getByLabelText('Asset history');
    expect(within(h).getByText(/took it back from Meera Iyer/)).toBeInTheDocument();
    expect(within(h).getByText(/added the asset/)).toBeInTheDocument();
  });

  it('edit details: the name is required; a bad warranty says so; saving sends every field', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'a1' });
    show(<AssetPageScreen live={liveAssetPage({ onSave })} />);
    await ue.click(screen.getByRole('button', { name: 'Edit details' }));
    const d = await screen.findByRole('dialog');
    const name = within(d).getByRole('textbox', { name: /^Name/ });
    await ue.clear(name);
    await ue.click(within(d).getByRole('button', { name: 'Save details' }));
    expect(await within(d).findByText('Enter the name.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(name, 'Dell Latitude 5440 (spare)');
    const model = within(d).getByRole('textbox', { name: /^Model/ });
    await ue.clear(model);
    await ue.type(model, 'Latitude 5440');
    await ue.click(within(d).getByRole('button', { name: 'Save details' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Dell Latitude 5440 (spare)', serial: '7QK2X93', maker: 'Dell', model: 'Latitude 5440', purchasedOn: '2025-08-14', cost: '84500.00', invoiceNumber: 'DL/25-26/1187', warrantyMonths: 36 });
    expect((await screen.findAllByText(/saved\./)).length).toBeGreaterThan(0);
  });

  it('a refused save shows the server message and keeps the drawer open', async () => {
    show(<AssetPageScreen live={liveAssetPage({ onSave: vi.fn().mockRejectedValue(new Error('Someone else changed this asset. Reload it.')) })} />);
    await ue.click(screen.getByRole('button', { name: 'Edit details' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save details' }));
    expect(await within(d).findByText('Someone else changed this asset. Reload it.')).toBeInTheDocument();
  });

  it('without asset.manage there is no Edit details; an ended warranty says ended', () => {
    show(<AssetPageScreen live={liveAssetPage({ data: { ...ASSET_PAGE, canManage: false, asset: { ...ASSET_PAGE.asset, warrantyEndsOn: '2025-01-01' } } })} />);
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
    expect(screen.getAllByText(/ended 1 Jan 2025|Ended 1 Jan 2025/).length).toBeGreaterThan(0);
  });

  it('IT assets part 1 (2712): the category is picked from the company list in Edit details and sent by id', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'a1' });
    const categories = [{ value: 'c1', label: 'Laptop' }, { value: 'c2', label: 'Tablet' }];
    show(<AssetPageScreen live={liveAssetPage({ onSave, categories, data: { ...ASSET_PAGE, asset: { ...ASSET_PAGE.asset, categoryId: 'c1' } } })} />);
    await ue.click(screen.getByRole('button', { name: 'Edit details' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('combobox', { name: 'Category' }));
    await ue.click(screen.getByRole('option', { name: 'Tablet' }));
    await ue.click(within(d).getByRole('button', { name: 'Save details' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'c2', name: 'Dell Latitude 5440' }));
  });

  it('2713: the net book value today, how it is worked out, and that it is not the tax books', () => {
    show(<AssetPageScreen live={liveAssetPage()} />);
    expect(screen.getByText('Net book value today')).toBeInTheDocument();
    expect(screen.getByText('₹48,340.33')).toBeInTheDocument();
    expect(screen.getByText(/Straight line over 3 years · a management figure, not the tax books/)).toBeInTheDocument();
  });

  it('negative (2713): no value without a purchase date, and the page says what is missing', () => {
    show(<AssetPageScreen live={liveAssetPage({ data: { ...ASSET_PAGE, asset: { ...ASSET_PAGE.asset, purchasedOn: null, netBookValue: null } } })} />);
    expect(screen.getByText('Needs the cost and the purchase date')).toBeInTheDocument();
    expect(screen.queryByText('₹48,340.33')).toBeNull();
  });

  it('negative (2711): without money the Cost line is not shown at all', () => {
    show(<AssetPageScreen live={liveAssetPage({ data: { ...ASSET_PAGE, canManage: false, money: false, asset: { ...ASSET_PAGE.asset, cost: undefined } } })} />);
    expect(screen.queryByText('Cost')).toBeNull();
    expect(screen.queryByText(/84,500/)).toBeNull();
    expect(screen.queryByText('Net book value today')).toBeNull();
    expect(screen.queryByText(/management figure/)).toBeNull();
    expect(screen.getByText('Invoice number')).toBeInTheDocument();
  });

  it('no access, error with retry, and loading', async () => {
    const onRetry = vi.fn();
    const { unmount } = show(<AssetPageScreen live={liveAssetPage({ state: 'no-access', data: null })} />);
    expect(screen.queryByText('Dell Latitude 5440')).toBeNull();
    unmount();
    show(<AssetPageScreen live={liveAssetPage({ state: 'error', data: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
