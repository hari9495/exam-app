import type { RestructurePreview } from '@yukthix/ui/frame';
import { moveImpact } from './yx-people';

// PPL-04: a one-person move's "What changes", from the restructure dry run (PPL-09 engine).
const person = (over: Partial<RestructurePreview['people'][number]> = {}): RestructurePreview['people'][number] => ({
  employeeId: 'e1',
  name: 'Rahul Sharma',
  code: 'KF-0088',
  status: 'ready',
  reason: null,
  from: { entity: 'Kaveri Foods Pvt Ltd', code: 'KF-0088', location: 'Bengaluru head office', department: 'Sales', manager: null },
  to: { entity: 'Kaveri Foods (Tamil Nadu)', code: 'KF-0088', location: 'Chennai office', department: 'Sales', manager: null },
  service: { from: '2019-07-14', kept: true },
  leave: [{ name: 'PL', days: 11.5, action: 'carried' }, { name: 'Comp-off', days: 1, action: 'carried' }],
  pay: 'kept',
  ...over,
});
const preview = (p: RestructurePreview['people'], checks: RestructurePreview['checks'] = []): RestructurePreview => ({ people: p, checks, counts: { ready: 1, failed: 0, leftOut: 0 } });

describe('moveImpact (PPL-04)', () => {
  it('shows the design rows: entity, code kept, location, PF, tax, leave, service and pay', () => {
    const i = moveImpact(preview([person()]), '2026-10-05');
    expect(i.facts).toEqual([
      { fact: 'Legal entity', from: 'Kaveri Foods Pvt Ltd', to: 'Kaveri Foods (Tamil Nadu)' },
      { fact: 'Employee code', from: 'KF-0088', to: 'KF-0088 (kept)' },
      { fact: 'Location', from: 'Bengaluru head office', to: 'Chennai office' },
      { fact: 'PF', from: 'Same UAN', to: 'Same UAN · transfer tracked on the checklist' },
      { fact: 'Tax', from: 'Pay and tax so far this year', to: 'Form 12B carried into the new entity' },
      { fact: 'Leave balance', from: '11.5 days PL, 1 day Comp-off', to: 'Carried over' },
      { fact: 'Continuous service', from: null, to: 'Continues from 14 Jul 2019' },
      { fact: 'Salary structure', from: null, to: 'Kept' },
    ]);
    expect(i).toMatchObject({ effectiveDate: '2026-10-05', pay: [], rebased: [], retro: null });
  });

  it('a person who cannot move, or a blocked payroll month, is the reason instead of the table', () => {
    expect(() => moveImpact(preview([person({ status: 'failed', reason: 'Is serving notice.', to: null })]), '2026-10-05')).toThrow('Is serving notice.');
    expect(() => moveImpact(preview([]), '2026-10-05')).toThrow(/does not work for that legal entity/);
    expect(() => moveImpact(preview([person()], [{ id: 'pay', title: 'October 2026 payroll of Kaveri Foods is locked: choose a date in an open payroll month', status: 'Blocked' }]), '2026-10-05')).toThrow(/is locked/);
  });
});
