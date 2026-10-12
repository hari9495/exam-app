import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CycleScreen, ReviewScreen, type CycleScreenProps, type ReviewScreenProps } from './reviews';
import type { ReviewCycle, ReviewDetail } from './types';

// Performance batch PM4 screens (M06-BUILD-DESIGN §9; PRF-04 / 05 / 06; PM-4.08).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const cycle: ReviewCycle = { id: 'c1', name: 'FY annual', kind: 'annual', periodFrom: '2025-04-01', periodTo: '2026-03-31', templateId: 't1', scaleId: 's1', population: null, stages: [{ key: 'self', dueOn: '2026-10-20' }, { key: 'manager', dueOn: '2026-10-31' }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false }, status: 'draft', launchedAt: null, version: 1 };
const cp = (o: Partial<CycleScreenProps> = {}): CycleScreenProps => ({ state: 'ready', cycle, templates: [], departments: [], preflight: null, funnel: [], eligibility: [], onBack: vi.fn(), onSave: vi.fn(ok), onCheck: vi.fn(ok), onLaunch: vi.fn(ok), onOverride: vi.fn(ok), ...o });
const levels = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: `L${v}` }));
const review = (o: Partial<ReviewDetail> = {}): ReviewDetail => ({
  id: 'r1',
  cycle: { id: 'c1', name: 'FY annual', periodFrom: '2025-04-01', periodTo: '2026-03-31', stages: cycle.stages },
  employee: 'Arjun',
  employeeId: 'e1',
  manager: 'Priya',
  role: 'employee',
  status: 'open',
  next: { stage: 'self', label: 'Self review', owner: 'Arjun', dueOn: '2026-10-20' },
  template: { name: 'Annual', scoring: 'weighted', levels, sections: [{ id: 'g', kind: 'goals', title: 'Goals', weight: 60, rated: true, whoAnswers: ['self', 'manager'], questions: [{ id: 'g', text: 'Goals', answer: 'both', required: false, maxChars: 2000, wholeSection: true }] }] },
  goals: [],
  self: null,
  selfSubmitted: false,
  managerEntry: null,
  finalScore: null,
  band: null,
  excludedSections: [],
  trail: [],
  can: { self: true, manager: false },
  version: 1,
  ...o,
});
const rp = (o: Partial<ReviewScreenProps> = {}): ReviewScreenProps => ({ state: 'ready', review: review(), onBack: vi.fn(), onSave: vi.fn(ok), ...o });

describe('Review cycles and reviews (PM4)', () => {
  it('the cycle starts only when the check finds nothing to fix', async () => {
    const p = cp({ preflight: { problems: [{ text: 'Ravi has no manager.', fix: '/yx/people/employees/e9' }], reviewed: 4, excluded: 1, protectedLeave: 0, leavers: 0 } });
    const { rerender } = render(<CycleScreen {...p} />);
    expect(screen.getByRole('link', { name: 'Fix' })).toHaveAttribute('href', '/yx/people/employees/e9');
    expect(screen.getByRole('button', { name: 'Start the cycle' })).toBeDisabled();
    rerender(<CycleScreen {...p} preflight={{ problems: [], reviewed: 4, excluded: 1, protectedLeave: 0, leavers: 0 }} />);
    await ue.click(screen.getByRole('button', { name: 'Start the cycle' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Start' }));
    expect(p.onLaunch).toHaveBeenCalled();
  });

  it('HR includes a left-out person only with a reason', async () => {
    const p = cp({ cycle: { ...cycle, status: 'launched' }, eligibility: [{ id: 'x2', employeeId: 'e2', name: 'Sita', rule: 'excluded_cutoff', eligibleMonths: 2, proration: 0.17, reviewed: false, overrideReason: null }] });
    render(<CycleScreen {...p} />);
    expect(screen.getByText('Joined after the cut-off')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Include' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('button', { name: 'Include' })).toBeDisabled();
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Joined from the sister company');
    await ue.click(within(d).getByRole('button', { name: 'Include' }));
    expect(p.onOverride).toHaveBeenCalledWith('x2', true, 'Joined from the sister company');
  });

  it('the employee rates a whole section and sends the self review; no score shows', async () => {
    const p = rp();
    render(<ReviewScreen {...p} />);
    expect(screen.queryByText('Score')).toBeNull();
    await ue.click(screen.getByRole('radio', { name: '4 · L4' }));
    await ue.click(screen.getByRole('button', { name: 'Submit' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit' }));
    expect(p.onSave).toHaveBeenCalledWith('self', { answers: [{ questionId: 'g', rating: 4, text: null }], overallRating: null }, true);
  });

  it('the manager is told to save a draft before reading the self review; a left-out section is named', () => {
    render(<ReviewScreen {...rp({ review: review({ role: 'manager', can: { self: false, manager: true }, selfSubmitted: true }) })} />);
    expect(screen.getByText(/Save a draft of your own first/)).toBeInTheDocument();
    render(<ReviewScreen {...rp({ review: review({ role: 'viewer', can: { self: false, manager: false }, finalScore: 4, band: 'Exceeds', excludedSections: ['Competencies'] }) })} />);
    expect(screen.getByText(/Competencies had no ratings/)).toBeInTheDocument();
  });
});
