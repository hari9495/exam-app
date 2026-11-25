import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SETTINGS_GROUPS } from './settings-groups';
import { FlexComponentSheet, fbpSettingsChanges, fbpSettingsPage, type FbpSettingsData } from './benefits-live';

// Settings 4.11 FBP live (B8/E5, answers 2406, 2407, 2411).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '4.11')!;
const DATA: FbpSettingsData = {
  components: [
    { id: 'f1', code: 'phone', name: 'Phone and internet', monthlyAmount: '1500.00', taxableIfUnclaimed: true, expenseCategoryCode: 'phone_internet', active: true, version: 1 },
    { id: 'f2', code: 'books', name: 'Books', monthlyAmount: '1000.00', taxableIfUnclaimed: false, expenseCategoryCode: null, active: false, version: 3 },
  ],
  unclaimed: 'pay',
  categories: [{ code: 'phone_internet', name: 'Phone and internet' }],
  lastChange: null,
};

describe('Settings 4.11 · flexible benefits (live)', () => {
  it('only the FBP list and the unclaimed choice, with the company’s values (no sample rows)', () => {
    const page = fbpSettingsPage(design, DATA);
    const settings = page.sections.flatMap((s) => s.settings);
    expect(settings.map((s) => s.key)).toEqual(['ben.fbp_heads', 'ben.fbp_sweep']);
    expect(settings[0]!.rows).toEqual([
      ['Phone and internet', expect.stringMatching(/1,500/), 'Phone and internet', 'Paid as taxable salary', 'Offered'],
      ['Books', expect.stringMatching(/1,000/), 'Not linked yet', 'Lapses', 'Switched off'],
    ]);
    expect(settings[1]).toMatchObject({ kind: 'radio', value: 'pay', starter: true, options: ['pay', 'carry'] });
    expect(fbpSettingsChanges({ 'ben.fbp_sweep': 'carry' })).toEqual([{ key: 'benefits.fbp.unclaimed', value: 'carry' }]);
    expect(fbpSettingsChanges({ 'ben.fbp_sweep': 'Pay as taxable salary in March' })).toEqual([]);
  });

  it('add: pressed too early shows the first missing field and keeps focus there; then sends the component', async () => {
    const onSave = vi.fn(async () => ({}));
    render(
      <ToastProvider>
        <FlexComponentSheet initial={null} categories={DATA.categories} onClose={() => undefined} onSave={onSave} />
      </ToastProvider>,
    );
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add component' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(within(d).getByRole('textbox', { name: /Name/ })).toHaveFocus();
    expect(within(d).getByText(/Enter the name people see/)).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /Name/ }), 'Fuel');
    await ue.type(within(d).getByRole('textbox', { name: /Code/ }), 'fuel');
    await ue.type(within(d).getByRole('textbox', { name: /Entitlement a month/ }), '0');
    await ue.click(within(d).getByRole('button', { name: 'Add component' }));
    expect(within(d).getByRole('textbox', { name: /Entitlement a month/ })).toHaveFocus();
    await ue.clear(within(d).getByRole('textbox', { name: /Entitlement a month/ }));
    await ue.type(within(d).getByRole('textbox', { name: /Entitlement a month/ }), '3300');
    await ue.click(within(d).getByRole('radio', { name: 'Lapses' }));
    await ue.click(within(d).getByRole('button', { name: 'Add component' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ code: 'fuel', name: 'Fuel', monthlyAmount: '3300', taxableIfUnclaimed: false, expenseCategoryCode: null }));
  });

  it('change: the code is fixed; switching off and the version are sent', async () => {
    const onSave = vi.fn(async () => ({}));
    render(
      <ToastProvider>
        <FlexComponentSheet initial={DATA.components[0]!} categories={DATA.categories} onClose={() => undefined} onSave={onSave} />
      </ToastProvider>,
    );
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('textbox', { name: /Code/ })).toBeDisabled();
    await ue.click(within(d).getByRole('radio', { name: 'Switched off' }));
    await ue.click(within(d).getByRole('button', { name: 'Save component' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ code: 'phone', name: 'Phone and internet', monthlyAmount: '1500.00', taxableIfUnclaimed: true, expenseCategoryCode: 'phone_internet', active: false, version: 1 }));
  });
});
