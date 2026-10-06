import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  blueprintCell,
  calcApply,
  canReschedule,
  deliveryMode,
  filterByRisk,
  impactRatios,
  inheritedSensitivity,
  integrityLevel,
  integrityScore,
  needsModeration,
  netWpm,
  overallOutcome,
  planWaves,
  proctorActionError,
  publishChecks,
  slotState,
  sortByConcern,
  suppress,
  timeCredit,
  verdictError,
  withExtraTime,
} from './proctoring-logic';
import { Calculator, SystemCheckList } from './proctoring-kit';
import { LIVE_TILES, READINESS_CHECKS, SIGNALS_SNEHA } from './proctoring-data';
import { ConsentScreen } from './candidate';
import { LiveConsoleScreen } from './live';

describe('integrity score (YX-PROC-14)', () => {
  it('deducts weight × count, sorted by contribution, and maps to levels', () => {
    const { score, contributions } = integrityScore(SIGNALS_SNEHA);
    expect(score).toBe(100 - (24 + 18 + 12 + 6));
    expect(contributions[0].signal).toBe('multiple-faces');
    expect(contributions.find((c) => c.signal === 'llm')?.deduction).toBe(0);
    expect(integrityLevel(score)).toBe('high');
    expect(integrityLevel(64)).toBe('review');
    expect(integrityLevel(80)).toBe('clear');
  });
  it('never goes below 0', () => {
    expect(integrityScore([{ signal: 'x', label: 'x', count: 20, weight: 18 }]).score).toBe(0);
  });
});

describe('live console', () => {
  it('sorts by concern and filters by risk', () => {
    const sorted = sortByConcern(LIVE_TILES);
    expect(sorted[0].name).toBe('Sneha Iyer');
    expect(filterByRisk(LIVE_TILES, 'high').every((t) => t.score < 50)).toBe(true);
    expect(filterByRisk(LIVE_TILES, 'all')).toHaveLength(LIVE_TILES.length);
  });
  it('requires a reason for proctor actions (YX-PROC-09)', () => {
    expect(proctorActionError('')).toMatch(/reason/);
    expect(proctorActionError('Second person seen twice')).toBeNull();
  });
});

describe('delivery rules (T03)', () => {
  it('credits up to 10 minutes automatically and asks approval beyond (Q4)', () => {
    expect(timeCredit(90)).toEqual({ auto: 90, needsApproval: 0, reauth: false });
    expect(timeCredit(820)).toEqual({ auto: 600, needsApproval: 220, reauth: true });
  });
  it('applies extra time and slot capacity', () => {
    expect(withExtraTime(75, 25)).toBe(94);
    expect(slotState(36, 36)).toBe('full');
    expect(slotState(48, 40)).toBe('filling');
    expect(slotState(36, 12)).toBe('open');
  });
  it('limits reschedules to 2 and 24 h before (Q1)', () => {
    expect(canReschedule(1, 72).ok).toBe(true);
    expect(canReschedule(2, 72).ok).toBe(false);
    expect(canReschedule(0, 10).reason).toMatch(/24 hours/);
  });
  it('splits a drive into waves', () => {
    expect(planWaves(3600, 1200)).toEqual([1200, 1200, 1200]);
    expect(planWaves(2500, 1000)).toEqual([1000, 1000, 500]);
  });
});

describe('test builder (T02)', () => {
  it('needs 3 × drawn approved items per blueprint cell (YX-TB-01)', () => {
    expect(blueprintCell(5, 8)).toEqual({ required: 15, ok: false });
    expect(blueprintCell(2, 9).ok).toBe(true);
    expect(blueprintCell(0, 0).ok).toBe(true);
  });
  it('blocks publishing on failed checks and certification without a study', () => {
    const c = publishChecks({ draftQuestions: 0, weightsTotal: 100, cellsShort: 1, certification: true, cutScoreApproved: false });
    expect(c.filter((x) => !x.ok).map((x) => x.id)).toEqual(['depth', 'cut']);
  });
  it('fails the overall result when a section cut-off is missed (YX-TB-15)', () => {
    expect(overallOutcome(72, 60, [{ name: 'Aptitude', score: 45, cutoff: 50 }, { name: 'Java', score: 81, cutoff: 60 }])).toEqual({ pass: false, failed: ['Aptitude'] });
    expect(overallOutcome(72, 60, [{ name: 'Java', score: 81, cutoff: 60 }]).pass).toBe(true);
  });
});

