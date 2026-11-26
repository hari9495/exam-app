import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SETTINGS_GROUPS } from './settings-groups';
import { PERF_SETUP_LISTS, PerfStartersCard, RatingScaleSheet, ReviewTemplateSheet, SkillSheet, perfSetupPage } from './perf-setup-live';
import { AgendaTemplateSheet, type AgendaTemplate } from './agenda-templates-live';
import type { RatingScale, ReviewTemplate, Skill } from '../performance/live/types';

// Settings 6.3 Performance, the drawn page with the live editors (batch T2-C; the PM1 set-up tests, M06-BUILD-DESIGN
// §5.2, §9.1, PM-1.05). Competencies are tested with the PRF-14 framework.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const scale: RatingScale = { id: 's1', name: 'Five-point scale', min: 1, max: 5, step: 1, status: 'active', starter: true, inUse: true, levels: ['A', 'B', 'C', 'D', 'E'].map((label, i) => ({ value: i + 1, label, description: null })), bands: [{ fromScore: 1, toScore: 5, label: 'All' }], version: 1 };
const template = (o: Partial<ReviewTemplate> = {}): ReviewTemplate => ({ id: 't1', familyId: 'f1', templateVersion: 1, name: 'Annual review', kind: 'annual', scaleId: 's1', scoring: 'weighted', status: 'active', starter: true, activatedAt: null, sections: [{ kind: 'goals', title: 'Goals', weight: 100, rated: true, whoAnswers: ['self', 'manager'], questions: [] }], problem: null, version: 1, ...o });
const sheet = (o: Partial<Parameters<typeof ReviewTemplateSheet>[0]> = {}) => {
  const p = { template: template(), scales: [scale], hasDraft: false, onClose: vi.fn(), onSave: vi.fn(ok), onActivate: vi.fn(ok), onNewVersion: vi.fn(ok), onRetire: vi.fn(ok), ...o };
  render(<ReviewTemplateSheet {...p} />);
  return { p, d: screen.getByRole('dialog') };
};
const skill = (o: Partial<Skill>): Skill => ({ id: 'k', name: 'Skill', kind: 'skill', parentId: null, status: 'active', mergedIntoId: null, starter: false, competency: false, ...o });

