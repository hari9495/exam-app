// Fictional sample data for the E3 "Rule changes and triggers" tab (stories and tests).
import type { ArrearsJobRow, RuleProposal } from './offcycle-live';

export const RULE_OPEN: RuleProposal = { id: 'rp1', statute: 'IN.PT', jurisdiction: 'IN-KA', ruleVersion: '2026-v3', periods: ['2026-08', '2026-09'], employeeCount: 42, status: 'open', reason: null, impact: null };
export const RULE_READY: RuleProposal = { ...RULE_OPEN, id: 'rp2', statute: 'IN.LWF', ruleVersion: '2026-v2', employeeCount: 40, impact: { status: 'ready', people: 38, total: '9120.00', largest: '480.00' } };
export const RULE_DONE: RuleProposal = { ...RULE_OPEN, id: 'rp3', statute: 'IN.PF', jurisdiction: 'IN', ruleVersion: '2026-v2', status: 'accepted', impact: { status: 'ready', people: 12, total: '14400.00', largest: '1200.00' } };
export const ARREARS_JOBS: ArrearsJobRow[] = [
  { id: 'j1', kind: 'change', mode: 'draft', status: 'done', people: 1, done: 1, skipped: [], total: '6000.00', largest: '6000.00', largestPerson: 'Lakshmi Devi', createdAt: '2026-11-20T09:30:00Z' },
  { id: 'j2', kind: 'join', mode: 'draft', status: 'done', people: 1, done: 0, skipped: [{ employmentId: 'e2', why: 'No salary from the joining date yet' }], total: '0.00', largest: '0.00', largestPerson: null, createdAt: '2026-11-21T10:00:00Z' },
  { id: 'j3', kind: 'rule', mode: 'draft', status: 'running', people: 12, done: 7, skipped: [], total: '8400.00', largest: '1200.00', largestPerson: 'Ravi Kumar', createdAt: '2026-11-22T11:00:00Z' },
];