describe('integrity verdicts (T05)', () => {
  it('needs a reason and a second reviewer to invalidate an attempt (YX-EVAL-01/02)', () => {
    expect(verdictError(null, '', null)).toMatch(/Choose/);
    expect(verdictError('cleared', 'short', null)).toMatch(/reason/);
    expect(verdictError('attempt', 'Second person reading the screen', null)).toMatch(/second reviewer/);
    expect(verdictError('attempt', 'Second person reading the screen', 'Gopal Menon')).toBeNull();
  });
  it('sends large disagreements to moderation (YX-EVAL-05)', () => {
    expect(needsModeration(4, 9)).toBe(true);
    expect(needsModeration(7, 9)).toBe(false);
  });
  it('flags impact ratios below 0.8 and suppresses small groups (A13)', () => {
    const r = impactRatios([
      { group: 'Men', passed: 612, total: 1180 },
      { group: 'Women', passed: 388, total: 1210 },
      { group: 'Tiny', passed: 2, total: 3 },
    ]);
    expect(r[0].status).toBe('ok');
    expect(r[1].status).toBe('flagged');
    expect(r[1].ratio).toBeCloseTo(0.618, 2);
    expect(r[2].status).toBe('suppressed');
  });
  it('computes net WPM (YX-EVAL-20)', () => {
    expect(netWpm(250, 5, 1)).toBe(45);
  });
});

describe('analytics rules (P09)', () => {
  it('suppresses groups under the threshold', () => {
    expect(suppress([{ label: 'A', value: 4, n: 3 }, { label: 'B', value: 9, n: 12 }]).map((x) => x.shown)).toEqual([null, 9]);
  });
  it('inherits the most restrictive sensitivity (YX-MET-11)', () => {
    expect(inheritedSensitivity(['Internal', 'Confidential'])).toBe('Confidential');
    expect(inheritedSensitivity(['Internal', 'Special', 'Confidential'])).toBe('Special');
  });
  it('attaches files only for Internal data by email (YX-MET-08)', () => {
    expect(deliveryMode('Internal', 'email')).toBe('attachment');
    expect(deliveryMode('Confidential', 'email')).toBe('secure link');
    expect(deliveryMode('Internal', 'whatsapp')).toBe('secure link');
  });
});

describe('components', () => {
  it('calculator adds, divides and refuses divide by zero', async () => {
    const user = userEvent.setup();
    render(<Calculator />);
    await user.click(screen.getByRole('button', { name: '7' }));
    await user.click(screen.getByRole('button', { name: 'plus' }));
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: 'equals' }));
    expect(document.querySelector('output')?.textContent).toBe('12');
    await user.click(screen.getByRole('button', { name: 'divide by' }));
    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: 'equals' }));
    expect(document.querySelector('output')?.textContent).toBe('Error');
    expect(calcApply(1, '÷', 3)).toBeCloseTo(0.33333333);
  });

  it('system check shows fix steps only for failed or warning checks', () => {
    render(<SystemCheckList checks={READINESS_CHECKS} onRetry={() => {}} />);
    const screenRow = screen.getByText('Screen share').closest('li')!;
    expect(within(screenRow).getByText('How to fix it')).toBeInTheDocument();
    expect(within(screenRow).getByText('Blocks the start')).toBeInTheDocument();
    const cameraRow = screen.getByText('Camera').closest('li')!;
    expect(within(cameraRow).queryByText('How to fix it')).toBeNull();
  });

  it('consent needs recording and biometric agreement before continuing', () => {
    render(<ConsentScreen />);
    const go = screen.getByRole('button', { name: 'Agree and continue' });
    expect(go).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /recording for this test/ }));
    expect(go).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /face and ID checks/ }));
    expect(go).toBeEnabled();
  });

  it('under-18 consent also needs the guardian', () => {
    render(<ConsentScreen minor />);
    fireEvent.click(screen.getByRole('checkbox', { name: /recording for this test/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /face and ID checks/ }));
    expect(screen.getByRole('button', { name: 'Agree and continue' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /guardian/ }));
    expect(screen.getByRole('button', { name: 'Agree and continue' })).toBeEnabled();
    expect(screen.queryByText(/typing-rhythm/)).toBeNull();
  });

  it('live console: filter, open a tile by shortcut, end attempt only with a reason', async () => {
    render(<LiveConsoleScreen tiles={LIVE_TILES} />);
    fireEvent.click(screen.getByRole('button', { name: /^High concern/ }));
    expect(screen.getAllByRole('button', { name: /shortcut/ })).toHaveLength(1);
    fireEvent.keyDown(screen.getAllByRole('button', { name: /shortcut 1/ })[0], { key: '1' });
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'End attempt' }));
    const confirm = await screen.findByRole('alertdialog').catch(() => screen.getAllByRole('dialog').at(-1)!);
    const btn = within(confirm).getByRole('button', { name: 'End attempt' });
    expect(btn).toBeDisabled();
    fireEvent.change(within(confirm).getByRole('textbox'), { target: { value: 'Second person seen three times' } });
    expect(btn).toBeEnabled();
  });
});