describe('Settings 6.3 Performance · live editors', () => {
  it('a new company starts from the starters', async () => {
    const onUseStarters = vi.fn(ok);
    render(<PerfStartersCard onUseStarters={onUseStarters} />);
    await ue.click(screen.getByRole('button', { name: 'Use the starters' }));
    expect(onUseStarters).toHaveBeenCalled();
  });

  it('the drawn page lists templates and scales under the templates link and the skills under the competency link', () => {
    const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.3')!;
    const page = perfSetupPage(design, {
      templates: [template(), template({ id: 't2', name: 'Probation', status: 'draft', problem: 'The weights of rated sections add up to 90, not 100.' })],
      scales: [scale],
      skills: [skill({ id: 'd', name: 'Quality', kind: 'domain' }), skill({ id: 'k', name: 'Root cause analysis', parentId: 'd' })],
    });
    const keys = page.sections.flatMap((s) => s.settings.map((d) => d.key));
    expect(keys.indexOf('perf.review_templates')).toBe(keys.indexOf('perf.templates') + 1);
    expect(keys.indexOf('perf.rating_scales')).toBe(keys.indexOf('perf.templates') + 2);
    expect(keys.indexOf('perf.skills_library')).toBe(keys.indexOf('perf.competencies') + 1);
    const rows = (k: string) => page.sections.flatMap((s) => s.settings).find((d) => d.key === k)!.rows!;
    expect(rows('perf.review_templates')[1]).toEqual(['Probation · version 1', 'Draft · Starter · Not ready: The weights of rated sections add up to 90, not 100.', 'Annual', 'Five-point scale']);
    expect(rows('perf.rating_scales')[0]![3]).toBe('Active · In use');
    expect(rows('perf.skills_library').map((r) => r[0])).toEqual(['Quality', 'Quality › Root cause analysis']);
  });

  it('an active template offers a new version, never an edit', async () => {
    const { p, d } = sheet();
    expect(within(d).queryByRole('button', { name: 'Save draft' })).toBeNull();
    await ue.click(within(d).getByRole('button', { name: 'New version' }));
    expect(p.onNewVersion).toHaveBeenCalled();
  });

  it('an active template whose new version is already a draft offers no second one', () => {
    const { d } = sheet({ hasDraft: true });
    expect(within(d).queryByRole('button', { name: 'New version' })).toBeNull();
    expect(within(d).getByText('A new version is already a draft')).toBeInTheDocument();
  });

  it('a draft offers edit, activate and retire, and says why it is not ready', async () => {
    const { p, d } = sheet({ template: template({ status: 'draft', problem: 'The weights of rated sections add up to 90, not 100.' }) });
    expect(within(d).getByText('The weights of rated sections add up to 90, not 100.')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Retire' })).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Activate' }));
    expect(p.onActivate).toHaveBeenCalled();
  });

  it('the template editor shows the live weight total and still saves a draft that does not add up', async () => {
    const { p, d } = sheet({ template: null });
    await ue.type(within(d).getByRole('textbox', { name: /^Name/ }), 'Sales annual');
    expect(within(d).getByText('Weights of rated sections: 100 of 100')).toBeInTheDocument();
    const weight = within(d).getByRole('textbox', { name: /Weight/ });
    await ue.clear(weight);
    await ue.type(weight, '90');
    expect(within(d).getByText('Weights of rated sections: 90 of 100')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Save draft' }));
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sales annual', scaleId: 's1', scoring: 'weighted', sections: [expect.objectContaining({ kind: 'goals', weight: 90 })] }));
  });

  it('a template with no name is not saved', async () => {
    const { p, d } = sheet({ template: null });
    await ue.click(within(d).getByRole('button', { name: 'Save draft' }));
    expect(within(d).getAllByText('Name the template.').length).toBeGreaterThan(0);
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('editing a draft sends only what the API takes (no ids read back from it)', async () => {
    const { p, d } = sheet({ template: template({ status: 'draft', sections: [{ id: 'x1', kind: 'questions', title: 'Looking ahead', weight: 0, rated: false, whoAnswers: ['self'], questions: [{ id: 'q1', text: 'What next?', answer: 'text', required: true }] } as never] }) });
    await ue.click(within(d).getByRole('button', { name: 'Save draft' }));
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ sections: [{ kind: 'questions', title: 'Looking ahead', weight: 0, rated: false, whoAnswers: ['self'], questions: [{ text: 'What next?', answer: 'text', required: true }] }], version: 1 }));
  });

  it('a scale a template uses offers no edit, only retire', () => {
    render(<RatingScaleSheet scale={scale} onClose={vi.fn()} onSave={vi.fn(ok)} onRetire={vi.fn(ok)} />);
    const d = screen.getByRole('dialog');
    expect(within(d).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(within(d).getByText('Active · In use')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Retire' })).toBeInTheDocument();
  });

  it('an unused scale is edited and keeps its version', async () => {
    const onSave = vi.fn(ok);
    render(<RatingScaleSheet scale={{ ...scale, inUse: false }} onClose={vi.fn()} onSave={onSave} onRetire={vi.fn(ok)} />);
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Five-point scale', max: 5, step: 1, version: 1 }));
  });

  it('a skill needs a name and its domain; a merge needs the skill to keep', async () => {
    const skills = [skill({ id: 'd', name: 'Quality', kind: 'domain' }), skill({ id: 'a', name: 'Root cause analysis', parentId: 'd' }), skill({ id: 'b', name: 'RCA', parentId: 'd' })];
    const onAdd = vi.fn(ok);
    const first = render(<SkillSheet skill={null} skills={skills} onClose={vi.fn()} onAdd={onAdd} onMerge={vi.fn(ok)} onRetire={vi.fn(ok)} />);
    let d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add skill' }));
    expect(within(d).getByText('Enter a name of at least 2 characters.')).toBeInTheDocument();
    expect(within(d).getByText('Choose the domain.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /^Name/ }), 'Kaizen');
    await ue.click(within(d).getByRole('combobox', { name: 'Domain' }));
    await ue.click(screen.getByRole('option', { name: 'Quality' }));
    await ue.click(within(d).getByRole('button', { name: 'Add skill' }));
    expect(onAdd).toHaveBeenCalledWith({ name: 'Kaizen', kind: 'skill', parentId: 'd' });
    first.unmount();
    const onMerge = vi.fn(ok);
    render(<SkillSheet skill={skills[2]!} skills={skills} onClose={vi.fn()} onAdd={vi.fn(ok)} onMerge={onMerge} onRetire={vi.fn(ok)} />);
    d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Merge' }));
    expect(within(d).getByText('Choose the skill to keep.')).toBeInTheDocument();
    expect(onMerge).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('combobox', { name: 'Skill to keep' }));
    await ue.click(screen.getByRole('option', { name: 'Quality › Root cause analysis' }));
    await ue.click(within(d).getByRole('button', { name: 'Merge' }));
    expect(onMerge).toHaveBeenCalledWith('a');
  });
});

describe('Settings 6.3 · a new template while the scales load (CI 226)', () => {
  it('takes the first scale when it arrives, so Save draft is not refused for a scale the person never saw', async () => {
    const onSave = vi.fn(ok);
    const props = { template: null, hasDraft: false, onClose: vi.fn(), onSave, onActivate: vi.fn(ok), onNewVersion: vi.fn(ok), onRetire: vi.fn(ok) };
    const { rerender } = render(<ReviewTemplateSheet {...props} scales={[]} />);
    rerender(<ReviewTemplateSheet {...props} scales={[scale]} />);
    await ue.type(screen.getByRole('textbox', { name: /^Name/ }), 'Plant annual');
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ scaleId: 's1' }));
  });

  it('negative: with no scale at all, Save draft still asks for one', async () => {
    const onSave = vi.fn(ok);
    render(<ReviewTemplateSheet template={null} scales={[]} hasDraft={false} onClose={vi.fn()} onSave={onSave} onActivate={vi.fn(ok)} onNewVersion={vi.fn(ok)} onRetire={vi.fn(ok)} />);
    await ue.type(screen.getByRole('textbox', { name: /^Name/ }), 'Plant annual');
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByText('Choose a rating scale.').length).toBeGreaterThan(0);
  });
});

