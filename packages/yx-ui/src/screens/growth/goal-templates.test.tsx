import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GoalFormDrawer } from './perf-goals-live';
import { GoalImportDialog, type GoalImportPreview } from './goal-import';
import { GoalTemplateSheet, type GoalTemplate } from '../settings/goal-templates-live';
import { PERF_SETUP_LISTS, perfSetupPage } from '../settings/perf-setup-live';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// T2-C item 71 (answer 2844): goal templates and the goal import.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const T: GoalTemplate = { id: 't1', title: 'Grow my accounts', description: 'Key customers', kind: 'okr', keyResults: ['New accounts', 'Renewals'], departmentId: 'd1', department: 'Sales', designationId: null, designation: null };

describe('Goal templates and import (71)', () => {
  it('6.3 lists the goal templates with who they are for', () => {
    const page = perfSetupPage(SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.3')!, { templates: [], scales: [], skills: [], goalTemplates: [T, { ...T, id: 't2', title: 'Learn a skill', kind: 'kpi', keyResults: [], department: null }] });
    const list = page.sections.flatMap((s) => s.settings).find((d) => d.key === PERF_SETUP_LISTS.goalTemplates)!;
    expect(list.rows).toEqual([['Grow my accounts', 'Objective · 2 key results', 'Sales'], ['Learn a skill', 'KPI', 'Everyone']]);
  });

  it('HR saves a template; negative: an objective with no key results is refused', async () => {
    const onSave = vi.fn(ok);
    render(<GoalTemplateSheet template={null} departments={[{ value: 'd1', label: 'Sales' }]} designations={[]} onClose={vi.fn()} onSave={onSave} onDelete={vi.fn(ok)} />);
    await ue.type(screen.getByRole('textbox', { name: /^Goal/ }), 'Grow my accounts');
    await ue.click(screen.getByRole('radio', { name: 'Objective with key results' }));
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getAllByText('An objective needs at least one key result.').length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Key results/ }), 'New accounts{enter}Renewals');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Grow my accounts', description: null, kind: 'okr', keyResults: ['New accounts', 'Renewals'], departmentId: null, designationId: null });
  });

  it('a new goal starts from a template, and stays editable', async () => {
    render(<GoalFormDrawer goal={null} periodId="p1" ownerTypes={['person']} departments={[]} alignOptions={[]} templates={[T]} onClose={vi.fn()} onSave={vi.fn(ok)} />);
    await ue.click(screen.getByRole('combobox', { name: 'Start from a template' }));
    await ue.click(screen.getByRole('option', { name: 'Grow my accounts' }));
    expect(screen.getByRole('textbox', { name: /^Goal|^Title|Objective/ })).toHaveValue('Grow my accounts');
    expect(screen.getByDisplayValue('Renewals')).toBeInTheDocument();
  });

  it('negative: editing a goal offers no template', () => {
    render(<GoalFormDrawer goal={null} periodId="p1" ownerTypes={['person']} departments={[]} alignOptions={[]} templates={[]} onClose={vi.fn()} onSave={vi.fn(ok)} />);
    expect(screen.queryByRole('combobox', { name: 'Start from a template' })).toBeNull();
  });

  it('import: the preview lists goals and refused rows; Import stays off until every row is right', async () => {
    const bad: GoalImportPreview = { preview: true, rows: [{ line: 2, employee: 'Arjun', employeeCode: 'KF-3', title: 'Goal one', weight: 30 }], problems: [{ line: 3, name: 'Goal two', problems: ['No employee with the code KF-9 in this company.'] }] };
    const good: GoalImportPreview = { ...bad, problems: [] };
    const onPreview = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good);
    const onImport = vi.fn(async () => ({ imported: 1 }));
    const { container } = render(<GoalImportDialog open onOpenChange={vi.fn()} onPreview={onPreview} onImport={onImport} />);
    const input = () => (document.querySelector('input[type="file"]') ?? container.querySelector('input[type="file"]')) as HTMLInputElement;
    await ue.upload(input(), new File(['employee_code,title\nKF-3,Goal one'], 'goals.csv', { type: 'text/csv' }));
    expect(await screen.findByText('No employee with the code KF-9 in this company.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    await ue.upload(input(), new File(['employee_code,title\nKF-3,Goal one'], 'goals.csv', { type: 'text/csv' }));
    const go = await screen.findByRole('button', { name: 'Import 1 goal' });
    expect(within(screen.getByRole('dialog')).getByText('Arjun (KF-3)')).toBeInTheDocument();
    await ue.click(go);
    expect(onImport).toHaveBeenCalledWith('employee_code,title\nKF-3,Goal one');
  });
});
