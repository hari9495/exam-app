import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { MappingRulesScreen, type LiveMappingRules } from './projects-billing';
import { ProjectDrawer } from './projects-drawers';
import { LIVE_PROJECT_CHOICES } from './projects-live-fixtures';
import { LIVE_MAPPING_DATA, LIVE_MAPPING_TEST, ruleProblems } from './mapping-live';
import { projectSettingsChanges, projectSettingsPage } from '../settings/projects-live';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// Projects P-3 (PRJ-08, answers 1409, 1410): the designed mapping rules page with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const live = (over: Partial<LiveMappingRules> = {}): LiveMappingRules => ({ state: 'ready', data: LIVE_MAPPING_DATA, onSwitchPrefill: vi.fn().mockResolvedValue(undefined), onSave: vi.fn().mockResolvedValue(undefined), onRemove: vi.fn().mockResolvedValue(undefined), onTest: vi.fn().mockResolvedValue(LIVE_MAPPING_TEST), ...over });

describe('PRJ-08 Timesheet mapping rules (live)', () => {
  it('lists the rules in priority order with the live tool names; a rule that cannot apply says why', () => {
    show(<MappingRulesScreen live={live()} />);
    expect(screen.getByText('NRPWEB-*')).toBeInTheDocument();
    expect(screen.getAllByText('Issue tracker').length).toBeGreaterThan(0);
    expect(screen.getByText('Not applying: CLL-WMS is not active')).toBeInTheDocument();
    expect(screen.queryByText(/Jira|GitHub/)).toBeNull();
  });

  it('pre-fill off: no rules, no test or add; only a System Admin gets the switch', async () => {
    const l = live({ data: { ...LIVE_MAPPING_DATA, prefillOn: false } });
    const { unmount } = show(<MappingRulesScreen live={l} />);
    expect(screen.getByText('Timesheet pre-fill is off.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add rule' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test against last week' })).toBeNull();
    await ue.click(screen.getByRole('switch', { name: /Pre-fill timesheets/ }));
    expect(l.onSwitchPrefill).toHaveBeenCalledWith(true);
    unmount();
    show(<MappingRulesScreen live={live({ data: { ...LIVE_MAPPING_DATA, canSwitchPrefill: false } })} />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(/A System Admin switches it/)).toBeInTheDocument();
  });

  it('Save rule pressed empty says what is missing and sends nothing (never disabled)', async () => {
    const l = live({ defaultEdit: 'new' });
    show(<MappingRulesScreen live={l} />);
    const save = screen.getByRole('button', { name: 'Save rule' });
    expect(save).toBeEnabled();
    await ue.click(save);
    expect((await screen.findAllByText('Choose the project.')).length).toBeGreaterThan(0);
    expect(l.onSave).not.toHaveBeenCalled();
  });

  it('changes a rule with its version; switching off keeps everything else', async () => {
    const l = live();
    show(<MappingRulesScreen live={l} />);
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[0]!);
    await ue.click(await screen.findByRole('menuitem', { name: 'Switch off' }));
    expect(l.onSave).toHaveBeenCalledWith('r1', { source: 'issues', pattern: 'NRPWEB-*', projectId: 'p1', taskId: 't1', priority: 1, enabled: false, version: 1 });
  });

  it('deletes only after asking', async () => {
    const l = live();
    show(<MappingRulesScreen live={l} />);
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[0]!);
    await ue.click(await screen.findByRole('menuitem', { name: 'Delete rule' }));
    expect(l.onRemove).not.toHaveBeenCalled();
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete rule' }));
    expect(l.onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('tests against last week: matched items name the rule; others are left for the person', async () => {
    show(<MappingRulesScreen live={live()} />);
    await ue.click(screen.getByRole('button', { name: 'Test against last week' }));
    expect(await screen.findByText('2 of 3 matched')).toBeInTheDocument();
    expect(screen.getByText('→ NRP-WEB · Build (rule 1)')).toBeInTheDocument();
    expect(screen.getByText('No rule: the person chooses a project')).toBeInTheDocument();
  });

  it('no tools connected: the test says how to connect, with no items', () => {
    show(<MappingRulesScreen live={live({ defaultTest: { ...LIVE_MAPPING_TEST, connected: false, items: [] } })} />);
    expect(screen.getByText('No tools connected')).toBeInTheDocument();
  });

  it('no access (kit page), Projects off and error', () => {
    const one = show(<MappingRulesScreen live={live({ state: 'no-access', data: null })} />);
    expect(screen.getByText("You don't have access to the timesheet mapping rules")).toBeInTheDocument();
    one.unmount();
    const two = show(<MappingRulesScreen live={live({ state: 'off', data: null })} />);
    expect(screen.getByText('Projects is switched off')).toBeInTheDocument();
    two.unmount();
    show(<MappingRulesScreen live={live({ state: 'error', data: null })} />);
    expect(screen.getByText("We couldn't load the mapping rules.")).toBeInTheDocument();
  });

  it('the form checks: pattern text, at most 5 *, a project, priority 1 to 999', () => {
    const ok = { pattern: 'A-*', projectId: 'p', priority: 1 };
    expect(ruleProblems(ok)).toEqual([]);
    expect(ruleProblems({ ...ok, pattern: '**' }).map((p) => p.fieldId)).toEqual(['rule-pattern']);
    expect(ruleProblems({ ...ok, pattern: 'a*b*c*d*e*f*g' }).map((p) => p.fieldId)).toEqual(['rule-pattern']);
    expect(ruleProblems({ ...ok, projectId: null }).map((p) => p.fieldId)).toEqual(['rule-project']);
    expect(ruleProblems({ ...ok, priority: 0 }).map((p) => p.fieldId)).toEqual(['rule-priority']);
  });
});

describe('Settings 3.11: pre-fill switch and the rules link (P-3)', () => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.11')!;
  const v = { 'projects.enabled': 'on', 'projects.booking.allocated_only': 'on', 'projects.burn.warn_pct': '80', 'projects.burn.over_pct': '100', 'timesheet.tool_suggestions': 'off' };
  it('pre-fill shows off (its default, 1409) with no "Wave 5" note; the mapping rules link once Projects is on', () => {
    const all = projectSettingsPage(design, { canEdit: true, values: v, defaults: v, choices: {}, lastChange: null }).sections.flatMap((s) => s.settings);
    const prefill = all.find((x) => x.key === 'prj.prefill_enabled')!;
    expect(prefill).toMatchObject({ value: false, starter: true, availability: undefined });
    expect(all.map((x) => x.key)).toContain('prj.mapping_rules');
    const off = projectSettingsPage(design, { canEdit: true, values: { ...v, 'projects.enabled': 'off' }, defaults: v, choices: {}, lastChange: null }).sections.flatMap((s) => s.settings);
    expect(off.map((x) => x.key)).not.toContain('prj.mapping_rules');
    // One way (Settings S-4): pre-fill saves with the Projects settings.
    expect(projectSettingsChanges({ 'prj.prefill_enabled': true })).toEqual([{ key: 'timesheet.tool_suggestions', value: 'on' }]);
  });
});

describe('Answer 1444: the billing model for new projects', () => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.11')!;
  const v = { 'projects.enabled': 'on', 'projects.default_billing_model': 'time_material' };
  it('3.11 shows the company value with the model names and saves it back', () => {
    const f = projectSettingsPage(design, { canEdit: true, values: v, defaults: v, choices: {}, lastChange: null }).sections.flatMap((s) => s.settings).find((x) => x.key === 'prj.billable_default')!;
    expect(f).toMatchObject({ kind: 'select', value: 'time_material', starter: true });
    expect(f.optionLabels?.non_billable).toBe('Non-billable');
    expect(projectSettingsChanges({ 'prj.billable_default': 'non_billable' })).toEqual([{ key: 'projects.default_billing_model', value: 'non_billable' }]);
  });

  it('default time and material: the new-project form asks for a client', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(<ProjectDrawer project={null} choices={LIVE_PROJECT_CHOICES} finance={false} onClose={() => {}} onSave={onSave} />);
    expect(screen.getByRole('radio', { name: 'Time & material' })).toBeChecked();
    await ue.type(screen.getByRole('textbox', { name: /Code/ }), 'NEW1');
    await ue.type(screen.getByRole('textbox', { name: /Name/ }), 'New one');
    await ue.click(screen.getByRole('button', { name: 'Create project' }));
    expect((await screen.findAllByText('A billable project needs a client.')).length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('default non-billable: the form starts there and needs no client', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(<ProjectDrawer project={null} choices={{ ...LIVE_PROJECT_CHOICES, defaultBillingModel: 'non_billable' }} finance={false} onClose={() => {}} onSave={onSave} />);
    expect(screen.getByRole('radio', { name: 'Non-billable' })).toBeChecked();
    await ue.type(screen.getByRole('textbox', { name: /Code/ }), 'NEW2');
    await ue.type(screen.getByRole('textbox', { name: /Name/ }), 'Internal one');
    await ue.click(screen.getByRole('button', { name: 'Create project' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ code: 'NEW2', billingModel: 'non_billable', clientId: null }));
  });
});
