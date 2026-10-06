import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  bandCheck,
  campaignAudience,
  canPublishJob,
  conversionFee,
  ctcBreakup,
  duplicateCheck,
  eInvoiceWindow,
  findSlots,
  guaranteeOutcome,
  impactRatios,
  auditExpired,
  invoiceTotals,
  offerLapse,
  payHistoryAllowed,
  rateCapCheck,
  referralBonusStatus,
  requisitionRoute,
  revisionNeedsApproval,
  scorecardResult,
  sourcedPurgeIn,
  suggestedRateCap,
  totalCtc,
  assignInterviewDay,
  ageingBucket,
  identityFlags,
} from './hiring-logic';
import { applyMappingRules, benchStatus, bulkEligible, burnState, correctionEffect, costVisible, matchResource, milestoneSummary, suppressGroup, tmBilling, utilisation } from './projects-logic';
import { PLAN_LINES, PANEL, POOL_MEMBERS, OFFER_CONDITIONS, ID_POINTS, D } from './hiring-data';
import { LAST_WEEK_ITEMS, MAPPING_RULES, RATE_CARD_PRJ, RESOURCE_PEOPLE, WIP_LINES } from './projects-data';
import { JobPayRangePanel } from './hiring-plan';
import { ScorecardScreen } from './hiring-pipeline';
import { TODAY } from '../_kit/data';

