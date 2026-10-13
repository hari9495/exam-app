// Recruitment batch AT2 (M10-BUILD-DESIGN §5, founder D5): pure rules for a requisition against the headcount plan.

export type PlanMode = 'off' | 'advisory' | 'required';

export interface RequisitionFacts {
  lineId: string | null;
  outsidePlan: boolean;
  outsidePlanReason: string | null;
  reason: 'new' | 'replacement' | null;
  replacementOf: string | null;
  headcount: number;
  budgetAmount: number | null;
}

export interface LineFacts {
  planStatus: string;
  count: number;
  budget: number | null;
  /** Openings and budget already committed on the line by other live requisitions. */
  committedOther: number;
  committedBudgetOther: number;
}

/** What blocks the submit (a plain message), and whether the extra (finance / outside-plan) approval step is needed. */
export function checkRequisition(mode: PlanMode, r: RequisitionFacts, line: LineFacts | null): { problem: string | null; extra: boolean; why: string[] } {
  if (r.reason === 'replacement') {
    // A replacement names the leaver and never draws on the plan (Q1).
    return r.replacementOf ? { problem: null, extra: false, why: [] } : { problem: 'Name the person this requisition replaces.', extra: false, why: [] };
  }
  if (r.outsidePlan && (r.outsidePlanReason ?? '').trim().length < 3) return { problem: 'Say why this hire is outside the plan.', extra: false, why: [] };
  if (mode === 'off') return { problem: null, extra: false, why: [] };
  if (r.outsidePlan) return { problem: null, extra: true, why: ['outside the plan'] };
  if (!r.lineId || !line) {
    // Advisory: without a plan line the requisition only shows that it is not in the plan.
    return mode === 'required' ? { problem: 'Choose a line of an approved headcount plan, or mark the hire as outside the plan with a reason.', extra: false, why: [] } : { problem: null, extra: false, why: [] };
  }
  if (line.planStatus !== 'approved') return { problem: 'That headcount plan is not approved yet.', extra: false, why: [] };
  const why: string[] = [];
  if (line.committedOther + r.headcount > line.count) why.push('more openings than the plan line has left');
  if (line.budget !== null && r.budgetAmount !== null && line.committedBudgetOther + r.budgetAmount > line.budget) why.push('over the plan line’s budget');
  return { problem: null, extra: why.length > 0, why };
}

/** The Indian financial year a date falls in, by its starting year (April–March). */
export const fyStartOf = (iso: string) => (Number(iso.slice(5, 7)) >= 4 ? Number(iso.slice(0, 4)) : Number(iso.slice(0, 4)) - 1);
