import { readFileSync } from 'fs';
import { join } from 'path';
import { inForce, lwf, type RuleSet } from './evaluator';
import { applyFact, TYPE_RULES } from '../employee-history/history-rules';

// Answer 2762 (payroll review M3): HR marks a job as manager or supervisor; Tamil Nadu and Delhi LWF exclude them above
// the state's pay level. Positive and negative.
const rules = (JSON.parse(readFileSync(join(__dirname, 'packs', 'in.json'), 'utf8')) as { ruleSets: RuleSet[] }).ruleSets;
const tn = inForce(rules, 'IN.LWF', ['IN-TN'], '2026-12-31')!;
const dl = inForce(rules, 'IN.LWF', ['IN-DL'], '2026-12-31')!;

describe('LWF manager and supervisor exclusions (answer 2762)', () => {
  it('Tamil Nadu: a supervisor above 15,000 pays nothing; at 15,000 or not a supervisor pays 20 / 40', () => {
    expect(tn.version).toBe('2026-v3');
    expect(lwf(tn, { month: 12, daysEmployed: 200, wage: '15001', supervisory: true }).employee.toString()).toBe('0');
    expect(lwf(tn, { month: 12, daysEmployed: 200, wage: '15000', supervisory: true }).employee.toString()).toBe('20');
    expect(lwf(tn, { month: 12, daysEmployed: 200, wage: '90000', supervisory: false }).employer.toString()).toBe('40');
  });

  it('negative: Tamil Nadu still needs 30 days employed; the old version (before December 2026) has no exclusion', () => {
    expect(lwf(tn, { month: 12, daysEmployed: 10, wage: '9000', supervisory: false }).employee.toString()).toBe('0');
    const before = inForce(rules, 'IN.LWF', ['IN-TN'], '2026-11-30')!;
    expect(lwf(before, { month: 12, daysEmployed: 200, wage: '90000', supervisory: true }).employee.toString()).toBe('20');
  });

  it('Delhi: a supervisor above 2,500 pays nothing; others pay 0.75 / 2.25', () => {
    expect(lwf(dl, { month: 12, wage: '30000', supervisory: true }).employee.toString()).toBe('0');
    expect(lwf(dl, { month: 6, wage: '30000', supervisory: false }).employer.toString()).toBe('2.25');
  });

  it('the job record carries the flag: off unless HR sets it; a promotion or redesignation may change it', () => {
    expect((applyFact('assignment', { locationId: 'l', departmentId: 'd', designationId: 'g', employmentTypeId: 't' }, { assignment: { designationId: 'g2' } }) as { supervisory: boolean }).supervisory).toBe(false);
    expect((applyFact('assignment', { locationId: 'l', departmentId: 'd', designationId: 'g', employmentTypeId: 't' }, { assignment: { supervisory: true } }) as { supervisory: boolean }).supervisory).toBe(true);
    expect(TYPE_RULES.promotion.assignment).toContain('supervisory');
    expect(TYPE_RULES.transfer.assignment).not.toContain('supervisory');
  });
});
