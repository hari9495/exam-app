import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { timeSettingsPage, type TimeSettingsData } from './time-settings-live';
import { TIME_REGISTRY_SAMPLE } from './time-settings-sample';
import { allSettings } from './settings-logic';
import { AssetCategoryDrawer, assetSettingsPage, type AssetCategoryRow } from './asset-settings-live';

// IT assets part 1 (answer 2712): Settings 2.8 Assets made live. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '2.8')!;
const DATA: TimeSettingsData = { registry: TIME_REGISTRY_SAMPLE, company: {}, elsewhere: {}, limits: {}, canEdit: true, canGuard: false, lastChange: null };
const ROWS: AssetCategoryRow[] = [
  { id: 'c1', name: 'Laptop', trackedBy: 'Serial number', defaultRecovery: '45000.00', usefulLifeYears: 3, tagPrefix: 'LAP', tagYear: true, tagDigits: 4, nextTag: 'LAP-2026-0042', assets: 2, version: 1 },
  { id: 'c4', name: 'Tools', trackedBy: null, defaultRecovery: null, usefulLifeYears: null, tagPrefix: null, tagYear: false, tagDigits: 4, nextTag: null, assets: 0, version: 1 },
];
const page = (canEdit = true, data = DATA) => assetSettingsPage(timeSettingsPage(design, data, new Set()), design, ROWS, canEdit);

