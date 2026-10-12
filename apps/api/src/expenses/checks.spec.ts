import type { FieldDef, Group } from '../rules-engine/conditions';
import { checkLimit, dupKey, gstMathsProblem, gstinCheckChar, gstinProblem, itcStatusOf, merchantsAlike, mileageAmount, perDiemAmount, pickPolicy, receiptNeed, riskOf, ruleFor, taxablePart, tierFor, type RuleLike } from './checks';

// M05-BUILD-DESIGN §7 and §13.4: XP-1.03 (policy pick), XP-1.04 (limits, mileage, per diem), XP-1.05 (GSTIN).

const FIELDS: FieldDef[] = [
  { key: 'grade_id', label: 'Grade', type: 'choice' },
  { key: 'legal_entity_id', label: 'Legal entity', type: 'choice' },
];
const when = (field: string, ids: string[]): Group => ({ id: 'g', join: 'and', items: [{ id: 'c1', field, operator: 'one_of', value: ids }] });
const both = (grade: string, entity: string): Group => ({ id: 'g', join: 'and', items: [{ id: 'c1', field: 'grade_id', operator: 'is', value: grade }, { id: 'c2', field: 'legal_entity_id', operator: 'is', value: entity }] });
const policy = (id: string, appliesIf: Group | null, o: Partial<{ priority: number; validFrom: string; validTo: string | null; status: string }> = {}) => ({ id, appliesIf, priority: 100, validFrom: '2026-01-01', validTo: null, status: 'active', ...o });

describe('which expense policy applies (§7.1)', () => {
  const ps = [policy('company', null), policy('senior', when('grade_id', ['g4', 'g5'])), policy('senior-tn', both('g5', 'tn')), policy('old', when('grade_id', ['g5']), { validTo: '2026-06-30', priority: 1 })];
  it('the most specific condition wins, then the date', () => {
    expect(pickPolicy(ps, { grade_id: 'g5', legal_entity_id: 'tn' }, FIELDS, '2026-10-12')!.id).toBe('senior-tn');
    expect(pickPolicy(ps, { grade_id: 'g5', legal_entity_id: 'ka' }, FIELDS, '2026-10-12')!.id).toBe('senior');
    // Before 30 Jun the older policy is as specific and has the lower priority number.
    expect(pickPolicy(ps, { grade_id: 'g5', legal_entity_id: 'ka' }, FIELDS, '2026-05-01')!.id).toBe('old');
    expect(pickPolicy(ps, { grade_id: 'g1', legal_entity_id: 'ka' }, FIELDS, '2026-10-12')!.id).toBe('company');
  });
  it('a lower priority number breaks a tie; retired or future policies never apply', () => {
    const tie = [policy('a', when('grade_id', ['g1']), { priority: 50 }), policy('b', when('grade_id', ['g1']), { priority: 10 }), policy('r', when('grade_id', ['g1']), { priority: 1, status: 'retired' }), policy('f', when('grade_id', ['g1']), { priority: 1, validFrom: '2027-01-01' })];
    expect(pickPolicy(tie, { grade_id: 'g1' }, FIELDS, '2026-10-12')!.id).toBe('b');
    expect(pickPolicy([], { grade_id: 'g1' }, FIELDS, '2026-10-12')).toBeNull();
  });
});

describe('limits (§7.2)', () => {
  const rule = (o: Partial<RuleLike> = {}): RuleLike => ({ categoryCode: 'lodging', tierId: 't2', perLine: '4000', perDay: null, perTrip: null, perMonth: '20000', overLimit: 'justify_and_approve', ...o });
  const used = { day: '0', trip: null, month: '0' };

  it("the tier's own row beats the any-tier row; no row means not allowed", () => {
    const rows = [rule({ tierId: null, perLine: '3000' }), rule()];
    expect(ruleFor(rows, 'lodging', 't2')!.perLine).toBe('4000');
    expect(ruleFor(rows, 'lodging', 't3')!.perLine).toBe('3000');
    expect(ruleFor(rows, 'meals', 't2')).toBeNull();
    expect(checkLimit(null, '100', used).outcome).toBe('not_allowed');
  });

  it('within every limit is ok; over the line limit needs a reason, or is blocked when the category says so', () => {
    expect(checkLimit(rule(), '4000', used)).toMatchObject({ outcome: 'ok', overBy: '0.00' });
    expect(checkLimit(rule(), '4800', used)).toMatchObject({ outcome: 'over_justify', overBy: '800.00', limit: { kind: 'per_line', amount: '4000.00' } });
    expect(checkLimit(rule({ overLimit: 'block' }), '4800', used).outcome).toBe('blocked');
  });

  it('the month and trip windows count what was already claimed; the biggest excess decides', () => {
    expect(checkLimit(rule(), '3000', { day: '0', trip: null, month: '18500' })).toMatchObject({ outcome: 'over_justify', overBy: '1500.00', limit: { kind: 'per_month', used: '18500.00', remaining: '1500.00' } });
    expect(checkLimit(rule({ perTrip: '10000' }), '3000', { day: '0', trip: '9000', month: '0' })).toMatchObject({ overBy: '2000.00', limit: { kind: 'per_trip' } });
    // A trip limit is ignored for a line outside any trip.
    expect(checkLimit(rule({ perTrip: '10' }), '3000', used).outcome).toBe('ok');
  });

  it('receipts: above the threshold, always when none is set, never for computed lines', () => {
    expect(receiptNeed('spend', '500', '499')).toBe('declaration');
    expect(receiptNeed('spend', '500', '500.01')).toBe('required');
    expect(receiptNeed('spend', null, '1')).toBe('required');
    expect(receiptNeed('mileage', null, '900')).toBe('none');
  });
});

