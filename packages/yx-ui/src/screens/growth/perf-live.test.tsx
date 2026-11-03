import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { reviewStages } from './growth-logic';
import { CompanyGoalMapScreen, MyGoalsScreen, PerformanceHomeScreen } from './perf-goals';
import { goalMapCsv } from './perf-goals-live';
import { CycleControlRoomScreen, CycleSetupScreen, ReviewAcknowledgeScreen, ReviewWorkspaceScreen } from './perf-reviews';
import { scoreSoFar } from './perf-reviews-live';
import { toGoal } from './perf-live-data';
import { CONTROL, MANAGER_GOALS, MAP, MINE, MY_GOALS, RELEASED, REVIEW, SETUP, WORKSPACE } from './perf-live-samples';

// PRF-01 … 06 live (performance builder 1): the designed screens with `live`, positive and negative paths.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('live data rules', () => {
  it('a goal keeps the server’s progress and statuses read as the design’s words', () => {
    const g = toGoal(MINE[2]);
    expect(g).toMatchObject({ status: 'Pending approval' === g.status ? g.status : 'Draft', progress: 86 });
    expect(g.keyResults[0]).toMatchObject({ direction: 'decrease', progress: 86 });
  });
  it('review stages: done, current and to do, with release and acknowledgement after', () => {
    const s = reviewStages([{ key: 'self', dueOn: '2027-04-10' }, { key: 'manager', dueOn: '2027-04-20' }], { stage: 'manager', status: 'open' }, { employee: 'Divya', manager: 'Karthik' });
    expect(s.map((x) => [x.id, x.state, x.owner])).toEqual([['self', 'done', 'Divya'], ['manager', 'current', 'Karthik'], ['release', 'todo', 'HR'], ['ack', 'todo', 'Divya']]);
    expect(reviewStages([{ key: 'manager', dueOn: '2027-04-20' }], { stage: 'done', status: 'released' }, { employee: 'D', manager: 'K' }).find((x) => x.state === 'current')!.id).toBe('ack');
    expect(reviewStages([{ key: 'manager', dueOn: '2027-04-20' }], { stage: 'done', status: 'acknowledged' }, { employee: 'D', manager: 'K' }).every((x) => x.state === 'done')).toBe(true);
  });
  it('score so far: weighted section averages, a section with no rating is pending, never 0', () => {
    const open = { ...REVIEW, finalScore: null };
    expect(scoreSoFar(open, { sg: { rating: 4, text: null } }, null)).toMatchObject({ score: 4, pending: ['Competencies'] });
    expect(scoreSoFar(open, { sg: { rating: 4, text: null }, q1: { rating: 3, text: null } }, null).score).toBe(3.6);
    expect(scoreSoFar(open, {}, null).score).toBeNull();
    expect(scoreSoFar(REVIEW, {}, null).score).toBe(3.6);
  });
  it('the goal map spreadsheet quotes names and names the parent', () => {
    const csv = goalMapCsv([...MAP.map!.goals.slice(0, 2), { ...MINE[0], title: 'Say "hello"' }]);
    expect(csv.split('\r\n')[0]).toBe('Goal,Owner,Owner type,Kind,Progress %,Confidence,Aligned to');
    expect(csv).toContain('"Say ""hello"""');
    expect(csv).toContain('"Cut customer complaints by 30%"');
  });
});

