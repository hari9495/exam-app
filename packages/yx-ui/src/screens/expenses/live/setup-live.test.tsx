import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ANY, fromRows, sameRules, toRows } from './matrix';
import { ExpenseSetupScreen, type ExpenseSetupScreenProps } from './setup';
import type { CityTier, ExpenseCategory, ExpensePolicy, PolicyRule } from './types';

// Expenses batch E1 screens (M05-BUILD-DESIGN §6–§7, EXP-07; XP-1.06).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const cat = (code: string, name: string, o: Partial<ExpenseCategory> = {}): ExpenseCategory => ({ id: `c-${code}`, code, name, kind: 'spend', receiptAbove: '500', gstEligible: true, itcBlockedReason: null, taxable: 'never', ledgerCode: null, active: true, version: 1, ...o });
const CATS = [cat('lodging', 'Hotel and lodging'), cat('meals', 'Meals', { itcBlockedReason: 'food_beverages' }), cat('air', 'Air travel'), cat('gifts', 'Gifts')];
const TIERS: CityTier[] = [
  { id: 't1', name: 'Tier 1', rank: 1, country: 'IN', cities: ['Mumbai'], active: true, version: 1 },
  { id: 't2', name: 'Tier 2', rank: 2, country: 'IN', cities: ['Jaipur'], active: true, version: 1 },
];
const rule = (o: Partial<PolicyRule>): PolicyRule => ({ categoryCode: 'lodging', tierId: null, perLine: null, perDay: null, perTrip: null, perMonth: null, overLimit: 'justify_and_approve', ...o });
const RULES = [rule({ tierId: 't1', perLine: '5000.00' }), rule({ tierId: 't2', perLine: '3500.00' }), rule({ categoryCode: 'meals', tierId: null, perDay: '800.00' }), rule({ categoryCode: 'air' })];
const policy = (o: Partial<ExpensePolicy> = {}): ExpensePolicy => ({ id: 'p1', name: 'Standard', appliesIf: null, priority: 1000, validFrom: '2026-04-01', validTo: null, status: 'active', version: 2, rules: RULES, ...o });

describe('the limits matrix as rows (pure)', () => {
  it('reads one kind of limit per category, any-city and tier columns, no limit and not allowed', () => {
    const rows = toRows(RULES, CATS);
    expect(rows.find((r) => r.code === 'lodging')).toMatchObject({ per: 'line', cells: { t1: '5000', t2: '3500' } });
    expect(rows.find((r) => r.code === 'meals')).toMatchObject({ per: 'day', cells: { [ANY]: '800' } });
    expect(rows.find((r) => r.code === 'air')).toMatchObject({ per: 'free', cells: {} });
    expect(rows.find((r) => r.code === 'gifts')).toMatchObject({ per: 'none' });
  });
  it('writes them back unchanged, and refuses a limit kind with no amount', () => {
    const back = fromRows(toRows(RULES, CATS));
    expect('rules' in back && sameRules(back.rules, RULES)).toBe(true);
    const rows = toRows(RULES, CATS).map((r) => (r.code === 'gifts' ? { ...r, per: 'month' as const } : r));
    expect(fromRows(rows)).toEqual({ problem: 'Gifts: give a limit, or choose "No limit".', code: 'gifts' });
    expect(fromRows(rows.map((r) => (r.code === 'gifts' ? { ...r, cells: { [ANY]: '2,000' } } : r)))).toEqual({ problem: 'Gifts: 2,000 is not an amount.', code: 'gifts' });
  });
});

const props = (o: Partial<ExpenseSetupScreenProps> = {}): ExpenseSetupScreenProps => ({
  state: 'ready',
  check: { ready: false, problems: [{ key: 'no_ledger_code', text: '4 categories have no ledger code, so their journal lines cannot be posted.', count: 4 }] },
  categories: CATS,
  tiers: TIERS,
  policies: { policies: [policy()], fields: [{ key: 'grade_id', label: 'Grade', type: 'choice', options: [{ value: 'g5', label: 'G5' }] }], today: '2026-10-12' },
  rates: { mileage: [], perDiem: [] },
  gst: [],
  entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd' }],
  onUseStarters: vi.fn(async () => ({})),
  onSaveCategory: vi.fn(async () => ({})),
  onSaveTier: vi.fn(async () => ({})),
  onSavePolicy: vi.fn(async () => ({})),
  onAddMileage: vi.fn(async () => ({})),
  onAddPerDiem: vi.fn(async () => ({})),
  onAddGst: vi.fn(async () => ({})),
  onEndGst: vi.fn(async () => ({})),
  ...o,
});

