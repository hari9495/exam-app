import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  abscondingState,
  addWorkingDays,
  applyIncrement,
  canSeePay,
  extensionAllowed,
  fieldVisibility,
  fnfTotals,
  gratuity,
  isIban,
  isIfsc,
  isPan,
  matchPersons,
  noticeOutcome,
  preclearanceState,
  probationState,
  reanchor,
  retrenchmentCompensation,
  reverificationDue,
  splitByShares,
  splitNetPay,
  successionRisk,
  validateImport,
  withinWindow,
  workingDaysUntil,
} from './people-logic';
import { d, HOLIDAYS, MATCHES, MEERA_FNF, ONBOARDING_TASKS, SPLITS, TODAY, WORKFORCE } from './people-data';
import { BulkChangesWizard, ChangeActionSheet, EmployeeImportWizard, RestructureWizard, incrementPreview, SAMPLE_IMPORT, ScheduledChangesScreen } from './changes';
import { DirectoryScreen } from './directory';
import { PersonWorkspace, InternationalBankTab } from './record';
import { BOARD, BuddyPanel, JourneyRecord, OnboardingBoard, PreboardingBatches, ProbationQueue, ProbationReviewForm, ReadyToOnboardQueue } from './onboarding';
import { BATCHES, BUDDIES, KAVYA_JOIN, PROBATIONS, READY_TO_ONBOARD, SCHEDULED } from './people-data';

describe('P02 field visibility', () => {
  it('follows the class defaults per persona', () => {
    expect(fieldVisibility('Public', 'emp', 'other')).toBe('read');
    expect(fieldVisibility('Personal', 'mgr', 'team')).toBe('hidden');
    expect(fieldVisibility('Internal', 'mgr', 'team')).toBe('read');
    expect(fieldVisibility('Confidential', 'mgr', 'team')).toBe('hidden');
    expect(fieldVisibility('Confidential', 'mgr', 'team', true)).toBe('read');
    expect(fieldVisibility('Special', 'hr', 'other')).toBe('masked');
    expect(fieldVisibility('Confidential', 'hr', 'other')).toBe('masked');
    expect(fieldVisibility('Confidential', 'emp', 'self')).toBe('masked');
    expect(fieldVisibility('Personal', 'emp', 'self')).toBe('edit');
  });
  it('gates the Pay tab', () => {
    expect(canSeePay('mgr', 'team')).toBe(false);
    expect(canSeePay('mgr', 'team', true)).toBe(true);
    expect(canSeePay('emp', 'self')).toBe(true);
    expect(canSeePay('hr', 'other')).toBe(true);
  });
});

describe('dates and deadlines', () => {
  it('pays wages within 2 working days, skipping Sundays and holidays', () => {
    // LWD Mon 19 Oct 2026; 20 Oct is Ayudha Puja → due Thu 22 Oct.
    expect(addWorkingDays(d(2026, 10, 19), 2, HOLIDAYS)).toEqual(d(2026, 10, 22));
    // Sat 3 Oct → Mon 5 Oct and Tue 6 Oct (Sun 4 Oct off; 2 Oct holiday is before).
    expect(addWorkingDays(d(2026, 10, 3), 2, HOLIDAYS)).toEqual(d(2026, 10, 6));
    expect(workingDaysUntil(d(2026, 10, 21), d(2026, 10, 22), HOLIDAYS)).toBe(1);
    expect(workingDaysUntil(d(2026, 10, 26), d(2026, 10, 22), HOLIDAYS)).toBe(-3);
  });
  it('computes notice shortfall from the policy on the submission date', () => {
    const n = noticeOutcome(TODAY, 60, d(2026, 11, 6), 30000);
    expect(n.standardLwd).toEqual(d(2026, 11, 28));
    expect(n.shortfallDays).toBe(22);
    expect(n.shortfallAmount).toBe(22000);
    expect(noticeOutcome(TODAY, 60, null, 30000).shortfallDays).toBe(0);
  });
});