describe('hiring rules', () => {
  it('YX-ATS-01: in-plan short chain; outside plan / over budget adds CFO', () => {
    expect(requisitionRoute({ planLine: PLAN_LINES[2], proposedMax: 8_40_000 }).extra).toBe(false);
    const out = requisitionRoute({ planLine: null, proposedMax: 22_00_000 });
    expect(out.extra).toBe(true);
    expect(out.steps.at(-1)).toBe('CFO');
    expect(requisitionRoute({ planLine: PLAN_LINES[3], proposedMax: 1 }).reasons[0]).toMatch(/No free position/);
    expect(requisitionRoute({ planLine: null, proposedMax: 1, replacementFor: 'X' }).extra).toBe(false);
  });

  it('YX-ATS-34: range required by law blocks publish; pay history banned', () => {
    const law = { rangeRequired: true, historyBanned: true };
    expect(canPublishJob({ min: null, max: null }, law, true)).toBe(false);
    expect(canPublishJob({ min: 10, max: 20 }, law, true)).toBe(true);
    expect(canPublishJob({ min: 30, max: 20 }, { rangeRequired: false, historyBanned: false }, true)).toBe(false);
    expect(payHistoryAllowed(law)).toBe(false);
  });

  it('YX-ATS-04: scorecard prompt and below-bar skills', () => {
    const items = [
      { skill: 'A', weight: 50, passBar: 3, rating: 4 },
      { skill: 'B', weight: 50, passBar: 3, rating: 2 },
    ];
    const r = scorecardResult(items);
    expect(r.score).toBe(3);
    expect(r.below).toEqual(['B']);
    expect(scorecardResult([{ ...items[0], rating: null }]).complete).toBe(false);
  });

  it('YX-ATS-06: CTC ₹14 L on ₹8–12 L range needs extra approval; breakup sums to fixed CTC', () => {
    expect(bandCheck(14_00_000, { min: 8_00_000, max: 12_00_000 }).extraApproval).toBe(true);
    expect(bandCheck(10_00_000, { min: 8_00_000, max: 12_00_000 }).extraApproval).toBe(false);
    expect(totalCtc(ctcBreakup(16_00_000))).toBe(16_00_000);
    expect(totalCtc(ctcBreakup(16_00_000, { variable: 1_00_000, joiningBonus: 50_000 }))).toBe(17_00_000);
    expect(revisionNeedsApproval({ ctc: 1, grade: 'G6' }, { ctc: 1, grade: 'G6' })).toBe(false);
  });

  it('YX-ATS-41: offer lapses after deadline with open conditions', () => {
    expect(offerLapse(OFFER_CONDITIONS, D(2026, 9, 27), TODAY).state).toBe('lapsed');
    expect(offerLapse(OFFER_CONDITIONS, D(2026, 10, 1), TODAY).state).toBe('reminder');
    expect(offerLapse(OFFER_CONDITIONS.map((c) => ({ ...c, status: 'met' as const })), D(2026, 9, 1), TODAY).state).toBe('clear');
  });

  it('YX-ATS-12: referral bonus eligible after 90 days', () => {
    expect(referralBonusStatus(D(2026, 7, 1), TODAY).state).toBe('eligible');
    expect(referralBonusStatus(D(2026, 9, 1), TODAY).daysLeft).toBe(62);
    expect(referralBonusStatus(null, TODAY).state).toBe('not-joined');
  });

  it('YX-ATS-20 / 22: campaigns skip no-consent, opted-out, minors, pending captures', () => {
    const a = campaignAudience(POOL_MEMBERS, 'whatsapp');
    expect(a.enrolled.map((m) => m.id)).toEqual(['m1', 'm4', 'm7']);
    expect(a.skipped).toEqual({ noConsent: 1, optedOut: 1, minor: 1, pendingConsent: 1 });
    expect(sourcedPurgeIn(D(2026, 9, 3), TODAY)).toBe(4);
  });

  it('YX-ATS-24: slots respect busy time plus buffer, load cap; unknown required calendar gives none', () => {
    const rules = { dayStart: 570, dayEnd: 1050, duration: 60, buffer: 15, maxPerDay: 3 };
    const slots = findSlots(PANEL, rules, 50);
    for (const s of slots)
      for (const p of PANEL.filter((x) => x.required))
        for (const b of p.busy!) expect(s.end + 15 <= b.start || s.start >= b.end + 15).toBe(true);
    expect(findSlots(PANEL.map((p) => (p.id === 'p1' ? { ...p, busy: null } : p)), rules)).toEqual([]);
    expect(findSlots(PANEL.map((p) => (p.id === 'p1' ? { ...p, interviewsToday: 3 } : p)), rules)).toEqual([]);
  });

  it('YX-ATS-40: interview day fills panels and reports overflow', () => {
    const r = assignInterviewDay(['a', 'b', 'c', 'd', 'e'], [{ id: 'x', room: '1' }, { id: 'y', room: '2' }], [600, 660]);
    expect(r.assigned).toHaveLength(4);
    expect(r.unassigned).toEqual(['e']);
  });

  it('YX-ATS-26 / 27: rate cap and duplicate ownership without revealing holder', () => {
    expect(suggestedRateCap(1_200, 25)).toBe(900);
    expect(rateCapCheck(950, 900)).toEqual({ ok: false, overBy: 50 });
    const prior = [{ candidateKey: 'priya', jobId: 'j', source: 'Vendor A', at: D(2026, 9, 9) }];
    const d = duplicateCheck('priya', 'j', prior, TODAY);
    expect(d.status).toBe('duplicate');
    expect(d.vendorMessage).not.toMatch(/Vendor A/);
    expect(duplicateCheck('priya', 'j', prior, D(2027, 1, 1)).status).toBe('unique');
  });

  it('M10 §9: 160 h at ₹1,200 = ₹1,92,000 + GST; inter-state uses IGST', () => {
    const intra = invoiceTotals([{ description: 'x', qty: 160, rate: 1_200 }], 'Tamil Nadu', 'Tamil Nadu');
    expect(intra.subtotal).toBe(1_92_000);
    expect(intra.cgst + intra.sgst).toBe(34_560);
    expect(invoiceTotals([{ description: 'x', qty: 160, rate: 1_200 }], 'Tamil Nadu', 'Karnataka').igst).toBe(34_560);
  });

  it('YX-ATS-44 / YX-PRJ-16: warning from day 25, blocked after day 30', () => {
    expect(eInvoiceWindow(D(2026, 9, 19), TODAY, true).state).toBe('ok');
    expect(eInvoiceWindow(D(2026, 9, 4), TODAY, true).state).toBe('warning');
    expect(eInvoiceWindow(D(2026, 8, 29), TODAY, true).state).toBe('blocked');
    expect(eInvoiceWindow(D(2026, 8, 1), TODAY, false).state).toBe('not-applicable');
    expect(ageingBucket(D(2026, 6, 30), TODAY)).toBe('90+');
  });

  it('YX-ATS-43: conversion fee taper and pro-rated guarantee credit', () => {
    const taper = [{ fromMonth: 0, pct: 8 }, { fromMonth: 6, pct: 4 }];
    expect(conversionFee(taper, 7, 10_00_000)).toBe(40_000);
    expect(guaranteeOutcome(90_000, 90, 30, 'refund').credit).toBe(60_000);
    expect(guaranteeOutcome(90_000, 60, 75, 'refund').covered).toBe(false);
  });

  it('YX-EVAL-32: impact ratios and audit expiry', () => {
    const r = impactRatios([{ label: 'A', assessed: 100, selected: 50 }, { label: 'B', assessed: 100, selected: 30 }]);
    expect(r[1].ratio).toBe(0.6);
    expect(auditExpired(D(2025, 8, 20), TODAY)).toBe(true);
    expect(auditExpired(D(2026, 3, 12), TODAY)).toBe(false);
  });

  it('YX-ATS-32: identity flags are listed for review', () => {
    expect(identityFlags(ID_POINTS)).toEqual(['AI interview']);
  });
});

