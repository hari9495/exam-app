// Fictional sample data for calibration and comp review.
import { d } from './perf-data';
import type { CalibrationChange, CalibrationPerson, CompRow } from './perf-talent';

const P = (id: string, name: string, manager: string, team: string, self: number | null, mgr: number, rating = mgr, potential: 1 | 2 | 3 = 2, protectedLeave?: boolean): CalibrationPerson => ({ id, name, manager, team, self, managerRating: mgr, rating, potential, protectedLeave });

export const CAL_PEOPLE: CalibrationPerson[] = [
  P('c1', 'Divya Raghunathan', 'Karthik Subramanian', 'Quality', 4, 4, 4, 3),
  P('c2', 'Rohit Bhat', 'Karthik Subramanian', 'Quality', 4, 3, 3, 2),
  P('c3', 'Meera Iyer', 'Karthik Subramanian', 'Quality', 3, 3, 3, 3),
  P('c4', 'Imran Qureshi', 'Karthik Subramanian', 'Quality', 3, 2, 2, 1),
  P('c5', 'Sneha Ghosh', 'Karthik Subramanian', 'Quality', null, 3, 3, 2, true),
  P('c6', 'Arjun Kulkarni', 'Joseph Mathew', 'Engineering', 5, 5, 4, 3),
  P('c7', 'Prakash Menon', 'Joseph Mathew', 'Engineering', 4, 4, 4, 2),
  P('c8', 'Kavya Reddy', 'Joseph Mathew', 'Engineering', 4, 5, 5, 3),
  P('c9', 'Thomas George', 'Joseph Mathew', 'Engineering', 3, 3, 3, 2),
  P('c10', 'Fatima Shaikh', 'Joseph Mathew', 'Engineering', 4, 4, 4, 2),
  P('c11', 'Sana Nizami', 'Joseph Mathew', 'Engineering', 3, 4, 4, 2),
  P('c12', 'Vikram Singh', 'Joseph Mathew', 'Engineering', 3, 3, 3, 1),
  P('c13', 'Neha Joshi', 'Joseph Mathew', 'Engineering', 4, 4, 4, 3),
  P('c14', 'Deepa Rao', 'Karthik Subramanian', 'Quality', 2, 2, 2, 2),
];

export const GUIDE = [5, 15, 50, 25, 5];

export const CAL_CHANGES: CalibrationChange[] = [
  { id: 'ch1', person: 'Arjun Kulkarni', from: 5, to: 4, reason: 'Release 7.3 slipped two weeks; strong but not outstanding against peers in the group.', by: 'Lakshmi Venkatesan', at: d(28) },
];

const C = (id: string, name: string, department: string, grade: string, gender: 'F' | 'M', score: number, ctc: number, gradeMid: number, proposed: number | null, peerMedian: number, extra: Partial<CompRow> = {}): CompRow => ({
  id,
  name,
  department,
  grade,
  gender,
  score,
  ctc,
  gradeMid,
  proposed,
  peerMedian,
  factor: 1,
  eligibility: 'Included',
  market: { p25: gradeMid * 0.85, p50: gradeMid, p75: gradeMid * 1.2 },
  ...extra,
});

export const COMP_ROWS: CompRow[] = [
  C('r1', 'Divya Raghunathan', 'Quality', 'G5', 'F', 3.72, 14_40_000, 15_00_000, 9, 15_20_000),
  C('r2', 'Rohit Bhat', 'Quality', 'G3', 'M', 3.1, 6_20_000, 6_00_000, 6, 6_10_000),
  C('r3', 'Meera Iyer', 'Quality', 'G3', 'F', 3.3, 5_10_000, 6_00_000, 16, 6_10_000),
  C('r4', 'Imran Qureshi', 'Quality', 'G4', 'M', 2.2, 9_60_000, 9_00_000, 2, 9_20_000),
  C('r5', 'Ananya Das', 'Quality', 'G3', 'F', 3.4, 5_80_000, 6_00_000, 7, 6_10_000, { factor: 0.75, eligibility: 'Mid-cycle joiner' }),
  C('r6', 'Sneha Ghosh', 'Quality', 'G4', 'F', 3.3, 8_90_000, 9_00_000, 6, 9_20_000, { eligibility: 'Protected leave (counted as served)' }),
];

export const COMP_BUDGET = [{ department: 'Quality', amount: 4_20_000 }];

export const EQUITY = [
  { dimension: 'All, G3–G5', before: '8.1%', after: '4.2%' },
  { dimension: 'G3, same role', before: '6.4%', after: '1.9%' },
  { dimension: 'G5, same role', before: '5.0%', after: '3.3%' },
  { dimension: 'Hosur plant, G4', before: '', after: '', suppressed: true },
];