describe('F&F', () => {
  it('totals explained lines (Meera)', () => {
    const t = fnfTotals(MEERA_FNF);
    expect(t.earnings).toBe(42300 + 8000 + 9800 + 110769 + 3450);
    expect(t.recoveries).toBe(5000);
    expect(t.net).toBe(t.earnings - 5000 - 6210);
  });
  it('applies gratuity eligibility rules', () => {
    expect(gratuity(32000, 67).amount).toBe(110769);
    expect(gratuity(32000, 59).eligible).toBe(false);
    const ft = gratuity(26000, 18, { fixedTerm: true });
    expect(ft.eligible).toBe(true);
    expect(ft.amount).toBe(Math.round((15 / 26) * 26000 * 1.5));
    expect(gratuity(26000, 11, { fixedTerm: true }).eligible).toBe(false);
    expect(gratuity(28000, 50, { death: true }).eligible).toBe(true);
    expect(gratuity(900000, 400).amount).toBe(2000000);
  });
  it('computes retrenchment compensation per completed year', () => {
    expect(retrenchmentCompensation(1000, 47)).toBe(45000);
    expect(retrenchmentCompensation(1000, 11)).toBe(0);
  });
  it('splits nominee payouts exactly', () => {
    const parts = splitByShares(100001, [70, 30]);
    expect(parts.reduce((s, x) => s + x, 0)).toBe(100001);
    expect(() => splitByShares(100, [60, 30])).toThrow();
  });
});

describe('lifecycle rules', () => {
  it('escalates probation reviews and never auto-confirms', () => {
    expect(probationState(d(2026, 10, 5), TODAY)).toBe('review due');
    expect(probationState(d(2026, 9, 29), TODAY)).toBe('overdue');
    expect(probationState(d(2026, 9, 15), TODAY)).toBe('escalated');
    expect(probationState(d(2026, 12, 1), TODAY)).toBe('running');
    expect(extensionAllowed(6, 0, 6, 12)).toBe(true);
    expect(extensionAllowed(6, 3, 6, 12)).toBe(false);
  });
  it('re-anchors open tasks only', () => {
    const m = reanchor(ONBOARDING_TASKS, d(2026, 10, 5), d(2026, 10, 19));
    expect(m.t1.to).toEqual(m.t1.from); // done
    expect(m.t2.to).toEqual(d(2026, 10, 12)); // −7 from 19 Oct
  });
  it('runs the absconding timeline and can be stopped', () => {
    expect(abscondingState(d(2026, 9, 21), TODAY).status).toBe('running');
    expect(abscondingState(d(2026, 9, 21), TODAY).rows.filter((r) => r.status === 'done')).toHaveLength(2);
    expect(abscondingState(d(2026, 9, 21), d(2026, 10, 13)).status).toBe('deemed abandoned');
    expect(abscondingState(d(2026, 9, 21), TODAY, undefined, true).status).toBe('stopped');
  });
});

