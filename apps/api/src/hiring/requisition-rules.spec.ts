import { checkRequisition, fyStartOf, type LineFacts, type RequisitionFacts } from './requisition-rules';

describe('requisition against the headcount plan (AT2, D5)', () => {
  const r = (o: Partial<RequisitionFacts> = {}): RequisitionFacts => ({ lineId: 'l1', outsidePlan: false, outsidePlanReason: null, reason: 'new', replacementOf: null, headcount: 1, budgetAmount: 900_000, ...o });
  const line = (o: Partial<LineFacts> = {}): LineFacts => ({ planStatus: 'approved', count: 3, budget: 3_000_000, committedOther: 1, committedBudgetOther: 1_000_000, ...o });

  it('inside the plan and the budget: no extra step', () => {
    expect(checkRequisition('advisory', r(), line())).toEqual({ problem: null, extra: false, why: [] });
  });

  it('over the count or the budget adds the extra step and says why', () => {
    expect(checkRequisition('advisory', r({ headcount: 3 }), line()).why).toEqual(['more openings than the plan line has left']);
    expect(checkRequisition('required', r({ budgetAmount: 2_500_000 }), line()).extra).toBe(true);
  });

  it('outside the plan needs a reason and the extra step; advisory without a line is fine; required is not', () => {
    expect(checkRequisition('advisory', r({ lineId: null, outsidePlan: true }), null).problem).toMatch(/why/);
    expect(checkRequisition('advisory', r({ lineId: null, outsidePlan: true, outsidePlanReason: 'New client' }), null)).toMatchObject({ problem: null, extra: true });
    expect(checkRequisition('advisory', r({ lineId: null }), null)).toEqual({ problem: null, extra: false, why: [] });
    expect(checkRequisition('required', r({ lineId: null }), null).problem).toMatch(/approved headcount plan/);
  });

  it('a plan not yet approved cannot be drawn on; off ignores the plan; a replacement names the leaver', () => {
    expect(checkRequisition('advisory', r(), line({ planStatus: 'submitted' })).problem).toMatch(/not approved/);
    expect(checkRequisition('off', r({ headcount: 99 }), line())).toEqual({ problem: null, extra: false, why: [] });
    expect(checkRequisition('required', r({ reason: 'replacement', lineId: null }), null).problem).toMatch(/replaces/);
    expect(checkRequisition('required', r({ reason: 'replacement', lineId: null, replacementOf: 'e1' }), null)).toEqual({ problem: null, extra: false, why: [] });
  });

  it('financial year starts in April', () => {
    expect(fyStartOf('2026-04-01')).toBe(2026);
    expect(fyStartOf('2027-03-31')).toBe(2026);
  });
});
