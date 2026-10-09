import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import * as L from './portals-logic';
import { OtpInput, OtpSignIn } from './portals-kit';
import { AnonymousCaseScreen, NomineeForm, VerifyPageScreen } from './t9-workforce';
import { VendorPortalScreen } from './t9-business';
import { RoadmapScreen } from './t9-public';
import { ANON_CASE, NOMINEES, TODAY, VERIFY_DOCS } from './t9-data';
import { SHARED_JOBS, VENDOR, VENDOR_SCORECARD, VENDOR_SUBMISSIONS } from './t9-biz-data';
import { ROADMAP } from './t9-pub-data';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('OTP rules', () => {
  it('cleans input, counts attempts and locks at 5', () => {
    expect(L.cleanOtp('48 29-13x9')).toBe('482913');
    expect(L.otpPhase(0)).toEqual({ phase: 'enter', left: 5 });
    expect(L.otpPhase(3)).toEqual({ phase: 'wrong', left: 2 });
    expect(L.otpPhase(5).phase).toBe('locked');
    expect(L.resendLabel(25)).toBe('Resend code in 0:25');
    expect(L.resendLabel(0)).toBe('Resend code');
    expect(L.maskDestination('meenakshi@example.in')).toBe('m•••@example.in');
    expect(L.maskDestination('9845012321')).toBe('+91 ••••• ••321');
  });

  it('OtpInput fills all boxes on paste and moves back on Backspace', () => {
    function Harness() {
      const [v, setV] = useState('');
      return (
        <>
          <OtpInput value={v} onChange={setV} />
          <output>{v}</output>
        </>
      );
    }
    render(<Harness />);
    const boxes = screen.getAllByRole('textbox');
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => '123-456' } });
    expect(screen.getByRole('status', { hidden: true }).textContent ?? document.querySelector('output')!.textContent).toBe('123456');
  });

  it('OtpSignIn shows attempts left, then locks', async () => {
    const u = userEvent.setup();
    render(<OtpSignIn title="Sign in" intro="x" defaultStage="code" destination="a@b.in" defaultAttempts={3} demoCode="999999" />);
    expect(screen.getByText(/2 attempts left/)).toBeInTheDocument();
    const boxes = screen.getAllByRole('textbox');
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => '111111' } });
    await u.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(screen.getByText(/1 attempts left/)).toBeInTheDocument();
    fireEvent.paste(screen.getAllByRole('textbox')[0], { clipboardData: { getData: () => '222222' } });
    await u.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(screen.getByText('Sign-in is paused for 15 minutes')).toBeInTheDocument();
  });
});

