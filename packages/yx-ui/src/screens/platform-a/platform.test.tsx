import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  bulkApprovable, filterRows, leaveDays, leaveEffect, parseQuery, readiness, ruleWarnings, simulatePolicy, slaText, sodConflicts, validateDelegation,
} from './platform-kit';
import { HOLIDAYS_2026, TODAY } from '../_kit/data';
import { APPROVALS } from './platform-data';
import { EXPENSE_POLICIES } from './setup-admin';
import { SAMPLE_RULES, checkFormula } from './governance';
import { apiNameFrom, moveField, sensitiveCategory, EMPLOYEE_LAYOUT } from './custom';
import { buildIndex, searchSettings } from '../settings/settings-logic';
import { SETTINGS_GROUPS as SETTINGS_MAP } from '../settings/settings-groups';
import { DelegationForm, RequestSheetBody } from './inbox';

const d = (day: number, month = 8) => new Date(2026, month, day);

describe('request sheet effect (PLT-05)', () => {
  it('skips weekends and holidays', () => {
    // Thu 1 Oct – Mon 5 Oct: Fri 2 Oct is Gandhi Jayanti, Sat/Sun skipped → Thu + Mon
    expect(leaveDays(d(1, 9), d(5, 9), HOLIDAYS_2026)).toBe(2);
    expect(leaveDays(d(1, 9), d(1, 9), HOLIDAYS_2026, true)).toBe(0.5);
    expect(leaveDays(d(5, 9), d(1, 9))).toBe(0);
  });
  it('blocks over-balance and flags locked periods', () => {
    const over = leaveEffect({ balance: 4, from: d(5, 9), to: d(16, 9), holidays: HOLIDAYS_2026 });
    expect(over.overLimit).toBe(true);
    expect(over.message).toMatch(/You have 4 days left/);
    const late = leaveEffect({ balance: 5, from: d(25, 7), to: d(25, 7), lockedBefore: d(1) });
    expect(late.lateForPeriod).toBe(true);
    expect(late.balanceAfter).toBe(4);
  });
  it('shows the live summary and blocks sending when over balance', async () => {
    render(<RequestSheetBody defaultType="leave" defaultFrom={d(5, 9)} defaultTo={d(16, 9)} />);
    expect(screen.getByText('Not enough balance')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('sends a valid leave request', async () => {
    render(<RequestSheetBody defaultType="leave" defaultFrom={d(1, 9)} defaultTo={d(1, 9)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByText('Request sent')).toBeTruthy();
  });
});

describe('delegation (PLT-07)', () => {
  it('rejects self, chained delegates and reversed dates', () => {
    expect(validateDelegation({ from: d(5, 9), to: d(9, 9), delegateId: 'e1', meId: 'e1', today: TODAY }).delegate).toMatch(/yourself/);
    expect(validateDelegation({ from: d(5, 9), to: d(9, 9), delegateId: 'p6', meId: 'e1', delegateDelegatesTo: 'p1', today: TODAY }).delegate).toMatch(/never chains/);
    expect(validateDelegation({ from: d(9, 9), to: d(5, 9), delegateId: 'p1', meId: 'e1', today: TODAY }).to).toMatch(/on or after/);
    expect(validateDelegation({ from: d(5, 9), to: d(9, 9), delegateId: 'p1', meId: 'e1', today: TODAY })).toEqual({});
  });
  it('saves a valid delegation and shows the active state', async () => {
    render(<DelegationForm defaultFrom={d(5, 9)} defaultTo={d(9, 9)} defaultDelegate="p4" />);
    await userEvent.click(screen.getByRole('button', { name: 'Save delegation' }));
    expect(screen.getByText(/Lakshmi Venkatesan approves for you/)).toBeTruthy();
  });
});

describe('approvals (PLT-04)', () => {
  it('bulk approves only low-risk items of one type', () => {
    expect(bulkApprovable(APPROVALS, ['a1', 'a2']).ok).toBe(true);
    expect(bulkApprovable(APPROVALS, ['a1', 'a4']).reason).toMatch(/low-risk/);
    expect(bulkApprovable(APPROVALS, ['a1', 'a3']).reason).toMatch(/one request type/);
    expect(bulkApprovable(APPROVALS, []).ok).toBe(false);
  });
});

describe('search (PLT-10, 20, 21)', () => {
  it('parses palette prefixes', () => {
    expect(parseQuery('@ anj')).toEqual({ prefix: '@', term: 'anj' });
    expect(parseQuery('#LV-26')).toEqual({ prefix: '#', term: 'LV-26' });
    expect(parseQuery('apply leave')).toEqual({ prefix: null, term: 'apply leave' });
  });
  it('finds settings by task words in the one real settings map', () => {
    const index = buildIndex(SETTINGS_MAP);
    const all = () => true;
    expect(searchSettings(index, 'probation', all).length).toBeGreaterThan(0);
    expect(searchSettings(index, 'probation', all).every((r) => /probation/i.test(`${r.label} ${r.pageTitle} ${r.valueText} ${r.section}`) || r.isPage)).toBe(true);
    expect(searchSettings(index, '   ', all)).toEqual([]);
  });
  it('filters list rows by filter and search', () => {
    const cols = [
      { key: 'type', header: 'Type', value: (r: (typeof APPROVALS)[number]) => r.type },
      { key: 'requester', header: 'Requester', value: (r: (typeof APPROVALS)[number]) => r.requester },
    ];
    expect(filterRows(APPROVALS, cols, [{ key: 'type', type: 'multi', values: ['Expense'] }], '').length).toBe(2);
    expect(filterRows(APPROVALS, cols, [], 'meera').map((r) => r.id)).toEqual(['a2']);
  });
});

describe('policies and rules (PLT-12, 31, 32)', () => {
  it('simulate: first match by priority, catch-all default', () => {
    expect(simulatePolicy(EXPENSE_POLICIES, { amount: 12400, category: 'Travel', grade: 'G6' })?.id).toBe('p1');
    expect(simulatePolicy(EXPENSE_POLICIES, { amount: 800, category: 'Meals', grade: 'G6' })?.id).toBe('p2');
    expect(simulatePolicy(EXPENSE_POLICIES, { amount: 800, category: 'Meals', grade: 'G4' })?.id).toBe('p3');
  });
  it('finds overlapping and unreachable rules', () => {
    const w = ruleWarnings(SAMPLE_RULES);
    expect(w.overlaps).toEqual([['r1', 'r2']]);
    expect(w.unreachable).toEqual(['r2']);
  });
  it('type-checks formulas', () => {
    expect(checkFormula('IF(location.site_type = "Mine", 14, 12)')).toBeNull();
    expect(checkFormula('IF(a, 1, 2')).toMatch(/not closed/);
    expect(checkFormula('SUMX(1)')).toMatch(/SUMX isn't a function/);
  });
});

describe('access and set-up (PLT-08, 11)', () => {
  it('flags separation-of-duties conflicts', () => {
    expect(sodConflicts(['payroll.run.prepare', 'payroll.run.approve'])).toHaveLength(1);
    expect(sodConflicts(['employee.view'])).toEqual([]);
  });
  it('is ready only when no blocking check is open', () => {
    expect(readiness([{ id: 'a', blocking: true, done: true }, { id: 'b', blocking: false, done: false }])).toEqual({ score: 50, ready: true, blockingOpen: 0 });
    expect(readiness([{ id: 'a', blocking: true, done: false }]).ready).toBe(false);
  });
  it('SLA text for DSAR', () => {
    expect(slaText(d(27), TODAY)).toEqual({ text: 'Overdue by 2 days', tone: 'danger' });
    expect(slaText(d(29), TODAY).text).toBe('Due today');
    expect(slaText(d(8, 9), TODAY).text).toBe('9 days left');
  });
});

describe('customisation (PLT-22, 23)', () => {
  it('detects sensitive labels and builds API names', () => {
    expect(sensitiveCategory('Medical fitness certificate')).toBe('health or disability');
    expect(sensitiveCategory('Shoe size')).toBeNull();
    expect(apiNameFrom('Return due (date)')).toBe('return_due_date');
    expect(apiNameFrom('2nd contact')).toBe('f_2nd_contact');
  });
  it('moves a field between sections (keyboard alternative to drag)', () => {
    const next = moveField(EMPLOYEE_LAYOUT, 'blood_group', 's3');
    expect(next[0].fields.map((f) => f.api)).not.toContain('blood_group');
    expect(next[2].fields.at(-1)?.api).toBe('blood_group');
  });
});