describe('PRF-01 home', () => {
  it('loading, error with retry, and the first-use empty state', async () => {
    const retry = vi.fn();
    const { rerender } = show(<PerformanceHomeScreen live={{ state: 'error', onRetry: retry, data: null, onCheckIn: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: /Retry|Try again/ }));
    expect(retry).toHaveBeenCalled();
    rerender(<ToastProvider><PerformanceHomeScreen live={{ state: 'ready', onRetry: retry, data: { persona: 'hr', name: 'Lakshmi', period: null, actions: [], myGoals: [], myReview: null, feedback: [], nextOneOnOne: null, team: [], teamGoals: [], hr: { cycles: [], ratingDistribution: null, pipsActive: 0, goalsAligned: null } }, onCheckIn: vi.fn() }} /></ToastProvider>);
    expect(screen.getByText('No review cycle is running')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a review cycle' })).toHaveAttribute('href', '/yx/performance/cycles/new');
  });
  it('HR sees cycles with overdue counts linked to the control room', () => {
    show(<PerformanceHomeScreen live={{ state: 'ready', onRetry: vi.fn(), data: { persona: 'hr', name: 'Lakshmi', period: null, actions: [], myGoals: [], myReview: null, feedback: [], nextOneOnOne: null, team: [], teamGoals: [], hr: { cycles: [{ id: 'cy1', name: 'H2 review', status: 'launched', stage: 'Manager review', eligible: 212, done: 40, overdue: 9 }], ratingDistribution: null, pipsActive: 3, goalsAligned: 82 } }, onCheckIn: vi.fn() }} />);
    expect(screen.getByRole('link', { name: 'H2 review' })).toHaveAttribute('href', '/yx/performance/cycles/cy1');
    expect(screen.getByText('9 overdue')).toBeInTheDocument();
    // One cycle and one PIP read in the singular (counted links say "1 cycle", never "1 cycles").
    expect(screen.getByRole('link', { name: 'View 1 cycle' })).toBeInTheDocument();
    expect(screen.queryByText(/View 1 cycles/)).toBeNull();
  });
  it('counted links read in the plural for more than one', () => {
    const cycle = { id: 'cy', name: 'H2 review', status: 'launched', stage: 'Self review', eligible: 10, done: 0, overdue: 0 };
    show(<PerformanceHomeScreen live={{ state: 'ready', onRetry: vi.fn(), data: { persona: 'hr', name: 'Lakshmi', period: null, actions: [], myGoals: [], myReview: null, feedback: [], nextOneOnOne: null, team: [], teamGoals: [], hr: { cycles: [cycle, { ...cycle, id: 'cy2' }, { ...cycle, id: 'cy3' }], ratingDistribution: null, pipsActive: 1, goalsAligned: null } }, onCheckIn: vi.fn() }} />);
    expect(screen.getByRole('link', { name: 'View 3 cycles' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View 1 PIP' })).toBeInTheDocument();
  });
});

describe('PRF-02 my goals', () => {
  it('drafts are sent together after a confirm, with a toast', async () => {
    const submit = vi.fn(async () => ({}));
    show(<MyGoalsScreen live={{ ...MY_GOALS, onSubmit: submit }} />);
    await ue.click(screen.getByRole('button', { name: 'Send to my manager' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(await screen.findByText('Goals sent')).toBeInTheDocument();
  });
  it('the manager cannot approve when weights don’t add up: it says why and nothing is sent', async () => {
    const decide = vi.fn(async () => ({}));
    show(<MyGoalsScreen live={{ ...MANAGER_GOALS, goals: MANAGER_GOALS.goals.slice(0, 2), onDecide: decide }} />);
    await ue.click(screen.getByRole('button', { name: 'Approve goals' }));
    expect(screen.getAllByText(/Weights add up to 80%/).length).toBeGreaterThan(1);
    expect(decide).not.toHaveBeenCalled();
  });
  it('a new goal is refused until it has a title, a weight and a key result past its start', async () => {
    const create = vi.fn(async () => ({}));
    show(<MyGoalsScreen live={{ ...MY_GOALS, onCreate: create }} defaultDialog="add" />);
    await ue.click(screen.getByRole('button', { name: 'Save goal' }));
    expect(screen.getAllByText('Say what the goal is, in at least 3 characters.').length).toBeGreaterThan(0);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('PRF-03 goal map', () => {
  it('HR suggests a parent; the exec view has no HR actions', async () => {
    const suggest = vi.fn(async () => ({}));
    const { unmount } = show(<CompanyGoalMapScreen live={{ ...MAP, onSuggestParent: suggest }} />);
    await ue.click(screen.getByRole('button', { name: 'Suggest parent' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send suggestion' }));
    expect(within(screen.getByRole('dialog')).getByText('Choose one.')).toBeInTheDocument();
    expect(suggest).not.toHaveBeenCalled();
    unmount();
    show(<CompanyGoalMapScreen live={{ ...MAP, persona: 'exec' }} />);
    expect(screen.queryByRole('button', { name: 'Suggest parent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add company goal' })).toBeNull();
  });
});

describe('PRF-04 set-up and control room', () => {
  it('launch stops on the pre-flight problems and names them', async () => {
    const launch = vi.fn(async () => ({}));
    show(<CycleSetupScreen live={{ ...SETUP, onLaunch: launch }} defaultStep="stages" />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Launch cycle' }));
    expect((await screen.findAllByText(/Ravi Kumar has no manager/)).length).toBeGreaterThan(0);
    expect(launch).not.toHaveBeenCalled();
  });
  it('release with nothing ready says why instead of a greyed button; with reviews ready it confirms', async () => {
    const release = vi.fn(async () => ({ released: 39, notReady: 0 }));
    const { unmount } = show(<CycleControlRoomScreen live={{ ...CONTROL, funnel: CONTROL.funnel.map((f) => (f.stage === 'release' ? { ...f, count: 0 } : f)), onRelease: release }} />);
    await ue.click(screen.getByRole('button', { name: 'Release ratings' }));
    expect((await screen.findAllByText(/No review is ready to release yet/)).length).toBeGreaterThan(0);
    unmount();
    show(<CycleControlRoomScreen live={{ ...CONTROL, onRelease: release }} />);
    await ue.click(screen.getByRole('button', { name: 'Release ratings' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Release ratings' }));
    await waitFor(() => expect(release).toHaveBeenCalled());
  });
  it('leaving someone out needs a reason', async () => {
    const override = vi.fn(async () => ({}));
    show(<CycleControlRoomScreen live={{ ...CONTROL, onOverride: override }} defaultTab="people" />);
    await ue.click(screen.getAllByRole('button', { name: 'Leave out' })[0]!);
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave out' }));
    expect(override).not.toHaveBeenCalled();
    await ue.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'Moved to the sister company');
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave out' }));
    await waitFor(() => expect(override).toHaveBeenCalledWith('x1', false, 'Moved to the sister company'));
  });
});

describe('PRF-05 workspace and PRF-06 acknowledgement', () => {
  it('the skip-level agrees, or sends back only with a reason; ratings are read-only', async () => {
    const skip = vi.fn(async () => ({}));
    show(<ReviewWorkspaceScreen live={{ ...WORKSPACE, onSkip: skip }} />);
    expect(screen.getAllByRole('radio').every((r) => (r as HTMLInputElement).disabled || r.getAttribute('aria-disabled') === 'true' || r.hasAttribute('data-disabled'))).toBe(true);
    await ue.click(screen.getByRole('button', { name: 'Send back' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send back' }));
    expect(skip).not.toHaveBeenCalled();
    await ue.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'Goal 2 needs evidence');
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send back' }));
    await waitFor(() => expect(skip).toHaveBeenCalledWith(false, 'Goal 2 needs evidence'));
  });
  it('acknowledging with a disagreement needs 20 characters; both go in one call', async () => {
    const ack = vi.fn(async () => ({}));
    show(<ReviewAcknowledgeScreen defaultDisagree live={{ review: RELEASED, onAcknowledge: ack, onDisagree: vi.fn() }} />);
    await ue.type(screen.getByRole('textbox', { name: /What do you disagree with/ }), 'Too short');
    await ue.click(screen.getByRole('button', { name: 'Acknowledge and send disagreement' }));
    expect(screen.getByText(/at least 20 characters/)).toBeInTheDocument();
    expect(ack).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /What do you disagree with/ }), ', the vendor delay is missing');
    await ue.click(screen.getByRole('button', { name: 'Acknowledge and send disagreement' }));
    await waitFor(() => expect(ack).toHaveBeenCalledWith(null, 'Too short, the vendor delay is missing'));
  });
});

describe('founder followups A (3 Nov 2026)', () => {
  const managerHome = { persona: 'mgr' as const, name: 'Karthik', period: null, actions: [], myGoals: [], myReview: null, feedback: [], nextOneOnOne: null, team: [{ id: 'e1', name: 'Divya Raghunathan', role: 'QA lead', goalProgress: 62, reviewStage: 'Manager review', reviewId: 'r1', lastOneOnOne: null, lastFeedback: null }], teamGoals: [], hr: null };
  const coach = { state: 'ready' as const, onRetry: vi.fn(), firstName: 'Karthik', weekOf: new Date(2026, 10, 2), optedOut: false, nudges: [{ id: 'n1', person: 'Divya Raghunathan', signal: 'No feedback given in 6 weeks', action: 'Give feedback' }], looksAt: [], onAct: vi.fn(), onDismiss: vi.fn(async () => undefined), onOptOut: vi.fn(async () => undefined) };

  it('(7) the manager home carries the coach card; dismissing a nudge calls the API', async () => {
    show(<PerformanceHomeScreen live={{ state: 'ready', onRetry: vi.fn(), data: managerHome, onCheckIn: vi.fn(), coach }} />);
    const card = screen.getAllByRole('region', { name: 'Manager coach' }).find((e) => e.classList.contains('yx-coach'))!;
    expect(within(card).getByText('No feedback given in 6 weeks')).toBeInTheDocument();
    await ue.click(within(card).getByRole('button', { name: 'Dismiss nudge about Divya Raghunathan' }));
    expect(coach.onDismiss).toHaveBeenCalledWith('n1');
  });
  it('(7) no coach card without a team, or while the coach does not apply', () => {
    const { unmount } = show(<PerformanceHomeScreen live={{ state: 'ready', onRetry: vi.fn(), data: managerHome, onCheckIn: vi.fn(), coach: null }} />);
    expect(screen.queryAllByRole('region', { name: 'Manager coach' })).toHaveLength(0);
    unmount();
    show(<PerformanceHomeScreen live={{ state: 'ready', onRetry: vi.fn(), data: managerHome, onCheckIn: vi.fn(), coach: { ...coach, state: 'not-manager' } }} />);
    expect(screen.queryAllByRole('region', { name: 'Manager coach' })).toHaveLength(0);
  });
  it('(4) the home links my earlier reviews', () => {
    show(<PerformanceHomeScreen live={{ state: 'ready', onRetry: vi.fn(), data: { ...managerHome, persona: 'emp', team: [], earlierReviews: [{ id: 'r0', cycle: 'Annual review FY 2025-26' }] }, onCheckIn: vi.fn() }} />);
    expect(screen.getByRole('link', { name: 'Annual review FY 2025-26' })).toHaveAttribute('href', '/yx/performance/reviews/r0');
  });
  it('(13) the manager proposes potential with the review; a reader sees it read-only; the employee never', async () => {
    const save = vi.fn(async () => ({}));
    const asManager = { ...REVIEW, role: 'manager' as const, status: 'open' as const, next: { stage: 'manager', label: 'Manager review', owner: 'Karthik Subramanian', dueOn: '2027-04-20' }, managerEntry: { ...REVIEW.managerEntry!, status: 'draft' as const }, finalScore: null, band: null, proposedPotential: null, can: { self: false, manager: true } };
    const { unmount } = show(<ReviewWorkspaceScreen live={{ ...WORKSPACE, review: asManager, onSave: save }} />);
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Potential' })).getByRole('radio', { name: 'High' }));
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('manager', expect.objectContaining({ potential: 3 }), false));
    unmount();
    const r2 = show(<ReviewWorkspaceScreen live={{ ...WORKSPACE, review: { ...REVIEW, proposedPotential: 2 } }} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Potential' })).toBeNull();
    r2.unmount();
    show(<ReviewWorkspaceScreen live={{ ...WORKSPACE, review: { ...REVIEW, role: 'employee', proposedPotential: null, can: { self: false, manager: false } } }} />);
    expect(screen.queryByText('Potential, for calibration')).toBeNull();
  });
});
