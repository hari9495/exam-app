import { readFileSync } from 'fs';
import { join } from 'path';

// E2 review item 1: each module's control steps are marked required, so a company's own approval steps (Settings 2.4)
// never drop them. Read from the module source: a control added later without the flag fails here.
const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const CONTROLS: [string, string, number][] = [
  ['expenses/claims.service.ts', 'Cost-centre owner', 1],
  ['expenses/claims.service.ts', 'Over the limit', 1],
  ['expenses/claims.service.ts', 'Finance check', 1],
  ['expenses/trips.service.ts', 'Travel desk', 1],
  ['expenses/trips.service.ts', 'Finance', 1],
  ['time/attendance.service.ts', 'HR', 2],
  ['time/leave-v2.service.ts', 'HR', 1],
  ['time/roster.service.ts', 'Colleague agrees', 1],
  ['payroll/inputs.service.ts', 'Payroll approval', 2],
  ['hiring/requisitions.service.ts', 'Outside the plan', 1],
  ['hiring/requisitions.service.ts', 'Recruiting', 1],
];

describe('E2 review item 1: module control steps are required', () => {
  it.each(CONTROLS)('%s: "%s"', (file, name, n) => {
    const steps = src(file).split('\n').filter((l) => l.includes(`name: '${name}', approvers:`));
    expect(steps).toHaveLength(n);
    for (const l of steps) expect(l).toContain('required: true');
  });

  it('the offer step above the pay range is required', () => {
    expect(src('offers/offer-builder.service.ts')).toContain("steps.push({ name: b.label, approvers: [{ kind: 'users', userIds: b.ids }], mode: 'any', selfApproval: 'never', required: true });");
  });
});