describe('2.8 Assets live', () => {
  it('the company list comes first, then the acknowledgement (no E-sign yet) and the recovery basis, at their starter values', () => {
    const p = page();
    expect(p.sections.map((s) => s.title)).toEqual(['Categories', 'Issue and return', 'Warranty', 'Contracts', 'Licences', 'Bookings']);
    // Answer 2715: bookings up to 14 days by default; no approval by default.
    expect(allSettings(p).find((d) => d.key === 'asset.booking_max_days')).toMatchObject({ kind: 'radio', value: '14', options: ['1', '3', '7', '14', '30'], helper: expect.stringMatching(/3 months/) });
    expect(allSettings(p).find((d) => d.key === 'asset.booking_approval')).toMatchObject({ kind: 'toggle', value: false, helper: expect.stringMatching(/approves or declines/) });
    // Answer 2718: 30 days before a licence expires by default; off tells nobody.
    expect(allSettings(p).find((d) => d.key === 'asset.licence_alert_days')).toMatchObject({ kind: 'radio', value: '30', options: ['off', '7', '15', '30', '60', '90'], helper: expect.stringMatching(/before it expires/) });
    // Answer 2714 (contracts): on the notice date by default; off tells nobody.
    expect(allSettings(p).find((d) => d.key === 'asset.contract_alert_days')).toMatchObject({ kind: 'radio', value: '0', options: ['off', '0', '7', '15', '30'], helper: expect.stringMatching(/tacit contract renews itself/) });
    // Answer 2714: the warranty alert, 30 days before by default; off tells nobody.
    expect(allSettings(p).find((d) => d.key === 'asset.warranty_alert_days')).toMatchObject({ kind: 'radio', value: '30', options: ['off', '7', '15', '30', '60', '90'], helper: expect.stringMatching(/told once/) });
    const f = (k: string) => allSettings(p).find((d) => d.key === k)!;
    expect(f('asset.categories').rows).toEqual([['Laptop', 'Serial number', '₹45,000', 'Straight line, 3 years', 'LAP-2026-0042', '2'], ['Tools', '—', 'Asset cost', 'None', 'Typed by hand', '0']]);
    expect(f('asset.ack_method')).toMatchObject({ kind: 'radio', value: 'click', options: ['click', 'none'], starter: true, helper: expect.stringMatching(/E-sign comes when/) });
    expect(f('asset.recovery_to_fnf')).toMatchObject({ kind: 'toggle', value: true });
    expect(f('asset.recovery_basis')).toMatchObject({ kind: 'radio', value: 'category_default', helper: expect.stringMatching(/net book value on the day/) });
  });

  it('negative: the drawn sample rows never show live; without the settings key the list is view only', () => {
    const p = page(false);
    const list = allSettings(p).find((d) => d.key === 'asset.categories')!;
    expect(list.readOnlyList).toBe(true);
    expect(list.rows!.map((r) => r[0])).not.toContain('Safety shoes and PPE kit');
    render(<ToastProvider><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.8" live={{ page: p, canEdit: false, lastChange: null, onSave: vi.fn() }} /></ToastProvider>);
    expect(screen.queryByRole('button', { name: 'Add asset category' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'E-sign' })).toBeNull();
  });

  it('adding a category sends the name, what it is tracked by, the recovery and the useful life; a toast says it is done', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'n' });
    render(<ToastProvider><AssetCategoryDrawer initial={null} onClose={() => {}} onSave={onSave} /></ToastProvider>);
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Name/ }), 'Tablet');
    await ue.type(within(d).getByRole('textbox', { name: /Tracked by/ }), 'Serial number');
    await ue.type(within(d).getByRole('textbox', { name: /Default recovery/ }), '20000');
    await ue.type(within(d).getByRole('textbox', { name: /Useful life/ }), '3');
    await ue.click(within(d).getByRole('button', { name: 'Add category' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Tablet', trackedBy: 'Serial number', defaultRecovery: '20000.00', usefulLifeYears: 3, tagPrefix: null, tagYear: true, tagDigits: 4, depreciationMethod: 'straight_line', depreciationRate: null }));
    expect((await screen.findAllByText('Category added')).length).toBeGreaterThan(0);
  });

  it('negative: no name, or a useful life over 50 years, is not sent; a refusal is shown in the drawer', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Another category already has that name.'));
    render(<ToastProvider><AssetCategoryDrawer initial={null} onClose={() => {}} onSave={onSave} /></ToastProvider>);
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Useful life/ }), '60');
    await ue.click(within(d).getByRole('button', { name: 'Add category' }));
    expect(within(d).getByText('Give the category a name of at least 2 characters.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Name/ }), 'Phone');
    await ue.clear(within(d).getByRole('textbox', { name: /Useful life/ }));
    await ue.click(within(d).getByRole('button', { name: 'Add category' }));
    expect(await within(d).findByText('Another category already has that name.')).toBeInTheDocument();
  });

  it('2720: a tag pattern is the prefix, the year if wanted and the counter digits; the helper shows how tags look', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'n' });
    render(<ToastProvider><AssetCategoryDrawer initial={null} onClose={() => {}} onSave={onSave} /></ToastProvider>);
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Name/ }), 'Tablet');
    expect(within(d).queryByRole('checkbox', { name: /Add the year/ })).toBeNull();
    await ue.type(within(d).getByRole('textbox', { name: /Tag prefix/ }), 'tab');
    await ue.click(within(d).getByRole('checkbox', { name: /Add the year/ }));
    await ue.click(within(d).getByRole('radio', { name: '3' }));
    expect(within(d).getByText(/suggests tags like TAB-001/)).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Add category' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tagPrefix: 'TAB', tagYear: false, tagDigits: 3 })));
  });

  it('negative (2720): a prefix with a dash or space is not sent', async () => {
    const onSave = vi.fn();
    render(<ToastProvider><AssetCategoryDrawer initial={null} onClose={() => {}} onSave={onSave} /></ToastProvider>);
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Name/ }), 'Tablet');
    await ue.type(within(d).getByRole('textbox', { name: /Tag prefix/ }), 'TA B');
    await ue.click(within(d).getByRole('button', { name: 'Add category' }));
    expect(within(d).getByText('Use up to 12 letters or digits, for example LAP.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('2713: declining balance sends the yearly rate; straight line is the default and sends none', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'n' });
    render(<ToastProvider><AssetCategoryDrawer initial={null} onClose={() => {}} onSave={onSave} /></ToastProvider>);
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('radio', { name: 'Straight line' })).toHaveAttribute('aria-checked', 'true');
    expect(within(d).queryByRole('textbox', { name: /Yearly rate/ })).toBeNull();
    await ue.type(within(d).getByRole('textbox', { name: /Name/ }), 'Server');
    await ue.click(within(d).getByRole('radio', { name: 'Declining balance' }));
    await ue.type(within(d).getByRole('textbox', { name: /Yearly rate/ }), '40');
    await ue.click(within(d).getByRole('button', { name: 'Add category' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Server', depreciationMethod: 'declining', depreciationRate: '40.00' })));
  });

  it('negative (2713): declining balance without a rate, or a rate of 100, is not sent', async () => {
    const onSave = vi.fn();
    render(<ToastProvider><AssetCategoryDrawer initial={null} onClose={() => {}} onSave={onSave} /></ToastProvider>);
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Name/ }), 'Server');
    await ue.click(within(d).getByRole('radio', { name: 'Declining balance' }));
    await ue.click(within(d).getByRole('button', { name: 'Add category' }));
    expect(within(d).getByText('Enter the yearly rate, for example 40.')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /Yearly rate/ }), '100');
    await ue.click(within(d).getByRole('button', { name: 'Add category' }));
    expect(within(d).getAllByText(/Enter a rate above 0 and below 100|Enter a value between 0.01 and 99.99/).length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a category in use is retired, never deleted (the drawer says assets keep it)', async () => {
    const onRetire = vi.fn().mockResolvedValue({ ok: true });
    render(<ToastProvider><AssetCategoryDrawer initial={ROWS[0]!} onClose={() => {}} onSave={vi.fn()} onRetire={onRetire} /></ToastProvider>);
    const d = screen.getByRole('dialog');
    expect(within(d).getByText(/Assets already in it keep it/)).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: /Delete/ })).toBeNull();
    await ue.click(within(d).getByRole('button', { name: 'Retire' }));
    await waitFor(() => expect(onRetire).toHaveBeenCalled());
  });
});
