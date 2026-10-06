import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  actionPlanDue,
  anonymityGroups,
  bandFor,
  budgetCheck,
  budgetUse,
  canSlice,
  checkProposal,
  completionStatus,
  complianceCell,
  detectBiasFlags,
  distribution,
  eligibility,
  enps,
  enrol,
  goalProgress,
  krProgress,
  moderate,
  nineBoxLabel,
  nominationCheck,
  pipSchedule,
  pollPercents,
  qrToken,
  redemptionTax,
  renewalDate,
  reviewScore,
  skillGap,
  validateKudos,
  weightCheck,
  withdraw,
  type Goal,
} from './growth-logic';
import { BiasFlagList, CoachCard, GoalTree, PollBlock } from './growth-kit';
import { GoalCheckInSheet } from './perf-goals';
import { NominationsScreen } from './perf-reviews';
import { QuickFeedbackScreen } from './perf-people';
import { GiveKudosScreen } from './engage-recognition';
import { TakeSurveyScreen } from './engage-surveys';
import { SurveyResultsScreen } from './engage-surveys';
import { GOALS, NUDGES, d } from './perf-data';
import { PEOPLE } from './perf-data-2';
import { NOMINATIONS } from './perf-data-3';
import { PULSE_QUESTIONS, RESULTS, TEAM_SMALL, VALUES, BADGES } from './engage-data';

const goal = (over: Partial<Goal>): Goal => ({ id: 'g', title: 'G', type: 'okr', owner: { type: 'person', name: 'A' }, weight: 50, period: 'H1', status: 'Approved', keyResults: [], ...over });