describe('Settings › Expenses', () => {
  it('a company with no categories is offered the starters; the set-up check shows what blocks claims', async () => {
    const onUseStarters = vi.fn(async () => ({}));
    const { unmount } = render(<ExpenseSetupScreen {...props({ categories: [], onUseStarters })} />);
    await ue.click(screen.getByRole('button', { name: 'Use the starters' }));
    expect(onUseStarters).toHaveBeenCalled();
    unmount();
    render(<ExpenseSetupScreen {...props()} />);
    expect(screen.getByText('4 categories have no ledger code, so their journal lines cannot be posted.')).toBeInTheDocument();
  });

  it('a policy in force saves new limits only as a new version from a date', async () => {
    const onSavePolicy = vi.fn(async () => ({}));
    render(<ExpenseSetupScreen {...props({ onSavePolicy })} />);
    expect(screen.getByText('In force since 1 Apr 2026')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save as a new version' });
    expect(save).toBeDisabled();
    const cell = screen.getByRole('textbox', { name: 'Hotel and lodging, Tier 1' });
    await ue.clear(cell);
    await ue.type(cell, '6000');
    await ue.click(save);
    expect(onSavePolicy).not.toHaveBeenCalled();
    expect(screen.getAllByText('Choose the day the new limits start.').length).toBeGreaterThan(0);
    await ue.type(screen.getByRole('textbox', { name: 'New limits from' }), '01 Nov 2026');
    await ue.tab();
    await ue.click(save);
    expect(onSavePolicy).toHaveBeenCalledWith({ mode: 'version', from: '2026-11-01', policy: expect.objectContaining({ id: 'p1', rules: expect.arrayContaining([expect.objectContaining({ categoryCode: 'lodging', tierId: 't1', perLine: '6000.00' })]) }) });
  });

  it('a policy not yet in force is saved in place', async () => {
    const onSavePolicy = vi.fn(async () => ({}));
    render(<ExpenseSetupScreen {...props({ onSavePolicy, policies: { ...props().policies!, policies: [policy({ validFrom: '2026-12-01' })] } })} />);
    expect(screen.getByText('Starts 1 Dec 2026')).toBeInTheDocument();
    await ue.click(screen.getByRole('combobox', { name: 'Gifts: limit' }));
    await ue.click(screen.getByRole('option', { name: 'No limit' }));
    await ue.click(screen.getByRole('button', { name: 'Save limits' }));
    expect(onSavePolicy).toHaveBeenCalledWith({ mode: 'update', policy: expect.objectContaining({ rules: expect.arrayContaining([expect.objectContaining({ categoryCode: 'gifts', tierId: null })]) }) });
  });

  it('a copy for some people needs a condition; Everyone needs none', async () => {
    const onSavePolicy = vi.fn(async () => ({}));
    render(<ExpenseSetupScreen {...props({ onSavePolicy })} />);
    await ue.click(screen.getByRole('button', { name: 'Copy as a new policy' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Save policy' }));
    expect(within(sheet).getAllByText('Say who it applies to, or choose Everyone.').length).toBeGreaterThan(0);
    await ue.click(within(sheet).getByRole('radio', { name: 'Everyone' }));
    await ue.click(within(sheet).getByRole('button', { name: 'Save policy' }));
    expect(onSavePolicy).toHaveBeenCalledWith({ mode: 'create', policy: expect.objectContaining({ name: 'Standard (copy)', appliesIf: null, validFrom: '2026-10-12' }) });
  });

  it('categories: unmapped ledger codes stand out; the code is fixed once saved', async () => {
    const onSaveCategory = vi.fn(async () => ({}));
    render(<ExpenseSetupScreen {...props({ onSaveCategory })} />);
    await ue.click(screen.getByRole('tab', { name: 'Categories' }));
    expect(screen.getAllByText('Not mapped').length).toBe(4);
    await ue.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('textbox', { name: /Code/ })).toBeDisabled();
    await ue.type(within(sheet).getByRole('textbox', { name: /Ledger code/ }), '6100');
    await ue.click(within(sheet).getByRole('button', { name: 'Save category' }));
    expect(onSaveCategory).toHaveBeenCalledWith(expect.objectContaining({ ledgerCode: '6100', version: 1 }));
  });

  it('a GSTIN with the wrong shape is caught after Save, before any call', async () => {
    const onAddGst = vi.fn(async () => ({}));
    render(<ExpenseSetupScreen {...props({ onAddGst })} />);
    await ue.click(screen.getByRole('tab', { name: 'GST registrations' }));
    await ue.click(screen.getByRole('button', { name: 'Add a registration' }));
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByRole('textbox', { name: /GSTIN/ }), '27aapfu0939f1z');
    expect(within(sheet).queryByText(/15 characters/)).not.toBeInTheDocument();
    await ue.click(within(sheet).getByRole('button', { name: 'Save registration' }));
    expect(onAddGst).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByRole('textbox', { name: /GSTIN/ }), 'v');
    await ue.click(within(sheet).getByRole('button', { name: 'Save registration' }));
    expect(onAddGst).toHaveBeenCalledWith({ legalEntityId: 'e1', gstin: '27AAPFU0939F1ZV', validFrom: '2026-10-12' });
  });
});
