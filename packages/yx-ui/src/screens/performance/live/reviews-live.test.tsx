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

  it('the skip-level sends back only with a reason, and agrees with an optional comment (PM-4.05)', async () => {
    const onSkip = vi.fn(ok);
    render(<ReviewScreen {...rp({ onSkip, review: review({ role: 'viewer', can: { self: false, manager: false, skip: true }, finalScore: 4 }) })} />);
    await ue.click(screen.getByRole('button', { name: 'Send back' }));
    let d = screen.getByRole('dialog');
    expect(within(d).getByRole('button', { name: 'Send back' })).toBeDisabled();
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Goals rating looks low');
    await ue.click(within(d).getByRole('button', { name: 'Send back' }));
    expect(onSkip).toHaveBeenCalledWith(false, 'Goals rating looks low');
    await ue.click(screen.getByRole('button', { name: 'Agree' }));
    d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Agree' }));
    expect(onSkip).toHaveBeenLastCalledWith(true, null);
  });

  it('after release the employee sees the score, acknowledges, and may disagree (PM-4.06)', async () => {
    const onAcknowledge = vi.fn(ok);
    const onDisagree = vi.fn(ok);
    render(<ReviewScreen {...rp({ onAcknowledge, onDisagree, review: review({ status: 'released', finalScore: 3.8, band: 'Meets', can: { self: false, manager: false, acknowledge: true, disagree: true }, released: { at: '2026-11-20T09:00:00.000Z', acknowledgedAt: null, acknowledgeComment: null, disagreeBy: '2026-12-05' }, disagreements: [] }) })} />);
    expect(screen.getByText('3.8 · Meets')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Acknowledge' }));
    expect(onAcknowledge).toHaveBeenCalledWith(null);
    await ue.click(screen.getByRole('button', { name: /^Disagree/ }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /What you disagree with/ }), 'The Madurai accounts were mine.');
    await ue.click(within(d).getByRole('button', { name: 'Send to HR' }));
    expect(onDisagree).toHaveBeenCalledWith('The Madurai accounts were mine.');
  });

  it('HR releases ready reviews and answers a disagreement with an outcome and a note', async () => {
    const onRelease = vi.fn(ok);
    const onDecide = vi.fn(ok);
    render(<CycleScreen {...cp({ cycle: { ...cycle, status: 'launched' }, funnel: [{ stage: 'release', label: 'Waiting for release', count: 2 }], disagreements: [{ id: 'd1', reviewId: 'r1', employee: 'Arjun', text: 'Mine', status: 'open', hrNote: null, at: '2026-11-22T09:00:00.000Z' }], onRelease, onDecide })} />);
    await ue.click(screen.getByRole('button', { name: 'Release ready reviews' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Release' }));
    expect(onRelease).toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Answer' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('radio', { name: 'Upheld' }));
    await ue.type(within(d).getByRole('textbox', { name: /Note to the employee/ }), 'Accounts confirmed.');
    await ue.click(within(d).getByRole('button', { name: 'Send answer' }));
    expect(onDecide).toHaveBeenCalledWith('d1', 'upheld', 'Accounts confirmed.');
  });

  it('a former manager answers as other reviewer; HR asks one for input (D7)', async () => {
    const onSave = vi.fn(ok);
    const { unmount } = render(<ReviewScreen {...rp({ onSave, review: review({ role: 'other', can: { self: false, manager: false, other: true }, template: { ...review().template, sections: [{ ...review().template.sections[0], whoAnswers: ['manager'] }] } }) })} />);
    expect(screen.getByText(/not scored/)).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: '3 · L3' }));
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSave).toHaveBeenCalledWith('other', expect.objectContaining({ answers: [{ questionId: 'g', rating: 3, text: null }] }), false);
    unmount();
    const onAddOther = vi.fn(ok);
    render(<ReviewScreen {...rp({ onAddOther, review: review({ role: 'viewer', can: { self: false, manager: false, addOther: true }, formerManagers: [{ value: 'e3', label: 'Priya' }] }) })} />);
    await ue.click(screen.getByRole('button', { name: 'Ask a former manager for input' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('combobox', { name: 'Former manager' }));
    await ue.click(screen.getByRole('option', { name: 'Priya' }));
    await ue.click(within(d).getByRole('button', { name: 'Ask' }));
    expect(onAddOther).toHaveBeenCalledWith('e3');
  });

  it('a sealed entry shows its ratings and that HR removed the comments', () => {
    render(<ReviewScreen {...rp({ review: review({ role: 'viewer', can: { self: false, manager: false }, managerEntry: { status: 'submitted', sealed: true, answers: { g: { rating: 4, text: null } }, overallRating: null, comment: null, submittedAt: '2026-10-20T09:00:00.000Z', version: 2 } }) })} />);
    expect(screen.getByText('Comments removed by HR.')).toBeInTheDocument();
    expect(screen.getByText('Goals: 4 · L4')).toBeInTheDocument();
  });
});