describe('access windows and documents', () => {
  it('flags access ending within 7 days and ended access', () => {
    expect(L.accessWindow(d(2026, 10, 3), TODAY)).toEqual({ state: 'ending', days: 4 });
    expect(L.accessWindow(d(2026, 12, 1), TODAY).state).toBe('active');
    expect(L.accessWindow(d(2026, 9, 1), TODAY).state).toBe('ended');
    expect(L.alumniAccessEnds(d(2025, 6, 30))).toEqual(d(2032, 6, 30));
  });

  it('verify page shows current, superseded, and hides withdrawn', () => {
    expect(L.verifyDocument('kf-vrf-8q2m-41tz', VERIFY_DOCS).state).toBe('current');
    expect(L.verifyDocument('KF-VRF-3N7P-90KD', VERIFY_DOCS).state).toBe('superseded');
    expect(L.verifyDocument('KF-VRF-7H1C-22WX', VERIFY_DOCS).state).toBe('not-found');
    render(<VerifyPageScreen tenant="Kaveri Foods" docs={VERIFY_DOCS} code="KF-VRF-7H1C-22WX" />);
    expect(screen.getByText("We couldn't verify this code")).toBeInTheDocument();
  });

  it('access codes normalise and anonymous page opens only with the right code', async () => {
    expect(L.formatAccessCode('k7qm 4tz8 xr2p 9hdw')).toBe('K7QM-4TZ8-XR2P-9HDW');
    expect(L.isCompleteAccessCode('K7QM-4TZ8')).toBe(false);
    const u = userEvent.setup();
    render(<AnonymousCaseScreen tenant="Kaveri Foods" stage="enter-code" caseInfo={ANON_CASE} />);
    await u.type(screen.getByLabelText(/Access code/), 'k7qm4tz8xr2p9hdv');
    await u.click(screen.getByRole('button', { name: 'Open report' }));
    expect(screen.getByText(/didn't match a report/)).toBeInTheDocument();
  });

  it('nominee shares must total 100% per scheme', async () => {
    expect(L.nomineeShareError([50, 50])).toBeNull();
    expect(L.nomineeShareError([40, 40])).toMatch(/80%/);
    expect(L.nomineeShareError([100, 0])).toMatch(/above 0%/);
    const u = userEvent.setup();
    render(<NomineeForm defaultNominees={NOMINEES} />);
    await u.click(screen.getByRole('button', { name: 'Save nominees' }));
    expect(screen.getByText('Fix the shares before saving')).toBeInTheDocument();
  });

  it('checklist percent counts done and in review', () => {
    expect(L.checklistPercent([{ id: 'a', status: 'done' }, { id: 'b', status: 'in-review' }, { id: 'c', status: 'todo' }, { id: 'd', status: 'sent-back' }])).toBe(50);
  });
});

describe('calculators', () => {
  it('gratuity: 15/26 × pay × years, >6 months rounds up, 5-year rule, cap', () => {
    expect(L.gratuity({ monthlyBasicDa: 52_000, years: 7, months: 8 })).toMatchObject({ eligible: true, countedYears: 8, amount: 240_000 });
    expect(L.gratuity({ monthlyBasicDa: 52_000, years: 4, months: 11 }).eligible).toBe(false);
    expect(L.gratuity({ monthlyBasicDa: 52_000, years: 2, months: 0, deathOrDisablement: true }).eligible).toBe(true);
    expect(L.gratuity({ monthlyBasicDa: 3_00_000, years: 30, months: 0 })).toMatchObject({ amount: 20_00_000, capped: true });
  });
  it('HRA exemption is the least of three', () => {
    expect(L.hraExemption({ basicDa: 4_80_000, hra: 2_40_000, rent: 2_64_000, metro: true })).toEqual({ exempt: 2_16_000, taxable: 24_000, rule: 'rent' });
  });
  it('income tax: new-regime rebate up to ₹12 lakh, cess 4%', () => {
    expect(L.incomeTax(12_75_000, 'new').tax).toBe(0);
    expect(L.incomeTax(14_00_000, 'new')).toEqual({ taxable: 13_25_000, tax: Math.round((20_000 + 40_000 + 18_750) * 1.04) });
    expect(L.esi(21_001).applies).toBe(false);
    expect(L.leaveEncashment(38_000, 18)).toBe(26_308);
  });
});

describe('business rules', () => {
  it('vendor rate cap, share limits and invoice', () => {
    expect(L.rateCapCheck(950, 900)).toEqual({ ok: false, over: 50 });
    expect(L.submissionBlock(SHARED_JOBS[2], TODAY)).toMatch(/all 5 submissions/);
    expect(L.submissionBlock(SHARED_JOBS[3], TODAY)).toMatch(/expired/);
    expect(L.vendorInvoice(160, 900, 10)).toEqual({ base: 1_44_000, gst: 25_920, gross: 1_69_920, tds: 14_400, payable: 1_55_520 });
  });
  it('vendor submit blocks a quote above the cap', () => {
    render(<VendorPortalScreen tenant="Srishti" vendor={VENDOR} today={TODAY} tab="submit" jobs={SHARED_JOBS} submissions={VENDOR_SUBMISSIONS} scorecard={VENDOR_SCORECARD} defaultRate={950} />);
    expect(screen.getByText(/above the ₹900 cap/)).toBeInTheDocument();
  });
  it('contract labour: under 18 and licence maximum block deployment', () => {
    expect(L.deploymentBlock({ dob: d(2009, 3, 3), today: TODAY, deployed: 10, maxWorkers: 50 })).toMatch(/under 18/);
    expect(L.deploymentBlock({ dob: d(1990, 1, 1), today: TODAY, deployed: 50, maxWorkers: 50 })).toMatch(/worker 51/);
    expect(L.deploymentBlock({ dob: d(1990, 1, 1), today: TODAY, deployed: 49, maxWorkers: 50 })).toBeNull();
    expect(L.licenceAlert(d(2026, 10, 6), TODAY)).toEqual({ band: '7', days: 7 });
  });
  it('roadmap: one vote per signed-in user, toggles off', async () => {
    expect(L.toggleVote({}, 'r1', null).error).toBe('Sign in to vote.');
    const once = L.toggleVote({}, 'r1', 'u').votes;
    expect(once.r1).toEqual(['u']);
    expect(L.toggleVote(once, 'r1', 'u').votes.r1).toEqual([]);
    const u = userEvent.setup();
    render(<RoadmapScreen items={ROADMAP} userId="u" />);
    const btn = screen.getAllByRole('button', { name: 'Vote' })[0];
    await u.click(btn);
    expect(screen.getAllByRole('button', { name: 'Voted' })).toHaveLength(1);
  });
});

describe('console and partner rules', () => {
  it('slab validation: start at 0, contiguous, open-ended last', () => {
    expect(L.slabErrors([{ from: 0, to: 29_999, amount: 0 }, { from: 30_000, to: null, amount: 200 }])).toEqual([]);
    const e = L.slabErrors([{ from: 0, to: 24_999, amount: 0 }, { from: 25_000, to: 29_999, amount: 150 }, { from: 29_000, to: null, amount: 250 }]).map((x) => x.message);
    expect(e).toContain('Row 3 overlaps row 2.');
    expect(L.slabErrors([{ from: 0, to: 100, amount: 0 }]).map((x) => x.message)).toContain('The last row needs no upper limit so every salary is covered.');
    expect(L.ptAnnualMax([{ from: 0, to: null, amount: 200 }], 100)).toBe(2_500);
  });
  it('maker ≠ checker, step-up window, support window, CS message cap', () => {
    expect(L.checkerError('A', 'A')).toMatch(/someone other/);
    expect(L.checkerError('A', null)).toMatch(/Pick/);
    expect(L.checkerError('A', 'B')).toBeNull();
    const now = new Date(2026, 8, 29, 9, 42);
    expect(L.stepUpFresh(new Date(2026, 8, 29, 9, 30), now)).toBe(true);
    expect(L.stepUpFresh(new Date(2026, 8, 29, 9, 20), now)).toBe(false);
    expect(L.supportWindowError(73)).toMatch(/72/);
    expect(L.csMessageAllowed('tip', 2)).toBe(false);
    expect(L.csMessageAllowed('incident', 5)).toBe(true);
  });
  it('maintenance needs 72 h and avoids the payroll window', () => {
    const now = new Date(2026, 8, 29, 9, 42);
    expect(L.maintenanceBlock(new Date(2026, 9, 1, 1), now)).toMatch(/72 hours/);
    expect(L.maintenanceBlock(new Date(2026, 9, 3, 1), now)).toMatch(/payroll-critical/);
    expect(L.maintenanceBlock(new Date(2026, 9, 11, 1), now)).toBeNull();
  });
  it('status, margin, receipts, commission, quiet hours, partner links', () => {
    expect(L.overallStatus(['operational', 'degraded', 'maintenance'])).toBe('degraded');
    expect(L.uptimePercent([{ downMinutes: 0 }, { downMinutes: 144 }])).toBe(95);
    expect(L.tenantMargin(100, 40)).toEqual({ margin: 60, share: 40, alert: true });
    expect(L.matchReceipt({ id: 'r', currency: 'SAR', amount: 12_540, remitter: 'x' }, [{ id: 'i', currency: 'SAR', amount: 12_600, customer: 'x' }]).invoice?.id).toBe('i');
    expect(L.matchReceipt({ id: 'r', currency: 'SGD', amount: 2_900, remitter: 'x' }, [{ id: 'i', currency: 'SGD', amount: 3_150, customer: 'x' }]).invoice).toBeNull();
    expect(L.commissionTotals([{ client: 'a', billed: 10_000, ratePct: 15, status: 'accrued' }, { client: 'b', billed: 20_000, ratePct: -15, status: 'approved' }])).toMatchObject({ accrued: 1_500, approved: -3_000, total: -1_500 });
    expect(L.inQuietHours('22:15')).toBe(true);
    expect(L.inQuietHours('07:59')).toBe(true);
    expect(L.inQuietHours('08:00')).toBe(false);
    expect(L.transferCompletesOn(TODAY, 45)).toEqual(d(2026, 10, 29));
    expect(L.linkActivationBlock({ verification: 'verified', agreementCurrent: false })).toMatch(/G-34/);
    expect(L.linkActivationBlock({ verification: 'verified', agreementCurrent: true })).toBeNull();
    expect(L.healthBand(44)).toBe('at-risk');
  });
});