describe('M06 performance rules', () => {
  it('key-result progress handles increase and decrease targets', () => {
    expect(krProgress({ id: 'k', title: '', start: 120, target: 400, actual: 310, unit: '' })).toBe(68);
    expect(krProgress({ id: 'k', title: '', start: 8, target: 2, actual: 3.5, unit: '%', direction: 'decrease' })).toBe(75);
    expect(krProgress({ id: 'k', title: '', start: 0, target: 10, actual: 15, unit: '' })).toBe(100);
  });

  it('goal progress comes from key results, else weighted children, never typed (YX-PERF-01)', () => {
    const parent = goal({ id: 'p' });
    const a = goal({ id: 'a', parentId: 'p', weight: 75, keyResults: [{ id: 'k', title: '', start: 0, target: 10, actual: 10, unit: '' }] });
    const b = goal({ id: 'b', parentId: 'p', weight: 25, keyResults: [{ id: 'k', title: '', start: 0, target: 10, actual: 0, unit: '' }] });
    expect(goalProgress(parent, [parent, a, b])).toBe(75);
    expect(goalProgress(parent, [parent])).toBeNull();
    expect(goalProgress(GOALS.find((g) => g.id === 'c2')!, GOALS)).not.toBeNull();
  });

  it('goal weights must add to 100', () => {
    expect(weightCheck([{ weight: 50 }, { weight: 40 }])).toMatchObject({ ok: false, total: 90 });
    expect(weightCheck([{ weight: 50 }, { weight: 50 }]).ok).toBe(true);
  });

  it('pending sections never count as 0; empty sections are excluded (YX-PERF-02, U69)', () => {
    const r = reviewScore([
      { id: 'g', title: 'Goals', weight: 60, score: 4 },
      { id: 'c', title: 'Competencies', weight: 30, score: null },
      { id: 'v', title: 'Values', weight: 10, score: 3, empty: true },
    ]);
    expect(r.score).toBe(4);
    expect(r.pending).toEqual(['Competencies']);
    expect(r.excluded).toEqual(['Values']);
    expect(reviewScore([{ id: 'm', title: 'Manager review', weight: 100, score: null }]).score).toBeNull();
  });

  it('maps scores to band labels', () => {
    expect(bandFor(3.72)).toBe('Exceeds');
    expect(bandFor(2.6)).toBe('Meets');
    expect(bandFor(1.2)).toBe('Needs improvement');
    expect(bandFor(4.6)).toBe('Outstanding');
  });

  it('anonymous feedback needs 3 per group; smaller groups merge into Others or are held back (YX-PERF-05)', () => {
    const r = anonymityGroups([
      ...Array(3).fill({ relationship: 'Peer', anonymous: true }),
      ...Array(2).fill({ relationship: 'Direct report', anonymous: true }),
      { relationship: 'Other', anonymous: false },
    ]);
    expect(r.shown).toEqual([{ group: 'Peer', count: 3 }, { group: 'Other', count: 1 }]);
    expect(r.heldBack).toBe(2);
    const merged = anonymityGroups([...Array(2).fill({ relationship: 'Direct report', anonymous: true }), { relationship: 'Other', anonymous: true }]);
    expect(merged.shown).toEqual([{ group: 'Others', count: 3 }]);
  });

  it('checks 360° nomination limits', () => {
    expect(nominationCheck(2, 3, 6)).toMatch(/at least 3/);
    expect(nominationCheck(7, 3, 6)).toMatch(/at most 6/);
    expect(nominationCheck(4, 3, 6)).toBeNull();
  });

  it('comp matrix: Exceeds at compa-ratio 0.85 suggests 10–14%; 20% needs justification (YX-PERF-10)', () => {
    expect(checkProposal('Exceeds', 0.85, 12)).toMatchObject({ range: [10, 14], within: true });
    expect(checkProposal('Exceeds', 0.85, 20)).toMatchObject({ within: false, needsJustification: true });
    expect(budgetUse(100000, [{ annualCost: 60000 }, { annualCost: 50000 }])).toMatchObject({ used: 110000, remaining: -10000, over: true });
  });

  it('cycle eligibility and proration (YX-PERF-21, J11)', () => {
    const cycle = { cycleStart: new Date(2026, 3, 1), cycleEnd: new Date(2027, 2, 31) };
    expect(eligibility({ ...cycle, joined: new Date(2027, 1, 10) }).rule).toBe('Excluded (joined after cut-off)');
    expect(eligibility({ ...cycle, joined: new Date(2026, 6, 1) })).toMatchObject({ rule: 'Prorated (mid-cycle joiner)', eligibleMonths: 9, factor: 0.75 });
    expect(eligibility({ ...cycle, joined: new Date(2020, 0, 1), protectedLeave: true })).toMatchObject({ rule: 'Protected leave', factor: 1 });
    expect(eligibility({ ...cycle, joined: new Date(2020, 0, 1) }).rule).toBe('Included');
  });

  it('9-box labels, distribution, PIP schedule and skill gaps', () => {
    expect(nineBoxLabel(3, 3)).toBe('Future leader');
    expect(distribution([3, 3, 4, 5])).toEqual([0, 0, 50, 25, 25]);
    const p = pipSchedule(new Date(2026, 7, 1), 60, 14);
    expect(p.end).toEqual(new Date(2026, 8, 30));
    expect(p.checkIns).toHaveLength(5);
    expect(skillGap(3, null).label).toBe('Not assessed');
    expect(skillGap(4, 2)).toMatchObject({ gap: 2, label: '2 levels below' });
  });

  it('bias check flags loaded words, personality, age, vague text and rating mismatch (YX-AST-11)', () => {
    const flags = detectBiasFlags('Good job, but abrasive and young. Missed the audit and delayed the release.', 4);
    const kinds = flags.map((f) => f.kind);
    expect(kinds).toContain('Gendered or loaded word');
    expect(kinds).toContain('Age reference');
    expect(kinds).toContain('Vague, no example');
    expect(kinds).toContain('Rating and text disagree');
    expect(detectBiasFlags('Automated 310 of 400 cases.', 4)).toEqual([]);
  });
});