describe('projects rules', () => {
  it('YX-PRJ-07: burn alerts at 80 / 100 %', () => {
    expect(burnState(79, 100).state).toBe('ok');
    expect(burnState(85, 100).state).toBe('alert');
    expect(burnState(105, 100).state).toBe('over');
  });

  it('YX-PRJ-06 / 08: utilisation, suppression, single-person cost hidden from PM', () => {
    expect(utilisation(1_120, 1_480)).toBe(75.7);
    expect(suppressGroup(3, 'pm')).toBe(true);
    expect(suppressGroup(3, 'hr')).toBe(false);
    expect(costVisible(1, 'pm')).toBe(false);
    expect(costVisible(1, 'finance')).toBe(true);
  });

  it('YX-PRJ-09: T&M bills approved client-approved billable hours at the right rate', () => {
    const r = tmBilling(WIP_LINES, RATE_CARD_PRJ);
    // priya 120 × 2,200 override + rohit 160 × 1,600 + divya 80 × 1,800
    expect(r.amount).toBe(120 * 2_200 + 160 * 1_600 + 80 * 1_800);
    expect(r.heldHours).toBe(40);
    expect(r.billed).not.toContain('w5');
    expect(r.billed).not.toContain('w6');
  });

  it('YX-PRJ-10: fixed fee ₹10 L, 30/40/30, bills ₹3 L after milestone 1 accepted', () => {
    const ms = [
      { id: 'a', name: 'M1', pct: 30, due: TODAY, status: 'accepted' as const, needsClientAcceptance: true },
      { id: 'b', name: 'M2', pct: 40, due: TODAY, status: 'completed' as const, needsClientAcceptance: true },
      { id: 'c', name: 'M3', pct: 30, due: TODAY, status: 'planned' as const, needsClientAcceptance: true },
    ];
    const s = milestoneSummary(ms, 10_00_000);
    expect(s.billableAmount).toBe(3_00_000);
    expect(s.warning).toBeNull();
    expect(milestoneSummary(ms.slice(0, 2), 10_00_000).warning).toMatch(/70%/);
  });

  it('bulk approval only within allocation', () => {
    expect(bulkEligible({ id: 'x', hours: 40, allocatedHours: 40 })).toBe(true);
    expect(bulkEligible({ id: 'x', hours: 42, allocatedHours: 40 })).toBe(false);
  });

  it('YX-PRJ-15: down 8 h makes a credit note; recovery only by policy', () => {
    const e = correctionEffect({ invoicedHours: 44, correctedHours: 36, rate: 1_600, costRate: 720, recoveryPolicy: 'recovery' });
    expect(e.kind).toBe('credit-note');
    expect(e.net).toBe(12_800);
    expect(e.recovery).toBe(5_760);
    expect(correctionEffect({ invoicedHours: 44, correctedHours: 36, rate: 1_600, costRate: 720, recoveryPolicy: 'none' }).recovery).toBe(0);
    expect(correctionEffect({ invoicedHours: 44, correctedHours: 48, rate: 1_600, costRate: 720, recoveryPolicy: 'none' }).kind).toBe('supplementary');
  });

  it('YX-PRJ-17: bench first, confirmed skill; fully allocated excluded', () => {
    const m = matchResource({ skill: 'SQL', pct: 100 }, RESOURCE_PEOPLE, TODAY);
    expect(m[0].name).toBe('Kavya Reddy');
    expect(m.map((x) => x.name)).not.toContain('Priya Nair');
    expect(m.map((x) => x.name)).not.toContain('Sana Nizami');
    expect(benchStatus(50)).toBe('partly allocated');
  });

  it('PRJ-08: mapping rules by priority; disabled rules ignored', () => {
    const r = applyMappingRules(MAPPING_RULES, LAST_WEEK_ITEMS);
    expect(r.find((x) => x.item.id === 's1')!.rule!.project).toBe('NRP-WEB');
    expect(r.find((x) => x.item.id === 's5')!.rule!.project).toBe('INT-ADM');
    expect(r.find((x) => x.item.id === 's6')!.rule).toBeNull();
    expect(r.find((x) => x.item.id === 's7')!.rule).toBeNull();
  });
});

describe('screens', () => {
  it('HIR-24: publish stays disabled until the required range is entered', () => {
    render(<JobPayRangePanel location="New York office" law={{ rangeRequired: true, historyBanned: true, source: 'law' }} />);
    expect(screen.getByRole('button', { name: 'Publish job' })).toBeDisabled();
    expect(screen.getByText(/Publishing is blocked/)).toBeInTheDocument();
  });

  it('HIR-07: scorecard submit enables after all ratings and a recommendation', async () => {
    const u = userEvent.setup();
    render(<ScorecardScreen candidate="A" round="Panel 1" skills={[{ skill: 'Test design', weight: 100, passBar: 3, hint: 'h' }]} />);
    const submit = screen.getByRole('button', { name: 'Submit scorecard' });
    expect(submit).toBeDisabled();
    await u.click(screen.getByRole('radio', { name: '2' }));
    expect(screen.getByText(/Below the pass bar on Test design/)).toBeInTheDocument();
    await u.click(screen.getByRole('radio', { name: 'Yes' }));
    expect(submit).toBeEnabled();
  });
});