describe('identity and bank checks', () => {
  it('validates PAN, IFSC and IBAN', () => {
    expect(isPan('ABCDE1234F')).toBe(true);
    expect(isPan('ABCDE1234')).toBe(false);
    expect(isIfsc('CNRB0001234')).toBe(true);
    expect(isIfsc('CNRB1001234')).toBe(false);
    expect(isIban('AE07 0331 2345 6789 0123 456')).toBe(true);
    expect(isIban('AE07 0331 2345 6789 0123 457')).toBe(false);
    expect(isIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
  });
  it('splits net pay: fixed, then percent, remainder; max 3 accounts', () => {
    const r = splitNetPay(49812, SPLITS);
    expect(r.ok).toBe(true);
    expect(r.amounts.a2).toBe(2500);
    expect(r.amounts.a3).toBe(Math.round(47312 * 0.1));
    expect(r.amounts.a1 + r.amounts.a2 + r.amounts.a3).toBe(49812);
    expect(splitNetPay(1000, [...SPLITS, { id: 'x', label: 'x', rule: 'fixed', value: 1 }]).ok).toBe(false);
    expect(splitNetPay(1000, [SPLITS[0], { ...SPLITS[1], value: 5000 }]).error).toMatch(/more than the net pay/);
  });
  it('links on deterministic keys, proposes on name + DOB, never on name alone', () => {
    expect(matchPersons({ name: 'A B', pan: 'ABCDE1234F' }, { name: 'Other', pan: 'ABCDE1234F' }).kind).toBe('auto-link');
    expect(matchPersons(MATCHES[0].left, MATCHES[0].right).kind).toBe('propose');
    expect(matchPersons(MATCHES[2].left, MATCHES[2].right).kind).toBe('none');
    expect(matchPersons({ name: 'Priya Nair' }, { name: 'Priya Nair' }).kind).toBe('none');
  });
});

describe('other rules', () => {
  it('validates imports with fix-it messages', () => {
    const issues = validateImport(SAMPLE_IMPORT, ['KF-0001', 'KF-0142'], [{ code: 'KF-0142', name: 'Arjun Kulkarni', pan: 'AKDPK4821M' }]);
    const fields = issues.map((i) => `${i.row}:${i.field}`);
    expect(fields).toEqual(expect.arrayContaining(['3:PAN', '4:Already an employee', '5:Name', '5:Manager code', '5:Joining date']));
    expect(fields).not.toContain('4:Employee code');
    expect(issues.some((i) => i.row === 2 || i.row === 6)).toBe(false);
  });
  it('keeps the pre-clearance window and blocks closed windows', () => {
    expect(preclearanceState(d(2026, 9, 28), 7, TODAY, false, false)).toBe('valid');
    expect(preclearanceState(d(2026, 9, 14), 7, TODAY, false, false)).toMatch(/^expired/);
    expect(preclearanceState(d(2026, 9, 28), 7, TODAY, false, true)).toMatch(/^blocked/);
  });
  it('flags re-verification, succession risk, increments and windows', () => {
    expect(reverificationDue(d(2023, 10, 20), 3, TODAY)).toBe('due soon');
    expect(reverificationDue(d(2023, 8, 14), 3, TODAY)).toBe('overdue');
    expect(successionRisk([])).toBe('No successor');
    expect(successionRisk([{ readiness: '1–2 years' }])).toBe('No ready successor');
    expect(applyIncrement(690000, 8)).toBe(745200);
    expect(withinWindow(d(2026, 10, 12), TODAY, 30)).toBe(true);
    expect(withinWindow(d(2026, 12, 1), TODAY, 30)).toBe(false);
  });
});

describe('screens', () => {
  it('directory: employees see public columns only; HR can switch workforce', async () => {
    const u = userEvent.setup();
    const { unmount } = render(<DirectoryScreen persona="emp" rows={WORKFORCE.slice(0, 30)} />);
    expect(screen.queryByRole('tablist', { name: 'Workforce' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Status/ })).toBeNull();
    // Employees get My team / My department / My location chips.
    await u.click(screen.getByRole('radio', { name: 'My department' }));
    expect(screen.getByRole('radio', { name: 'My department' })).toHaveAttribute('aria-checked', 'true');
    unmount();
    render(<DirectoryScreen persona="hr" rows={WORKFORCE} />);
    // The number cards are the switch; all persons counts distinct people (310), not roles (312).
    expect(screen.getByRole('tab', { name: /All persons\s*310/ })).toBeTruthy();
    await u.click(screen.getByRole('tab', { name: /Contract workers/ }));
    expect(screen.getAllByRole('columnheader', { name: /Contractor/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Add contract worker/ })).toBeTruthy();
  });

  it('record: Pay tab is gated for a manager without a salary grant', () => {
    render(<PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="pay" />);
    expect(screen.getByRole('button', { name: 'Request access' })).toBeTruthy();
    expect(screen.queryByText('Salary structure (monthly)')).toBeNull();
  });

  it('record: HR reveal of a masked field is announced as audited', async () => {
    const u = userEvent.setup();
    render(<PersonWorkspace persona="hr" relation="other" today={TODAY} />);
    expect(screen.getByText('XXXXXX821M')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: /Show PAN/ }));
    expect(screen.getByText('AKDPK4821M')).toBeTruthy();
    expect(screen.getByText(/You viewed PAN/)).toBeTruthy();
  });

  it('probation: extending past the maximum shows an error', () => {
    render(<ProbationReviewForm outcome="extend" months={9} />);
    expect(screen.getByText(/12 months at most/)).toBeTruthy();
  });

  it('scheduled changes: cancel needs a reason', async () => {
    const u = userEvent.setup();
    render(<ScheduledChangesScreen rows={SCHEDULED} today={TODAY} defaultCancelId="s2" />);
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Cancel change' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await u.type(within(dialog).getByRole('textbox'), 'Transfer postponed by the client');
    expect(confirm.hasAttribute('disabled')).toBe(false);
  });

  it('international bank: invalid IBAN blocks sending', () => {
    render(<InternationalBankTab persona="hr" splits={SPLITS} net={49812} defaultIban="AE07 0331 2345 6789 0123 457" />);
    expect(screen.getByText(/Enter a 23-character UAE IBAN/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send for approval' }).hasAttribute('disabled')).toBe(true);
  });
});

// Smoke test: every People story renders without throwing (the lead checks visuals in Storybook).
const STORY_MODULES = import.meta.glob('./*.stories.tsx', { eager: true }) as Record<string, Record<string, { render?: () => JSX.Element; name?: string }>>;
describe('all People stories render', () => {
  for (const [file, mod] of Object.entries(STORY_MODULES)) {
    for (const [key, story] of Object.entries(mod)) {
      if (key === 'default' || !story?.render) continue;
      it(`${file} · ${story.name ?? key}`, () => {
        const { unmount } = render(story.render!());
        unmount();
      });
    }
  }
});

describe('onboarding board', () => {
  it('counts a campus batch as its people, and filters to overdue joiners', async () => {
    const u = userEvent.setup();
    render(<OnboardingBoard columns={BOARD} />);
    expect(screen.getByText(/8 joiners and 1 campus batch \(12 people\) · 20 people in all/)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: /Only overdue \(4\)/ }));
    expect(screen.getByRole('button', { name: /Only overdue \(4\)/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Ananya Das')).toBeNull();
    expect(screen.getByText('Suresh Nair')).toBeTruthy();
  });
});

describe('ready to onboard', () => {
  it('lists only offers not created yet, soonest first, and flags rehire overrides', async () => {
    const u = userEvent.setup();
    render(<ReadyToOnboardQueue rows={READY_TO_ONBOARD} />);
    expect(screen.queryByText('Kavya Reddy')).toBeNull();
    const names = screen.getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(names[0]).toMatch(/Selvi Perumal/);
    expect(screen.getAllByText('in 7 days').length).toBeGreaterThan(0);
    await u.click(screen.getAllByRole('button', { name: 'Create employee' })[0]);
    expect(screen.getByText('Reuses KF-0077')).toBeTruthy();
    expect(screen.getByText('Everything follows company policy.')).toBeTruthy();
  });
});

describe('journey record', () => {
  it('groups by phase, folds done tasks, issues the letter and blocks a waiting task', () => {
    render(<JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={TODAY} />);
    expect(screen.getByRole('heading', { name: 'Before joining' })).toBeTruthy();
    expect(screen.getByText('Done (2)', { selector: 'summary' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Issue letter/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('Waiting for: Laptop and inspection tablet')).toBeTruthy();
    expect(screen.getByText('1 task is past the due date. Owners got a reminder.')).toBeTruthy();
    expect(screen.getByText('KR')).toBeTruthy();
  });
});

describe('pre-boarding batches', () => {
  it('lists soonest batch first and counts offers still on letter of intent', () => {
    render(<PreboardingBatches rows={BATCHES} />);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Campus 2026 · Sales trainees')).toBeTruthy();
    expect(screen.getByText('6 still on letter of intent')).toBeTruthy();
  });
  it('opens the date change on the current date and says which way tasks move', async () => {
    const u = userEvent.setup();
    render(<PreboardingBatches rows={BATCHES} />);
    await u.click(screen.getAllByRole('button', { name: 'Change date' })[0]);
    expect(screen.getByRole('button', { name: 'Move 12 members' })).toBeDisabled();
  });
  it('re-anchors forward with a notify option', () => {
    render(<PreboardingBatches rows={BATCHES} defaultChangeId="b3" defaultDate={new Date(2026, 10, 2)} />);
    expect(screen.getByText(/per member move 14 days later/)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Email the 12 members their new date' })).toBeChecked();
  });
});

describe('probation reviews', () => {
  it('says how far the end date is in words and builds the escalation from data', () => {
    render(<ProbationQueue rows={PROBATIONS} today={TODAY} />);
    expect(screen.getByText('14 days ago')).toBeTruthy();
    expect(screen.getByText('Extended 3 months')).toBeTruthy();
    expect(screen.getByText(/Vikram Singh's probation ended on 15 Sep 2026/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Remind manager' })).toHaveLength(4);
  });
  it('opens the review form from Decide', async () => {
    const u = userEvent.setup();
    render(<ProbationQueue rows={PROBATIONS} today={TODAY} />);
    await u.click(screen.getAllByRole('button', { name: 'Decide' })[0]);
    expect(screen.getByRole('dialog', { name: /Probation review: Vikram Singh/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm Vikram' })).toBeTruthy();
  });
  it('manager sees only their reports, without a Manager column', () => {
    render(<ProbationQueue rows={PROBATIONS.filter((p) => p.manager === 'Divya Raghunathan')} today={TODAY} persona="mgr" />);
    expect(screen.queryByRole('columnheader', { name: /Manager/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Review' }).filter((b) => b.dataset.variant === 'review')).toHaveLength(1);
  });
});

describe('buddies', () => {
  it('lists joiners without a buddy and who each buddy looks after', () => {
    render(<BuddyPanel pool={BUDDIES} />);
    expect(screen.getByText('Needs a buddy (2)')).toBeTruthy();
    expect(screen.getByText(/Kavya Reddy · joins 5 Oct 2026/)).toBeTruthy();
    expect(screen.getByText('Leaving')).toBeTruthy();
    expect(screen.getByText(/Leaving 28 Nov 2026 · reassign Kiran Joshi and Ananya Das/)).toBeTruthy();
  });
  it('suggests a buddy from the same team and location', () => {
    render(<BuddyPanel pool={BUDDIES} assignFor="k3" />);
    const d = screen.getByRole('dialog', { name: 'Assign a buddy to Murugan K' });
    expect(within(d).getByText('Thomas George')).toBeTruthy();
  });
});

describe('probation review form', () => {
  it('reviews the manager’s own report, with a deadline and no pre-filled rating', () => {
    render(<ProbationReviewForm />);
    expect(screen.getByText('Probation review: Rohit Menon')).toBeTruthy();
    expect(screen.getByText(/Decide by 12 Oct 2026 \(in 13 days\)/)).toBeTruthy();
    expect(screen.getByText('Choose a rating')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm Rohit' }).dataset.variant).toBe('approve');
  });
  it('extending shows the new end date', () => {
    render(<ProbationReviewForm outcome="extend" months={3} />);
    expect(screen.getByText('New end date: 12 Jan 2027')).toBeTruthy();
  });
  it('a recommendation to end employment asks whether concerns were raised', async () => {
    const u = userEvent.setup();
    render(<ProbationReviewForm outcome="terminate" />);
    await u.click(screen.getByRole('radio', { name: 'No' }));
    expect(screen.getByText(/Talk to Rohit first/)).toBeTruthy();
  });
});

describe('change action', () => {
  it('HR sees the raise size and only what changes, with the rest folded', () => {
    render(<ChangeActionSheet persona="hr" kind="Promotion" effective={d(2026, 10, 1)} today={TODAY} />);
    expect(screen.getByText(/\+13% on the current/)).toBeTruthy();
    expect(screen.getByText('What changes (5)')).toBeTruthy();
    expect(screen.getByText('Stays the same (1)')).toBeTruthy();
    expect(screen.getByText('Goes to Karthik Subramanian, then Lakshmi Venkatesan.')).toBeTruthy();
  });
  it('a manager sees no pay band', () => {
    render(<ChangeActionSheet persona="mgr" kind="Promotion" effective={d(2026, 10, 1)} today={TODAY} />);
    expect(screen.queryByText(/₹6,80,000/)).toBeNull();
    expect(screen.getByText('Pay is proposed by HR')).toBeTruthy();
  });
  it('a transfer gets its own reason', () => {
    render(<ChangeActionSheet persona="hr" kind="Transfer" effective={d(2026, 10, 5)} today={TODAY} />);
    expect(screen.getByDisplayValue(/Chennai key accounts/)).toBeTruthy();
  });
});

describe('scheduled changes', () => {
  it('hides pay until shown, and counts each window', async () => {
    const u = userEvent.setup();
    render(<ScheduledChangesScreen rows={SCHEDULED} today={TODAY} defaultWindow={90} />);
    expect(screen.getByRole('radio', { name: 'Next 30 days (3)' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Next 90 days (7)' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('₹6,90,000 → ₹7,80,000')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Show pay' }));
    expect(screen.getByText('₹6,90,000 → ₹7,80,000')).toBeTruthy();
  });
  it('explains two changes for one person and filters to pending approval', async () => {
    const u = userEvent.setup();
    render(<ScheduledChangesScreen rows={SCHEDULED} today={TODAY} defaultWindow={90} />);
    expect(screen.getByText('Thomas George has two changes')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Only pending approval (1)' }));
    expect(screen.queryByText('Rahul Sharma')).toBeNull();
    expect(screen.getByText('Waiting for Lakshmi Venkatesan')).toBeTruthy();
  });
});

describe('bulk changes', () => {
  it('pay sits inside grade bands, so only 3 people go above band, and capping clears them', () => {
    const rows = incrementPreview({ Exceeds: 12, Meets: 8, Below: 3 });
    const flagged = rows.filter((r) => r.flag);
    expect(flagged).toHaveLength(3);
    const capped = incrementPreview({ Exceeds: 12, Meets: 8, Below: 3 }, {}, flagged.map((r) => r.id));
    expect(capped.filter((r) => r.flag)).toHaveLength(0);
  });
  it('sends for approval with a plain confirm and bordered Edit buttons on review', () => {
    render(<BulkChangesWizard current="review" confirmOpen />);
    expect(screen.getAllByRole('button', { name: 'Edit Set the rule', hidden: true })[0].className).toContain('yx-button');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Lakshmi Venkatesan sends it\. Suresh Pillai approves it\./)).toBeTruthy();
    expect(within(dialog).queryByRole('textbox')).toBeNull();
  });
  it('the rule step shows people and added cost per rating', () => {
    render(<BulkChangesWizard current="rule" />);
    expect(screen.getByLabelText('Increase for Exceeds')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Added cost a year' })).toBeTruthy();
  });
});

describe('restructure', () => {
  it('splits checks before sending from what happens after approval, and blocks sending while payroll is open', () => {
    render(<RestructureWizard current="close" payrollLocked={false} />);
    expect(screen.getByText('96 employments ready to move')).toBeTruthy();
    expect(screen.getByText('PF, ESI and PT registrations surrendered')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open September payroll' })).toBeTruthy();
  });
  it('the finish button is disabled with a reason while blocked', () => {
    render(<RestructureWizard current="review" payrollLocked={false} />);
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeDisabled();
    expect(screen.getByText('Lock September payroll first')).toBeTruthy();
  });
});

describe('employee import', () => {
  it('cannot continue without a file', () => {
    render(<EmployeeImportWizard />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByText('Upload a file first')).toBeTruthy();
  });
  it('groups problems by person, spots an existing employee, and lists ready rows', () => {
    render(<EmployeeImportWizard current="validate" />);
    expect(screen.getByText('Row 4 · Arjun K')).toBeTruthy();
    expect(screen.getByText(/Looks like Arjun Kulkarni \(KF-0142, same PAN\)/)).toBeTruthy();
    expect(screen.getByText('Ready to import (2)')).toBeTruthy();
    expect(screen.getByText(/manager is in this file \(Harini Suresh\)/)).toBeTruthy();
  });
  it('fixing a PAN here and checking again makes the row ready', async () => {
    const u = userEvent.setup();
    render(<EmployeeImportWizard current="validate" />);
    const pan = screen.getByLabelText('PAN for row 3');
    await u.clear(pan);
    await u.type(pan, 'CFBPB8812K');
    await u.click(screen.getByRole('button', { name: 'Check again' }));
    expect(screen.getByText('Ready to import (3)')).toBeTruthy();
  });
});

import { ExitCasesList, ExitCaseWorkspace } from './exits';
import { EXIT_CASES } from './people-data';

describe('exit cases', () => {
  it('shows overdue F&F and only real risks in amber', () => {
    render(<ExitCasesList rows={EXIT_CASES} />);
    expect(screen.getByText('F&F overdue by 7 days')).toBeTruthy();
    expect(screen.getByText('Ravi Shankar')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Open case for / })).toHaveLength(6);
  });
  it('a manager sees only their own reports', () => {
    render(<ExitCasesList rows={EXIT_CASES} persona="mgr" />);
    expect(screen.getByText('Meera Iyer')).toBeTruthy();
    expect(screen.queryByText('Joseph Mathew')).toBeNull();
  });
  it('a held termination has its own facts and cannot close', () => {
    render(<ExitCaseWorkspace today={TODAY} variant="held" current="documents" />);
    expect(screen.getByText('Paid in lieu (30 days)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close exit case' })).toBeDisabled();
    expect(screen.getByText('Letters are held for an open case')).toBeTruthy();
  });
});

import { FnfCalculator } from './exits';

describe('F&F calculator', () => {
  it('splits pay now from what is held for an open case', () => {
    render(<FnfCalculator variant="held" today={TODAY} />);
    expect(screen.getByText('₹48,890')).toBeTruthy();
    expect(screen.getByText('₹1,14,219')).toBeTruthy();
    expect(screen.getAllByText('Held for open case')).toHaveLength(2);
  });
  it('overdue offers paying the wage lines now', () => {
    render(<FnfCalculator variant="overdue" today={d(2026, 10, 24)} />);
    expect(screen.getByRole('button', { name: 'Pay wage lines now (₹60,100)' })).toBeTruthy();
  });
  it('absconding shows a hold, not an overdue countdown, and its own run number', () => {
    render(<FnfCalculator variant="absconding" today={d(2026, 10, 13)} />);
    expect(screen.getByText('Held until Rohit claims it')).toBeTruthy();
    expect(screen.queryByText(/Overdue by/)).toBeNull();
    expect(screen.getByText(/FNF-2026-0038/)).toBeTruthy();
  });
});
