import type { CompensationHistoryItem } from './comp-setup-live';
import type { CompensationInForce } from './live/types-5b';

// T2-B 63: samples for Me › My pay › My salary (stories and tests). Today is 26 Nov 2026.
const who = (name: string) => ({ userId: name.toLowerCase().replace(/ /g, '-'), name });
const item = (o: Partial<CompensationHistoryItem> & Pick<CompensationHistoryItem, 'changeId' | 'validFrom' | 'annualCtc'>): CompensationHistoryItem => ({
  kind: 'salary',
  status: 'approved',
  validTo: null,
  previousCtc: null,
  reason: null,
  requestedBy: who('Divya Raghunathan'),
  requestedAt: null,
  decidedBy: who('Suresh Pillai'),
  decidedAt: null,
  template: { name: 'Staff CTC', version: 2 },
  ...o,
});
export const MY_SALARY_TODAY = '2026-11-26';
export const MY_SALARY_HISTORY: CompensationHistoryItem[] = [
  item({ changeId: 'c4', validFrom: '2027-04-01', annualCtc: '1380000.00', previousCtc: '1200000.00', reason: 'Annual revision 2027' }),
  item({ changeId: 'c3', validFrom: '2026-04-01', validTo: '2027-03-31', annualCtc: '1200000.00', previousCtc: '1080000.00', reason: 'Annual revision 2026' }),
  item({ changeId: 'c2', validFrom: '2025-10-01', validTo: '2026-03-31', annualCtc: '1080000.00', previousCtc: '960000.00', reason: 'Promotion to Senior Associate' }),
  item({ changeId: 'c1', validFrom: '2025-04-07', validTo: '2025-09-30', annualCtc: '960000.00', reason: 'Joined' }),
  // A request still waiting: never shown to the person (answer 2860).
  { ...item({ changeId: 'r1', validFrom: '2026-12-01', annualCtc: '1500000.00', reason: 'Counter-offer' }), kind: 'request', status: 'pending' },
];
export const MY_SALARY_SPLIT: CompensationInForce = {
  validFrom: '2026-04-01',
  validTo: '2027-03-31',
  currency: 'INR',
  annualCtc: '1200000.00',
  changeId: 'c3',
  package: { entryMode: 'ctc', payBasis: 'monthly', rate: null, monthlyGross: '95700.00', codeWageAddBack: '0.00', letterDocumentId: null },
  lines: [
    { code: 'basic', name: 'Basic', kind: 'earning', monthly: '50000.00', annual: '600000.00' },
    { code: 'hra', name: 'House rent allowance', kind: 'earning', monthly: '20000.00', annual: '240000.00' },
    { code: 'special', name: 'Special allowance', kind: 'earning', monthly: '25700.00', annual: '308400.00' },
    { code: 'pf_er', name: 'Employer PF', kind: 'employer', monthly: '1800.00', annual: '21600.00' },
    { code: 'gratuity', name: 'Gratuity', kind: 'employer', monthly: '2500.00', annual: '30000.00' },
  ],
};
