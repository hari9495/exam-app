import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen, type LiveSettingsPage } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { TIME_SETTINGS, timeSettingsChanges, timeSettingsPage, type TimeSettingsData } from './time-settings-live';
import { TIME_REGISTRY_SAMPLE } from './time-settings-sample';
import { allSettings } from './settings-logic';
import { projectSettingsPage } from './projects-live';
import { RETIRED_PAGE_KEYS } from './retired-page-keys';
// S-7 moved the old Company rules, Access and privacy and Payroll rules settings onto drawn pages; these counts are the ones that had no screen at all.
const MOVED = new Set(Object.values(RETIRED_PAGE_KEYS).flat());
const unmoved = (keys: string[]) => keys.filter((k) => !MOVED.has(k));

// Settings S-2 (answers 1323, 1324): the drawn Time & Leave pages with the company's settings. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const LIMITS = { 'roster.max_weekly_hours': { max: 48, act: 'Factories Act, 1948 s.51' }, 'roster.min_weekly_offs': { min: 1, act: 'Factories Act, 1948 s.52' } };
const DATA: TimeSettingsData = { registry: TIME_REGISTRY_SAMPLE, company: { 'attendance.wfh_monthly_limit': '6' }, elsewhere: { 'roster.max_daily_hours': 2 }, limits: LIMITS, canEdit: true, canGuard: false, lastChange: null };
const ALL_LINKS = new Set(Object.values(TIME_SETTINGS).flatMap((p) => p.links));
const show = (id: string, over: Partial<LiveSettingsPage> = {}, data = DATA) =>
  render(
    <ToastProvider>
      <SettingsPageScreen groups={SETTINGS_GROUPS} pageId={id} live={{ page: timeSettingsPage(pageOf(id), data, ALL_LINKS), canEdit: data.canEdit, lastChange: null, onSave: vi.fn().mockResolvedValue(undefined), ...over }} />
    </ToastProvider>,
  );

describe('Time & Leave settings (S-2): every hidden setting has a field', () => {
  it('the 40 settings that had no screen each sit on exactly one drawn page, with the starter value marked', () => {
    const keys = unmoved(Object.values(TIME_SETTINGS).flatMap((p) => p.settings.map((s) => s.key)));
    // 39 here; 3.11's one (timesheet.tool_suggestions) is on the Projects settings page, the one live 3.11.
    expect(keys).toHaveLength(39);
    expect(new Set(keys).size).toBe(39);
    expect(TIME_SETTINGS['3.11']).toBeUndefined();
    // The one 3.11 is Projects' page: its pre-fill switch is owned by the projects API since P-3 (answer 1409).
    const v = { 'projects.enabled': 'on', 'timesheet.tool_suggestions': 'off' };
    const projects = projectSettingsPage(pageOf('3.11'), { canEdit: true, values: v, defaults: v, choices: {}, lastChange: null });
    expect(allSettings(projects).find((d) => d.key === 'prj.prefill_enabled')).toMatchObject({ kind: 'toggle', value: false, starter: true });
    for (const [id, spec] of Object.entries(TIME_SETTINGS)) {
      const fields = allSettings(timeSettingsPage(pageOf(id), DATA, ALL_LINKS));
      for (const s of spec.settings.filter((x) => !MOVED.has(x.key))) {
        const f = fields.find((d) => d.key === s.key);
        expect([s.key, Boolean(f)]).toEqual([s.key, true]);
        expect([s.key, f!.starter]).toEqual([s.key, DATA.company[s.key] === undefined]);
      }
    }
  });

  it('values come in the shape of the field: toggles, several choices, months; a guarded one is locked without the access key', () => {
    const f = (id: string, key: string) => allSettings(timeSettingsPage(pageOf(id), DATA, ALL_LINKS)).find((d) => d.key === key)!;
    expect(f('3.5', 'attendance.wfh_same_day')).toMatchObject({ kind: 'toggle', value: true });
    expect(f('3.2', 'kiosk.methods')).toMatchObject({ kind: 'multiselect', value: ['pin', 'qr'] });
    expect(f('3.9', 'leave.year_start_month')).toMatchObject({ kind: 'select', value: '1', optionLabels: expect.objectContaining({ '4': 'April' }) });
    expect(f('3.5', 'attendance.wfh_monthly_limit')).toMatchObject({ value: '6', starter: false });
    expect(f('3.2', 'attendance.phone_binding').locked).toMatch(/manages access/);
    expect(allSettings(timeSettingsPage(pageOf('3.2'), { ...DATA, canGuard: true }, ALL_LINKS)).find((d) => d.key === 'attendance.phone_binding')!.locked).toBeUndefined();
    expect(f('3.3', 'roster.max_daily_hours').scope).toBe('Company · own value at 2 places (Company rules)');
    expect(timeSettingsChanges({ 'attendance.wfh_same_day': false, 'kiosk.methods': ['face', 'pin'], 'leave.year_start_month': '4' }, DATA)).toEqual([
      { key: 'attendance.wfh_same_day', value: 'off' },
      { key: 'kiosk.methods', value: 'face,pin' },
      { key: 'leave.year_start_month', value: '4' },
    ]);
  });

  it('the drawn editor links stay only where the viewer may open the editor', () => {
    const keys = (links: Set<string>) => allSettings(timeSettingsPage(pageOf('3.3'), DATA, links)).map((d) => d.key);
    expect(keys(ALL_LINKS)).toEqual(expect.arrayContaining(['shift.editor', 'roster.editor']));
    expect(keys(new Set())).not.toContain('shift.editor');
  });
});

describe('Time & Leave settings (S-2): legal limits (1324)', () => {
  it('the page shows the legal maximum and the Act, and refuses a value past it (field error, nothing saved)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show('3.3', { onSave });
    expect(screen.getByText('Legal maximum: 48 (Factories Act, 1948 s.51)')).toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: /Most hours of shifts in a week/ }));
    await ue.click(screen.getByRole('option', { name: '54' }));
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findAllByText('Choose 48 or less. The law sets this maximum (Factories Act, 1948 s.51).')).length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a more generous value (45 hours a week) is saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show('3.3', { onSave });
    await ue.click(screen.getByRole('combobox', { name: /Most hours of shifts in a week/ }));
    await ue.click(screen.getByRole('option', { name: '45' }));
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(timeSettingsChanges(onSave.mock.calls[0]![0], DATA)).toEqual([{ key: 'roster.max_weekly_hours', value: '45' }]);
  });

  it('a floor: no weekly off is refused, naming the Act', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show('3.4', { onSave });
    await ue.click(screen.getByRole('combobox', { name: /Weekly offs each week at least/ }));
    await ue.click(screen.getByRole('option', { name: '0' }));
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findAllByText('Choose 1 or more. The law sets this minimum (Factories Act, 1948 s.52).')).length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('negative: without the settings key the page is view only (no save)', () => {
    show('3.5', {}, { ...DATA, canEdit: false });
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(within(document.body).getAllByText('Starter default').length).toBeGreaterThan(0);
  });
});