// T2-C item 70 (answer 2843): the company's 1:1 agenda templates on 6.3, edited in their sheet.
describe('Settings 6.3 · 1:1 agenda templates (70)', () => {
  const at = (o: Partial<AgendaTemplate> = {}): AgendaTemplate => ({ id: 'a1', name: 'Weekly check-in', items: ['Wins', 'Blockers', 'Help needed'], company: true, mine: false, updatedAt: '2026-11-27T10:00:00Z', ...o });
  it('lists only the company templates under the 1:1 part of the page', () => {
    const page = perfSetupPage(SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.3')!, { templates: [], scales: [], skills: [], agendaTemplates: [at(), at({ id: 'a2', name: 'Mine', company: false, mine: true })] });
    const list = page.sections.flatMap((s) => s.settings).find((d) => d.key === PERF_SETUP_LISTS.agendaTemplates)!;
    expect(list.rows).toEqual([['Weekly check-in', '3 · Wins · Blockers …']]);
    expect(page.sections.find((s) => s.settings.includes(list))!.title).toBe('Competencies and 1:1s');
  });

  it('adds a template: one line a line, blanks and repeats dropped; saved with a toast', async () => {
    const onSave = vi.fn(ok);
    const onClose = vi.fn();
    render(<AgendaTemplateSheet template={null} onClose={onClose} onSave={onSave} onDelete={vi.fn(ok)} />);
    await ue.type(screen.getByRole('textbox', { name: /^Name/ }), 'Monthly');
    await ue.type(screen.getByRole('textbox', { name: /Agenda lines/ }), 'Goals{enter}{enter}Goals{enter}Learning');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Monthly', items: ['Goals', 'Learning'] });
    expect(onClose).toHaveBeenCalled();
  });

  it('negative: no name or no lines is refused; delete asks first', async () => {
    const onSave = vi.fn(ok);
    const onDelete = vi.fn(ok);
    render(<AgendaTemplateSheet template={at()} onClose={vi.fn()} onSave={onSave} onDelete={onDelete} />);
    await ue.clear(screen.getByRole('textbox', { name: /^Name/ }));
    await ue.clear(screen.getByRole('textbox', { name: /Agenda lines/ }));
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getAllByText('Name the template.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Write at least one agenda line.').length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Delete template' }));
    expect(onDelete).toHaveBeenCalled();
  });
});
