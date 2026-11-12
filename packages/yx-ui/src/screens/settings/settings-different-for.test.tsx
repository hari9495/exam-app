import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { TIME_SETTINGS, timeSettingsOverrides, timeSettingsPage, type TimeSettingsData } from './time-settings-live';
import { TIME_REGISTRY_SAMPLE } from './time-settings-sample';
import { allSettings } from './settings-logic';

// Settings S-7 (answers 1484, 1562): "Different for" on the registry pages, and "Applies from" for dated settings.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const REG = {
  ...TIME_REGISTRY_SAMPLE,
  'leave.year_start_month': { ...TIME_REGISTRY_SAMPLE['leave.year_start_month']!, scopes: ['tenant', 'legal_entity'] },
};
const SCOPES = [
  { label: 'Kaveri Foods Pvt Ltd', type: 'legal_entity', id: 'e1' },
  { label: 'Kaveri Exports Ltd', type: 'legal_entity', id: 'e2' },
  { label: 'Hosur plant (location)', type: 'location', id: 'l1' },
];
const DATA: TimeSettingsData = { registry: REG, company: { 'leave.year_start_month': '1' }, elsewhere: {}, limits: {}, canEdit: true, canGuard: false, lastChange: null, scopes: SCOPES, byScope: { 'leave.year_start_month': [{ scope: 'Kaveri Exports Ltd', value: '4', validFrom: null }] } };
const LINKS = new Set(Object.values(TIME_SETTINGS).flatMap((p) => p.links));

describe('Different for (answer 1484)', () => {
  it('a setting lists where it may differ and the values of its own already set', () => {
    const page = timeSettingsPage(pageOf('3.9'), DATA, LINKS);
    const f = allSettings(page).find((d) => d.key === 'leave.year_start_month')!;
    expect(f.scopeable).toEqual(['Kaveri Foods Pvt Ltd', 'Kaveri Exports Ltd']);
    expect(f.overrides).toEqual([{ scope: 'Kaveri Exports Ltd', value: '4' }]);
    expect(page.scopes).toEqual(['Company', 'Kaveri Foods Pvt Ltd', 'Kaveri Exports Ltd']);
  });

  it('a first value of its own for an entity is saved for that entity only; the company value is untouched', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const page = timeSettingsPage(pageOf('3.9'), DATA, LINKS);
    render(<ToastProvider><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.9" live={{ page, canEdit: true, lastChange: null, onSave }} /></ToastProvider>);
    await ue.click(screen.getByRole('combobox', { name: /Apply changes to/ }));
    await ue.click(screen.getByRole('option', { name: 'Kaveri Foods Pvt Ltd' }));
    await ue.click(screen.getByRole('combobox', { name: /Leave year starts in/ }));
    await ue.click(screen.getByRole('option', { name: 'July' }));
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [values, , overrides] = onSave.mock.calls[0]!;
    expect(values).toEqual({});
    expect(overrides).toEqual([{ key: 'leave.year_start_month', scope: 'Kaveri Foods Pvt Ltd', value: '7' }]);
    expect(timeSettingsOverrides(overrides, DATA)).toEqual([{ key: 'leave.year_start_month', value: '7', scopeType: 'legal_entity', scopeId: 'e1' }]);
  });

  it('negative: a setting that may not differ by location stays one company value there', async () => {
    const page = timeSettingsPage(pageOf('3.9'), { ...DATA, byScope: {} }, LINKS);
    const f = allSettings(page).find((d) => d.key === 'leave.year_start_month')!;
    expect(f.scopeable).not.toContain('Hosur plant (location)');
    expect(timeSettingsOverrides([{ key: 'leave.year_start_month', scope: 'Nowhere', value: '7' }], DATA)).toEqual([]);
  });
});

describe('Applies from (answer 1562)', () => {
  it('a dated change offers Applies from and sends the day chosen', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const page = timeSettingsPage(pageOf('3.9'), DATA, LINKS);
    const dated = { ...page, sections: page.sections.map((s) => ({ ...s, settings: s.settings.map((d) => (d.key === 'leave.year_start_month' ? { ...d, dated: { validFrom: '2026-01-01' } } : d)) })) };
    render(<ToastProvider><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.9" live={{ page: dated, canEdit: true, lastChange: null, onSave, appliesFrom: { today: '2026-11-13' } }} /></ToastProvider>);
    expect(screen.queryByText('Applies from')).toBeNull();
    await ue.click(screen.getByRole('combobox', { name: /Leave year starts in/ }));
    await ue.click(screen.getByRole('option', { name: 'July' }));
    expect(await screen.findByText('Applies from')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![3]).toBe('2026-11-13');
  });
});