describe('computed amounts (YX-EXP-03)', () => {
  it('mileage is km × rate within the monthly cap', () => {
    expect(mileageAmount(42, '17', null, 0)).toEqual({ amount: '714.00' });
    expect(mileageAmount(12.5, '7.5', 1000, 900)).toEqual({ amount: '93.75' });
    expect(mileageAmount(150, '17', 1000, 900)).toEqual({ problem: 'This passes the monthly limit of 1000 km (900 km claimed already).' });
    expect(mileageAmount(0, '17', null, 0)).toHaveProperty('problem');
    expect(mileageAmount(1.25, '17', null, 0)).toHaveProperty('problem');
  });

  it('per diem counts partial days by the rule and takes off company-paid meals', () => {
    expect(perDiemAmount('1000', { full: 3, partial: 2 }, 'full', {}, {})).toBe('5000.00');
    expect(perDiemAmount('1000', { full: 3, partial: 2 }, 'half_after_hours', {}, {})).toBe('4000.00');
    expect(perDiemAmount('1000', { full: 2, partial: 0 }, 'full', { lunch: 2, dinner: 1 }, { lunch: 0.3, dinner: 0.4 })).toBe('1000.00');
    expect(perDiemAmount('100', { full: 1, partial: 0 }, 'full', { breakfast: 5 }, { breakfast: 0.5 })).toBe('0.00');
  });
});

describe('GSTIN (§13.4)', () => {
  it('accepts a valid GSTIN and finds its check character', () => {
    expect(gstinCheckChar('27AAPFU0939F1Z')).toBe('V');
    expect(gstinProblem('27AAPFU0939F1ZV')).toBeNull();
    expect(gstinProblem(' 27aapfu0939f1zv ')).toBeNull();
  });
  it('refuses a wrong shape, an unknown state and a typo', () => {
    expect(gstinProblem('27AAPFU0939F1Z')).toMatch(/15 characters/);
    expect(gstinProblem('45AAPFU0939F1ZV')).toBe('45 is not a GST state code.');
    expect(gstinProblem('27AAPFU0939F1ZW')).toMatch(/check character/);
  });
});

describe('claim line checks (E2, §13, §15)', () => {
  const tiers = [
    { id: 't1', rank: 1, country: 'IN', cities: ['Mumbai'], active: true },
    { id: 't3', rank: 3, country: 'IN', cities: [], active: true },
    { id: 'ti', rank: 9, country: null, cities: [], active: true },
  ];
  it('a city finds its tier; other Indian cities the catch-all; abroad the international tier', () => {
    expect(tierFor(tiers, 'mumbai', 'IN')!.id).toBe('t1');
    expect(tierFor(tiers, 'Hosur', 'IN')!.id).toBe('t3');
    expect(tierFor(tiers, 'Dubai', 'AE')!.id).toBe('ti');
    expect(tierFor([], 'Mumbai', 'IN')).toBeNull();
  });
  it('look-alike merchants and the duplicate key', () => {
    expect(merchantsAlike('Hotel Sea View Pvt. Ltd.', 'HOTEL SEA VIEW')).toBe(true);
    expect(merchantsAlike('Cafe Mocha', 'Chai Point')).toBe(false);
    expect(merchantsAlike(null, 'x')).toBe(false);
    expect(dupKey('e1', '2026-10-01', '450')).toBe(dupKey('e1', '2026-10-01', '450.00'));
  });
  it('GST maths', () => {
    expect(gstMathsProblem({ taxableValue: '1000', cgst: '90', sgst: '90', igst: null })).toBeNull();
    expect(gstMathsProblem({ taxableValue: '1000', cgst: null, sgst: null, igst: '180' })).toBeNull();
    expect(gstMathsProblem({ taxableValue: '1000', cgst: '90', sgst: '80', igst: null })).toBe('CGST and SGST should be equal.');
    expect(gstMathsProblem({ taxableValue: '1000', cgst: '90', sgst: '90', igst: '180' })).toMatch(/never both/);
    expect(gstMathsProblem({ taxableValue: '1000', cgst: '70', sgst: '70', igst: null })).toMatch(/not a GST rate/);
    expect(gstMathsProblem({ taxableValue: null, cgst: null, sgst: null, igst: null })).toBeNull();
  });
  it('input credit: billed to us in the supply state, not blocked', () => {
    const base = { gstOn: true, gstEligible: true, blocked: false, supplierGstin: '27AAPFU0939F1ZV', invoiceNo: 'SV/1', billedTo: '27ABCDE1234F1Z5', placeOfSupply: null, ourGstins: ['27ABCDE1234F1Z5', '29ABCDE1234F1Z1'] };
    expect(itcStatusOf(base)).toBe('eligible');
    expect(itcStatusOf({ ...base, billedTo: '29ABCDE1234F1Z1' })).toBe('wrong_state');
    expect(itcStatusOf({ ...base, billedTo: null })).toBe('not_billed_to_us');
    expect(itcStatusOf({ ...base, invoiceNo: null })).toBe('missing');
    expect(itcStatusOf({ ...base, blocked: true })).toBe('blocked');
    expect(itcStatusOf({ ...base, gstOn: false })).toBe('not_applicable');
  });
  it('risk and the taxable part', () => {
    expect(riskOf([])).toBe('none');
    expect(riskOf(['look_alike'])).toBe('low');
    expect(riskOf(['same_invoice'])).toBe('high');
    expect(riskOf(['a', 'b', 'c'])).toBe('high');
    expect(taxablePart('never', '1000', '200')).toBe('0.00');
    expect(taxablePart('always', '1000', '0')).toBe('1000.00');
    expect(taxablePart('above_limit', '1000', '200')).toBe('200.00');
  });
});
