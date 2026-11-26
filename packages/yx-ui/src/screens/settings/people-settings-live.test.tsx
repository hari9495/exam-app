import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen, type LiveSettingsPage } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { PAY_SETTINGS, PEOPLE_SETTINGS, TIME_SETTINGS, timeSettingsChanges, timeSettingsPage, type TimeSettingsData } from './time-settings-live';
import { TIME_REGISTRY_SAMPLE } from './time-settings-sample';
import { allSettings } from './settings-logic';
import { RETIRED_PAGE_KEYS } from './retired-page-keys';
// S-7 moved the old Company rules, Access and privacy and Payroll rules settings onto drawn pages; these counts are the ones that had no screen at all.
const MOVED = new Set(Object.values(RETIRED_PAGE_KEYS).flat());
const unmoved = (keys: string[]) => keys.filter((k) => !MOVED.has(k));

// Settings S-4 (answers 1323, 1324): 2.7 Exit & lifecycle policies and 2.10 Audit & data retention with the company's
// settings that had no screen. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const LIMITS = { 'audit.retention_years': { min: 8, act: 'Companies (Accounts) Rules, 2014 r.3(1) with the Companies Act, 2013 s.128(5)' } };
const DATA: TimeSettingsData = { registry: TIME_REGISTRY_SAMPLE, company: { 'retirement.age': '60' }, elsewhere: { 'retirement.age': 1 }, limits: LIMITS, canEdit: true, canGuard: true, lastChange: null };
const page = (id: string, data = DATA) => timeSettingsPage(pageOf(id), data, new Set());
const show = (id: string, over: Partial<LiveSettingsPage> = {}, data = DATA) =>
  render(
    <ToastProvider>
      <SettingsPageScreen groups={SETTINGS_GROUPS} pageId={id} live={{ page: page(id, data), canEdit: data.canEdit, lastChange: null, onSave: vi.fn().mockResolvedValue(undefined), ...over }} />
    </ToastProvider>,
  );

describe('People settings (S-4): every hidden setting has a field', () => {
  it('the 15 lifecycle and audit settings that had no screen each sit on one drawn page, marked Starter default', () => {
    // 2.4 (S-6) holds new approval settings, not lifecycle ones that had no screen.
    const S4 = Object.fromEntries(Object.entries(PEOPLE_SETTINGS).filter(([id]) => id !== '2.4'));
    const keys = unmoved(Object.values(S4).flatMap((p) => p.settings.map((s) => s.key)));
    expect(keys).toHaveLength(21); // IT assets: 2.8's acknowledgement and recovery settings (2712), the warranty and contract alerts (2714), the licence alert (2718)
    const all = [...keys, ...Object.values(TIME_SETTINGS).flatMap((p) => p.settings.map((s) => s.key)), ...Object.values(PAY_SETTINGS).flatMap((p) => p.settings.map((s) => s.key))];
    expect(new Set(all).size).toBe(all.length);
    for (const [id, spec] of Object.entries(S4)) {
      const fields = allSettings(page(id));
      for (const s of spec.settings.filter((x) => !MOVED.has(x.key))) expect([s.key, fields.find((d) => d.key === s.key)?.starter]).toEqual([s.key, DATA.company[s.key] === undefined]);
    }
  });

  it('notice periods and the absconding timeline read as words; a dated setting says it applies from today; the retired Company rules page is no longer linked (S-7)', () => {
    const f = (key: string) => allSettings(page('2.7')).find((d) => d.key === key)!;
    expect(f('exit.notice.confirmed')).toMatchObject({ value: '30d', optionLabels: expect.objectContaining({ '30d': '30 days', '1m': '1 month', '3m': '3 months' }), helper: expect.stringMatching(/applies from today/) });
    expect(f('absconding.days').optionLabels).toMatchObject({ '3,7,14,21': 'Hold after 3 days, notices at 7 and 14, abandonment at 21' });
    expect(f('retirement.age')).toMatchObject({ value: '60', starter: false, scope: 'Company · own value at 1 place (Company rules)' });
    expect(page('2.7').related ?? []).toEqual([]);
    expect(allSettings(page('2.10')).find((d) => d.key === 'audit.retention_years')!.legal).toEqual({ value: 8, kind: 'min', statute: LIMITS['audit.retention_years'].act });
  });

  it('a change saves with its stored value', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show('2.7', { onSave });
    await screen.findByText('Rehire');
    await ue.click(screen.getByRole('combobox', { name: /Rehire: leave balance/ }));
    await ue.click(screen.getByRole('option', { name: 'Carry' }));
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(timeSettingsChanges(onSave.mock.calls[0]![0], DATA)).toEqual([{ key: 'rehire.leave', value: 'carry' }]);
  });

  it('negative: the audit log length is locked without the access key; without HR\'s settings key the page is view only', () => {
    expect(allSettings(page('2.10', { ...DATA, canGuard: false })).find((d) => d.key === 'audit.retention_years')!.locked).toMatch(/manages access/);
    show('2.7', {}, { ...DATA, canEdit: false });
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });
});
