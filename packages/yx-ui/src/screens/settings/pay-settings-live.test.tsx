import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen, type LiveSettingsPage } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { PAY_SETTINGS, TIME_SETTINGS, pendingOnPage, timeSettingsChanges, timeSettingsPage, type TimeSettingsData } from './time-settings-live';
import { TIME_REGISTRY_SAMPLE } from './time-settings-sample';
import { allSettings } from './settings-logic';
import { RETIRED_PAGE_KEYS } from './retired-page-keys';
// S-7 moved the old Company rules, Access and privacy and Payroll rules settings onto drawn pages; these counts are the ones that had no screen at all.
const MOVED = new Set(Object.values(RETIRED_PAGE_KEYS).flat());
const unmoved = (keys: string[]) => keys.filter((k) => !MOVED.has(k));

// Settings S-3 (answers 1323 to 1325): the Payroll & Statutory pages with the company's settings, the legal limits and a
// second person for every change. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const LIMITS = { 'payroll.document_retention_years': { min: 8, act: 'Companies Act, 2013 s.128(5)' }, 'payroll.standard_daily_hours': { max: 9, act: 'Factories Act, 1948 s.54' } };
const DATA: TimeSettingsData = { registry: TIME_REGISTRY_SAMPLE, company: { 'payroll.net_rounding': 'none' }, elsewhere: {}, limits: LIMITS, canEdit: true, canGuard: true, lastChange: null };
const page = (id: string, data = DATA) => timeSettingsPage(pageOf(id), data, new Set(['payslip.editor']));
const show = (id: string, over: Partial<LiveSettingsPage> = {}) =>
  render(
    <ToastProvider>
      <SettingsPageScreen groups={SETTINGS_GROUPS} pageId={id} live={{ page: page(id), canEdit: true, lastChange: null, onSave: vi.fn().mockResolvedValue(undefined), ...over }} />
    </ToastProvider>,
  );

describe('Payroll settings (S-3): every hidden setting has a field', () => {
  it('the 16 payroll and tax settings with no screen, the second-person switch and the lapse days, each sit on one drawn page', () => {
    const keys = unmoved(Object.values(PAY_SETTINGS).flatMap((p) => p.settings.map((s) => s.key)));
    expect(keys).toHaveLength(18); // 16 hidden, the second-person switch (1325) and the lapse days (1523)
    expect(new Set([...keys, ...unmoved(Object.values(TIME_SETTINGS).flatMap((p) => p.settings.map((s) => s.key)))]).size).toBe(18 + 41); // time has 41 since batch A item 7 (hourly permission)
    for (const [id, spec] of Object.entries(PAY_SETTINGS)) {
      const fields = allSettings(page(id));
      for (const s of spec.settings.filter((x) => !MOVED.has(x.key))) expect([s.key, fields.find((d) => d.key === s.key)?.starter]).toEqual([s.key, DATA.company[s.key] === undefined]);
    }
  });

  it('tax dates and amounts read as words; the layout editor link stays; the law shows on retention', () => {
    const f = (id: string, key: string) => allSettings(page(id)).find((d) => d.key === key)!;
    expect(f('4.5', 'tax.regime_cutoff').optionLabels).toMatchObject({ '05-31': '31 May', '04-30': '30 Apr' });
    expect(f('4.3', 'payroll.one_time_review_above').optionLabels).toMatchObject({ none: 'Never', '100000': '₹1,00,000' });
    expect(f('4.3', 'payroll.settings.second_person')).toMatchObject({ kind: 'toggle', value: true, starter: true });
    expect(f('4.4', 'payroll.document_retention_years').legal).toEqual({ value: 8, kind: 'min', statute: 'Companies Act, 2013 s.128(5)' });
    expect(allSettings(page('4.4')).map((d) => d.key)).toContain('payslip.editor');
  });
});

describe('Payroll settings (S-3): a second person (1325)', () => {
  it('with the switch on, saving sends the change for approval: the button, the summary and the toast say so', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show('4.5', { onSave, secondPerson: true });
    await ue.click(screen.getByRole('combobox', { name: /Tax proof cut-off/ }));
    await ue.click(screen.getByRole('option', { name: '15 Mar' }));
    await ue.click(screen.getAllByRole('button', { name: 'Send for approval' })[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Another person with HR's settings key approves them/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Affects \d+ employees/)).toBeNull();
    await ue.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(timeSettingsChanges(onSave.mock.calls[0]![0], DATA)).toEqual([{ key: 'tax.proof_cutoff', value: '03-15' }]);
    expect((await screen.findAllByText('Sent for approval')).length).toBeGreaterThan(0);
  });

  it('a waiting change: someone else approves or rejects it; the person who asked may only withdraw', async () => {
    const pending = pendingOnPage(page('4.3'), [
      { id: 'r1', key: 'payroll.net_rounding', scopeType: 'tenant', from: 'none', to: 'rupee', by: 'Lakshmi Venkatesan', at: '2026-11-12T09:30:00.000Z', mine: false },
      { id: 'r2', key: 'payroll.variance_threshold_pct', scopeType: 'tenant', from: null, to: '20', by: 'You', at: '2026-11-12T10:00:00.000Z', mine: true },
    ]);
    expect(pending.map((p) => [p.label, p.from, p.to])).toEqual([
      ['Round net pay', 'None', 'Rupee'],
      ['Ask to confirm a net pay change above (%)', '10', '20'],
    ]);
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const onReject = vi.fn().mockResolvedValue(undefined);
    show('4.3', { secondPerson: true, pending, onApprove, onReject });
    const card = screen.getByRole('region', { name: 'Waiting for a second person' });
    const [theirs, mine] = within(card).getAllByRole('listitem');
    expect(within(mine!).queryByRole('button', { name: 'Approve' })).toBeNull();
    await ue.click(within(mine!).getByRole('button', { name: 'Withdraw' }));
    expect(onReject).toHaveBeenCalledWith('r2');
    await ue.click(within(theirs!).getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledWith('r1');
    expect((await screen.findAllByText('Change approved and applied')).length).toBeGreaterThan(0);
  });

  it('negative: an approval the API refuses stays on the page', async () => {
    const pending = pendingOnPage(page('4.3'), [{ id: 'r1', key: 'payroll.net_rounding', scopeType: 'tenant', from: 'none', to: 'rupee', by: 'Lakshmi', at: '2026-11-12T09:30:00.000Z', mine: false }]);
    show('4.3', { secondPerson: true, pending, onApprove: vi.fn().mockRejectedValue(new Error('This change was already decided.')) });
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('This change was already decided.')).toBeInTheDocument();
  });

  it('with the switch off (or on any other live page), Save changes saves at once', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show('4.5', { onSave });
    await ue.click(screen.getByRole('combobox', { name: /Tax proof cut-off/ }));
    await ue.click(screen.getByRole('option', { name: '15 Mar' }));
    expect(screen.queryByRole('button', { name: 'Send for approval' })).toBeNull();
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });
});