describe('M07 learning rules', () => {
  it('an absent attendee is never completed; attendance threshold and pass mark apply (YX-LRN-01)', () => {
    expect(completionStatus({ kind: 'session', attendedSlots: 0, totalSlots: 4, passScore: 60, score: 90 }).status).toBe('No-show');
    expect(completionStatus({ kind: 'session', attendedSlots: 2, totalSlots: 4 }).status).toBe('Failed');
    expect(completionStatus({ kind: 'session', attendedSlots: 3, totalSlots: 4, passScore: 60, score: 52 }).status).toBe('Failed');
    expect(completionStatus({ kind: 'session', attendedSlots: 3, totalSlots: 4, passScore: 60, score: 81 }).status).toBe('Completed');
    expect(completionStatus({ kind: 'self-paced', requiredDone: 3, requiredTotal: 5 }).status).toBe('In progress');
  });

  it('the 21st enrolment is waitlisted; a withdrawal promotes the next person (YX-LRN-06)', () => {
    let s = { seats: 20, enrolled: Array.from({ length: 20 }, (_, i) => `p${i}`), waitlist: [] as string[] };
    const r = enrol(s, 'p20');
    expect(r.result).toBe('Waitlisted');
    s = { seats: r.seats, enrolled: r.enrolled, waitlist: r.waitlist };
    const w = withdraw(s, 'p3');
    expect(w.promoted).toBe('p20');
    expect(w.enrolled).toHaveLength(20);
    expect(w.waitlist).toHaveLength(0);
  });

  it('budget check warns by default and blocks when set (YX-LRN-07)', () => {
    const b = { planned: 100000, spent: 60000, committed: 30000 };
    expect(budgetCheck(5000, b).level).toBe('ok');
    expect(budgetCheck(20000, b).level).toBe('warn');
    expect(budgetCheck(20000, b, 'block')).toMatchObject({ level: 'block', after: -10000 });
  });

  it('renewal 30 days before expiry, compliance cells and rotating QR code', () => {
    expect(renewalDate(new Date(2026, 10, 1))).toEqual(new Date(2026, 9, 2));
    expect(complianceCell(0, 0).status).toBe('Not assigned');
    expect(complianceCell(61, 72)).toMatchObject({ pct: 85, status: 'At risk' });
    expect(qrToken('S1', 2, 17)).toBe(qrToken('S1', 2, 17));
    expect(qrToken('S1', 2, 17)).not.toBe(qrToken('S1', 2, 18));
  });
});

