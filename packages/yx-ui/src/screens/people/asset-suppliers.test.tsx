import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AssetSuppliersScreen } from './asset-suppliers';
import { AssetPageScreen } from './asset-page';
import { liveAssetPage } from './asset-page-samples';
import { liveSuppliers } from './it-asset-samples';

// IT assets part 3 (answer 2716): the IT and Admin supplier list, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Asset suppliers (live)', () => {
  it('lists the active suppliers with their GSTIN, contacts and assets; Retired shows the retired ones', async () => {
    show(<AssetSuppliersScreen live={liveSuppliers()} />);
    const t = screen.getByRole('table', { name: 'Asset suppliers' });
    expect(within(t).getByText('Dell India Pvt Ltd')).toBeInTheDocument();
    expect(within(t).getByText('29AABCD1234E1Z5')).toBeInTheDocument();
    expect(within(t).getByText('Suresh Kumar · suresh.kumar@dell.example · +91 98450 12345')).toBeInTheDocument();
    expect(within(t).queryByText('Old Copier Co')).toBeNull();
    await ue.click(screen.getByRole('radio', { name: 'Retired' }));
    expect(within(screen.getByRole('table', { name: 'Asset suppliers' })).getByText('Old Copier Co')).toBeInTheDocument();
  });

  it('add: name required, a bad GSTIN and email say so; a good form sends the trimmed supplier and its contacts', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 's9' });
    show(<AssetSuppliersScreen live={liveSuppliers({ onSave })} />);
    await ue.click(screen.getByRole('button', { name: 'Add supplier' }));
    const d = await screen.findByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /^GSTIN/ }), '27aabci');
    await ue.type(within(d).getByRole('textbox', { name: /^Email/ }), 'neha@');
    await ue.click(within(d).getByRole('button', { name: 'Add supplier' }));
    expect(await within(d).findByText('Enter the supplier name.')).toBeInTheDocument();
    expect(within(d).getByText(/A GSTIN has 15 characters/)).toBeInTheDocument();
    expect(within(d).getByText('Enter the contact’s name.')).toBeInTheDocument();
    expect(within(d).getByText('Enter an email like name@company.com.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /^Name/ }), ' Ingram Micro India ');
    await ue.type(within(d).getByRole('textbox', { name: /^GSTIN/ }), '1234f1z9');
    await ue.type(within(d).getByRole('textbox', { name: /^Contact name/ }), 'Neha Joshi');
    await ue.type(within(d).getByRole('textbox', { name: /^Email/ }), 'ingram.example');
    await ue.click(within(d).getByRole('button', { name: 'Add supplier' }));
    expect(onSave).toHaveBeenCalledWith(null, { name: 'Ingram Micro India', gstin: '27AABCI1234F1Z9', contacts: [{ name: 'Neha Joshi', email: 'neha@ingram.example', phone: null }], notes: null });
    expect((await screen.findAllByText('Ingram Micro India saved.')).length).toBeGreaterThan(0);
  });

  it('edit: a second contact is removed, the supplier retired, with its version; a refusal keeps the drawer open', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Someone else changed this supplier. Reload it.')).mockResolvedValue({ id: 's1' });
    show(<AssetSuppliersScreen live={liveSuppliers({ onSave })} />);
    await ue.click(screen.getByRole('link', { name: 'Dell India Pvt Ltd' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Remove contact 2' }));
    await ue.click(within(d).getByRole('radio', { name: 'Retired' }));
    await ue.click(within(d).getByRole('button', { name: 'Save supplier' }));
    expect(await within(d).findByText('Someone else changed this supplier. Reload it.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Save supplier' }));
    expect(onSave).toHaveBeenLastCalledWith('s1', { name: 'Dell India Pvt Ltd', gstin: '29AABCD1234E1Z5', contacts: [{ name: 'Suresh Kumar', email: 'suresh.kumar@dell.example', phone: '+91 98450 12345' }], notes: 'Laptops and their on-site service.', retired: true, version: 3 });
  });

  it('negative (answer 2823): a site asset manager edits a supplier without Status; the save leaves its status as it is', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 's1' });
    show(<AssetSuppliersScreen live={liveSuppliers({ onSave, canRetire: false })} />);
    await ue.click(screen.getByRole('link', { name: 'Dell India Pvt Ltd' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByRole('radio', { name: 'Retired' })).toBeNull();
    expect(within(d).getByText('Active. Only company-wide asset managers retire or restore a supplier.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Save supplier' }));
    expect(onSave).toHaveBeenCalledWith('s1', expect.not.objectContaining({ retired: expect.anything() }));
    expect(onSave.mock.calls[0][1]).toMatchObject({ name: 'Dell India Pvt Ltd', version: 3 });
  });

  it('negative: without asset.manage there is no Add supplier and names are not links; a load error offers Retry', async () => {
    const { unmount } = show(<AssetSuppliersScreen live={liveSuppliers({ canManage: false })} />);
    expect(screen.queryByRole('button', { name: 'Add supplier' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Dell India Pvt Ltd' })).toBeNull();
    unmount();
    const onRetry = vi.fn();
    show(<AssetSuppliersScreen live={liveSuppliers({ state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Asset page: the supplier (answer 2716)', () => {
  it('Details shows the supplier; Edit details sends the picked supplier', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'a1' });
    show(<AssetPageScreen live={liveAssetPage({ onSave, suppliers: [{ value: 's1', label: 'Dell India Pvt Ltd' }, { value: 's2', label: 'Redington Ltd' }] })} />);
    expect(screen.getByText('Dell India Pvt Ltd')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Edit details' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('combobox', { name: 'Supplier' }));
    await ue.click(await screen.findByRole('option', { name: 'Redington Ltd' }));
    await ue.click(within(d).getByRole('button', { name: 'Save details' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ supplierId: 's2' }));
  });

  it('negative: without the supplier list the edit sends no supplier (it stays as it is)', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'a1' });
    show(<AssetPageScreen live={liveAssetPage({ onSave })} />);
    await ue.click(screen.getByRole('button', { name: 'Edit details' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByRole('combobox', { name: 'Supplier' })).toBeNull();
    await ue.click(within(d).getByRole('button', { name: 'Save details' }));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('supplierId');
  });
});
