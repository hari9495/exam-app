import { EXP, buildExpenseJournal, categoryCode, journalCsv, type ExpenseMapping } from './journal';

// XP-3.07: the expense journal from claims, payouts and advances through ledger mapping; unmapped blocks the export.

const map = (componentCode: string, accountCode: string, scope: { scopeType: string; scopeId: string | null } = { scopeType: 'company', scopeId: null }): ExpenseMapping => ({ ...scope, componentCode, accountCode, accountName: accountCode });
const ALL = [map(categoryCode('travel'), '6100'), map(categoryCode('meals'), '6200'), map(EXP.payable, '2400'), map(EXP.bank, '1100'), map(EXP.advances, '1500'), map(EXP.card, '2410'), map(EXP.cgst, '1601'), map(EXP.sgst, '1602'), map(EXP.igst, '1603')];
const totals = (lines: { debit: string; credit: string }[]) => lines.reduce((t, l) => [t[0] + Number(l.debit), t[1] + Number(l.credit)], [0, 0]);

describe('expense journal (M05 §12)', () => {
  it('accrual: the category head and payable; GST input instead of the head for its credit part; company-paid to the card', () => {
    const j = buildExpenseJournal(
      {
        legalEntityId: 'le1',
        claims: [{ lines: [{ category: 'travel', amount: '1180.00', companyPaid: false, gst: { cgst: '90.00', sgst: '90.00' } }, { category: 'meals', amount: '500.00', companyPaid: true }], advanceAdjusted: '0' }],
        payouts: [],
        advancesPaid: [],
        advanceReturns: [],
      },
      ALL,
    );
    expect(j).toMatchObject({ unmapped: [], balanced: true });
    const by = new Map(j.lines.map((l) => [l.accountCode, l]));
    expect(by.get('6100')).toMatchObject({ debit: '1000.00', credit: '0.00' });
    expect(by.get('1601')).toMatchObject({ debit: '90.00' });
    expect(by.get('2400')).toMatchObject({ credit: '1180.00' });
    expect(by.get('2410')).toMatchObject({ credit: '500.00' });
  });

  it('advance used, payout, advance paid and returned all balance', () => {
    const j = buildExpenseJournal({ legalEntityId: 'le1', claims: [{ lines: [{ category: 'travel', amount: '3000.00', companyPaid: false }], advanceAdjusted: '2000.00' }], payouts: ['1000.00'], advancesPaid: ['5000.00'], advanceReturns: ['500.00'] }, ALL);
    expect(j.balanced).toBe(true);
    const [d, c] = totals(j.lines);
    expect(d).toBeCloseTo(c, 2);
    const by = new Map(j.lines.map((l) => [l.accountCode, l]));
    // Payable: 3000 accrued, cleared by 2000 of advance and the 1000 payout.
    expect(Number(by.get('2400')!.debit) - Number(by.get('2400')!.credit)).toBe(0);
    expect(by.get('1100')).toMatchObject({ debit: '500.00', credit: '6000.00' });
  });

  it('the entity mapping wins; an unmapped category is listed and still balances (it blocks the export)', () => {
    const j = buildExpenseJournal({ legalEntityId: 'le1', claims: [{ lines: [{ category: 'stay', amount: '800.00', companyPaid: false }], advanceAdjusted: '0' }], payouts: [], advancesPaid: [], advanceReturns: [] }, [...ALL, map(EXP.payable, '2499', { scopeType: 'legal_entity', scopeId: 'le1' })]);
    expect(j.unmapped).toEqual([{ componentCode: 'exp.stay', amount: '800.00' }]);
    expect(j.lines.map((l) => l.accountCode).sort()).toEqual(['2499', 'UNMAPPED']);
    expect(j.balanced).toBe(true);
  });

  it('CSV cells cannot start a formula', () => {
    const csv = journalCsv({ lines: [{ accountCode: '=1+1', accountName: 'Travel, local', debit: '1.00', credit: '0.00' }], unmapped: [], balanced: false }, '2026-10');
    expect(csv.split('\n')[1]).toBe(`2026-10,"'=1+1","Travel, local",1.00,0.00`);
  });
});