describe('M09 engage rules', () => {
  it('eNPS = % promoters − % detractors, hidden below 5 responses (YX-ENG-05)', () => {
    expect(enps([10, 9, 9, 8, 7, 3, 2, 6, 10, 9])).toMatchObject({ score: 20, promoters: 5, detractors: 3 });
    expect(enps([10, 9, 9, 8])).toMatchObject({ score: null, suppressed: true });
    expect(canSlice(4)).toBe(false);
  });

  it('kudos need a value, no self points, manager-chain limit, approval above threshold (YX-ENG-06)', () => {
    const base = { giver: 'Divya', receivers: ['Meera'], value: 'Ownership', points: 50, managerChain: ['Karthik'], allowance: 300, approvalThreshold: 100, managerChainLimit: 50 };
    expect(validateKudos(base)).toMatchObject({ errors: [], needsApproval: false });
    expect(validateKudos({ ...base, value: null }).errors[0]).toMatch(/company value/);
    expect(validateKudos({ ...base, receivers: ['Divya'] }).errors[0]).toMatch(/yourself/);
    expect(validateKudos({ ...base, receivers: ['Karthik'], points: 80 }).errors[0]).toMatch(/manager chain/);
    expect(validateKudos({ ...base, points: 150 }).needsApproval).toBe(true);
    expect(validateKudos({ ...base, receivers: ['A', 'B'], points: 200 }).errors.join()).toMatch(/300 points left/);
  });

  it('a ₹6,000 voucher is taxable above the ₹5,000 gift limit (YX-ENG-07)', () => {
    expect(redemptionTax(6000, 0)).toEqual({ taxable: true, taxableAmount: 1000 });
    expect(redemptionTax(1000, 500)).toEqual({ taxable: false, taxableAmount: 0 });
    expect(redemptionTax(1000, 6000)).toEqual({ taxable: true, taxableAmount: 1000 });
  });

  it('blocked words hold a post; 3 reports hide it (YX-ENG-03)', () => {
    expect(moderate('This is a scam', 0, ['scam'])).toMatchObject({ state: 'Held' });
    expect(moderate('Scampi for lunch', 0, ['scam']).state).toBe('Published');
    expect(moderate('Fine text', 3, ['scam']).state).toBe('Hidden');
  });

  it('poll percentages add to 100 and action plans are due in 30 days', () => {
    expect(pollPercents([22, 14, 9]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(pollPercents([0, 0])).toEqual([0, 0]);
    expect(actionPlanDue(new Date(2026, 9, 1))).toEqual(new Date(2026, 9, 31));
  });
});

describe('growth kit interactions', () => {
  it('goal tree collapses and expands a goal', () => {
    render(<GoalTree goals={GOALS} aria-label="Goals" />);
    const btn = screen.getByRole('button', { name: 'Collapse Zero critical quality escapes from Hosur plant' });
    expect(screen.getByText('Supplier audits completed')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText('Supplier audits completed')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Zero critical quality escapes from Hosur plant' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('coach card: Act opens the task (nothing done automatically), Dismiss removes the nudge', () => {
    render(<CoachCard nudges={NUDGES} weekOf={d(28)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Book 1:1' }));
    expect(screen.getByText('Opened')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss nudge about Rohit Bhat' }));
    expect(screen.queryByText('14 leave days unused this year.')).not.toBeInTheDocument();
  });

  it('poll shows results after voting', () => {
    render(<PollBlock poll={{ question: 'Breakfast?', options: ['Idli', 'Pongal'], votes: [3, 1] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pongal' }));
    expect(screen.getByText('Pongal (your vote)')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('bias flags call accept and ignore', () => {
    const flags = detectBiasFlags('She is abrasive', null);
    let accepted = '';
    render(<BiasFlagList flags={flags} onAccept={(f) => (accepted = f.id)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(accepted).toBe(flags[0].id);
  });
});

describe('screen flows', () => {
  it('goal check-in shows the live effect on progress', () => {
    const g = GOALS.find((x) => x.id === 'p3')!;
    render(<GoalCheckInSheet goal={g} open onOpenChange={() => {}} />);
    expect(screen.getByText(/42%/, { selector: 'strong' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /Mentoring sessions held/ }), { target: { value: '9' } });
    fireEvent.blur(screen.getByRole('textbox', { name: /Mentoring sessions held/ }));
    expect(screen.getByText('75%', { selector: 'strong' })).toBeInTheDocument();
  });

  it('360° nominations below the minimum block sending', () => {
    render(<NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS.slice(0, 2)} />);
    expect(screen.getByText('Nominate at least 3 reviewers. You have 2.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Send to manager for approval' })[0]).toBeDisabled();
  });

  it('quick feedback validates the recipient before sending', () => {
    render(<QuickFeedbackScreen me="Divya Raghunathan" people={PEOPLE} goals={[]} received={[]} given={[]} composerOpen />);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Feedback/ }), { target: { value: 'short' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send feedback' }));
    expect(within(dialog).getByText(/at least 20 characters/)).toBeInTheDocument();
  });

  it('kudos without a value shows the error on send', () => {
    render(<GiveKudosScreen me="Divya Raghunathan" people={[{ value: 't3', label: 'Meera Iyer' }]} values={VALUES} badges={BADGES} points={null} defaults={{ to: ['t3'], message: 'Thanks' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send kudos' }));
    expect(screen.getAllByText('Pick a company value for this kudos.').length).toBeGreaterThan(0);
  });

  it('survey shows anonymity first and thanks after sending', () => {
    render(<TakeSurveyScreen title="Pulse" anonymity="Anonymous" closes={d(30)} questions={PULSE_QUESTIONS} />);
    expect(screen.getByText('This survey is anonymous')).toBeInTheDocument();
    const scale = screen.getByRole('radiogroup', { name: PULSE_QUESTIONS[0].text });
    fireEvent.click(within(scale).getByRole('radio', { name: '9' }));
    expect(within(scale).getByRole('radio', { name: '9' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getAllByRole('button', { name: 'Send answers' })[0]);
    expect(screen.getByText('Thank you, your answers are in')).toBeInTheDocument();
  });

  it('manager results for a team under 5 are suppressed for everyone (YX-ENG-04)', () => {
    render(<SurveyResultsScreen persona="mgr" results={RESULTS} team={TEAM_SMALL} />);
    expect(screen.getByText('Not enough responses to display.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create action plan' })).not.toBeInTheDocument();
  });
});

describe('every growth story renders', () => {
  const modules = import.meta.glob('./*.stories.tsx', { eager: true }) as Record<string, Record<string, unknown>>;
  for (const [file, mod] of Object.entries(modules)) {
    for (const [name, story] of Object.entries(mod)) {
      if (name === 'default' || typeof story !== 'object' || story == null || !('render' in story)) continue;
      it(`${file} · ${name}`, () => {
        const Render = (story as { render: () => JSX.Element }).render;
        const { unmount } = render(<Render />);
        expect(document.body.textContent?.length).toBeGreaterThan(0);
        unmount();
      });
    }
  }
});
