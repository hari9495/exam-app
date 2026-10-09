import { writeFileSync } from 'fs';
import { join } from 'path';
import { calculatePayslip } from '../src/payroll/calc';
import { RULES, snapshot } from '../src/payroll/regression/fixtures';

// Writes the payroll regression pack (PAY-3.18, US-E-212): named snapshots with the results the engine gives today.
// CI fails when a change to the engine or a rule set moves any of them; rerun this only for a reviewed, intended change:
//   npx ts-node scripts/payroll-regression.ts
const cases = [
  ['Karnataka, full month, starter structure', snapshot()],
  ['Karnataka, 3 days loss of pay', snapshot({ attendance: { lopDays: '3', source: 'feed', otMinutes: { normal: 0, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 } })],
  ['Tamil Nadu, October (no PT this month)', snapshot({ profile: { ...snapshot().profile, ptState: 'IN-TN' }, segments: [{ ...snapshot().segments[0], state: 'IN-TN', zone: 'A' }] })],
  ['Maharashtra, woman, ESI covered, LWF month', snapshot({ period: { start: '2026-06-01', end: '2026-06-30', days: 30 }, segments: [{ ...snapshot().segments[0], from: '2026-06-01', to: '2026-06-30', days: 30, state: 'IN-MH', zone: null, lines: [{ code: 'basic', monthly: '9000' }, { code: 'hra', monthly: '4500' }, { code: 'special', monthly: '3500' }] }], profile: { ...snapshot().profile, ptState: 'IN-MH', lwfState: 'IN-MH', gender: 'female', esiCoveredThisPeriod: true } })],
  ['Karnataka, 26-day basis, 2 days loss of pay, age 59 (no EPS)', snapshot({ dayBasis: '26', attendance: { lopDays: '2', source: 'feed', otMinutes: { normal: 0, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 }, profile: { ...snapshot().profile, age: 59 } })],
] as const;
const out = cases.map(([name, s]) => {
  const r = calculatePayslip(s, RULES);
  return { name, snapshot: s, expected: { net: r.net, gross: r.gross, resultHash: r.resultHash } };
});
writeFileSync(join(__dirname, '..', 'src', 'payroll', 'regression', 'pack.json'), JSON.stringify(out, null, 2) + '\n');
console.log(out.map((c) => `${c.name}: gross ${c.expected.gross}, net ${c.expected.net}`).join('\n'));
