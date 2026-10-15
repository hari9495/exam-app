import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PerformanceSetupScreen, type PerformanceSetupScreenProps } from './setup';
import type { RatingScale, ReviewTemplate } from './types';

// Performance batch PM1 set-up screen (M06-BUILD-DESIGN §5.2, §9.1; Settings 6.3, PRF-14; PM-1.05).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const scale: RatingScale = { id: 's1', name: 'Five-point scale', min: 1, max: 5, step: 1, status: 'active', starter: true, inUse: true, levels: ['A', 'B', 'C', 'D', 'E'].map((label, i) => ({ value: i + 1, label, description: null })), bands: [{ fromScore: 1, toScore: 5, label: 'All' }], version: 1 };
const template = (o: Partial<ReviewTemplate> = {}): ReviewTemplate => ({ id: 't1', familyId: 'f1', templateVersion: 1, name: 'Annual review', kind: 'annual', scaleId: 's1', scoring: 'weighted', status: 'active', starter: true, activatedAt: null, sections: [{ kind: 'goals', title: 'Goals', weight: 100, rated: true, whoAnswers: ['self', 'manager'], questions: [] }], problem: null, version: 1, ...o });
const props = (o: Partial<PerformanceSetupScreenProps> = {}): PerformanceSetupScreenProps => ({
  state: 'ready',
  today: '2026-10-12',
  scales: [scale],
  templates: [template()],
  competencies: [],
  skills: [],
  designations: [],
  onUseStarters: vi.fn(ok),
  onSaveScale: vi.fn(ok),
  onRetireScale: vi.fn(ok),
  onSaveTemplate: vi.fn(ok),
  onNewVersion: vi.fn(ok),
  onActivate: vi.fn(ok),
  onRetireTemplate: vi.fn(ok),
  onSaveCompetency: vi.fn(ok),
  onRetireCompetency: vi.fn(ok),
  onSaveSkill: vi.fn(ok),
  onRetireSkill: vi.fn(ok),
  onMergeSkill: vi.fn(ok),
  ...o,
});

describe('Settings › Performance (PM1)', () => {
  it('a new company starts from the starters', async () => {
    const p = props({ templates: [], scales: [] });
    render(<PerformanceSetupScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Use the starters' }));
    expect(p.onUseStarters).toHaveBeenCalled();
  });

  it('an active template offers a new version, never an edit; a draft offers edit and activate', async () => {
    const p = props({ templates: [template(), template({ id: 't2', familyId: 'f2', name: 'Probation', status: 'draft', problem: 'The weights of rated sections add up to 90, not 100.' })] });
    render(<PerformanceSetupScreen {...p} />);
    const active = screen.getByRole('row', { name: /Annual review/ });
    expect(within(active).queryByRole('button', { name: 'Edit' })).toBeNull();
    await ue.click(within(active).getByRole('button', { name: 'New version' }));
    expect(p.onNewVersion).toHaveBeenCalledWith('t1');
    expect(screen.getByText('Not ready')).toBeInTheDocument();
    expect(screen.getByText(/Probation \(version 1\): The weights of rated sections add up to 90, not 100\./)).toBeInTheDocument();
  });

  it('the template editor shows the live weight total and still saves a draft that does not add up', async () => {
    const p = props();
    render(<PerformanceSetupScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Add a template' }));
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByRole('textbox', { name: /^Name/ }), 'Sales annual');
    expect(within(sheet).getByText('Weights of rated sections: 100 of 100')).toBeInTheDocument();
    const weight = within(sheet).getByRole('textbox', { name: /Weight/ });
    await ue.clear(weight);
    await ue.type(weight, '90');
    expect(within(sheet).getByText('Weights of rated sections: 90 of 100')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Save draft' }));
    expect(p.onSaveTemplate).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Sales annual', scaleId: 's1', scoring: 'weighted', sections: [expect.objectContaining({ kind: 'goals', weight: 90 })] }));
  });

  it('editing a draft sends only what the API takes (no ids read back from it)', async () => {
    const p = props({ templates: [template({ status: 'draft', sections: [{ id: 'x1', kind: 'questions', title: 'Looking ahead', weight: 0, rated: false, whoAnswers: ['self'], questions: [{ id: 'q1', text: 'What next?', answer: 'text', required: true }] } as never] })] });
    render(<PerformanceSetupScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Edit' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save draft' }));
    expect(p.onSaveTemplate).toHaveBeenCalledWith('t1', expect.objectContaining({ sections: [{ kind: 'questions', title: 'Looking ahead', weight: 0, rated: false, whoAnswers: ['self'], questions: [{ text: 'What next?', answer: 'text', required: true }] }], version: 1 }));
  });

  it('a scale a template uses offers no edit', async () => {
    render(<PerformanceSetupScreen {...props()} />);
    await ue.click(screen.getByRole('tab', { name: 'Rating scales' }));
    const row = screen.getByRole('row', { name: /Five-point scale/ });
    expect(within(row).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(row).getByText('In use')).toBeInTheDocument();
  });

  it('a competency group is a pick-one control; job-title levels need a start date', async () => {
    const p = props({ designations: [{ value: 'd1', label: 'Engineer' }] });
    render(<PerformanceSetupScreen {...p} />);
    await ue.click(screen.getByRole('tab', { name: 'Competencies' }));
    await ue.click(screen.getByRole('button', { name: 'Add a competency' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('radiogroup', { name: 'Competency group' })).toBeInTheDocument();
    await ue.type(within(sheet).getByRole('textbox', { name: /^Name/ }), 'Code review');
    for (const [i, label] of ['Learning', 'Working', 'Skilled', 'Leading'].entries()) await ue.type(within(sheet).getByRole('textbox', { name: new RegExp(`^Level ${i + 1}`) }), label);
    await ue.click(within(sheet).getByRole('radio', { name: 'Functional' }));
    await ue.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(p.onSaveCompetency).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Code review', group: 'functional', levels: expect.arrayContaining([{ label: 'Learning', behaviours: null }]), roles: [] }));
  });
});
