import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SETTINGS_GROUPS } from './settings-groups';
import {
  allSettings,
  buildIndex,
  belowMinimum,
  changedKeys,
  poshCheck,
  usageCheck,
  shareTotalCheck,
  budgetCheck,
  refExample,
  holidayCheck,
  validateDraft,
  contrastRatio,
  findPage,
  formatValue,
  highlightParts,
  initialDraft,
  legalHint,
  needsSecondApprover,
  searchSettings,
  showsStarter,
  validateSetting,
} from './settings-logic';
import { SettingsHomeScreen, SettingsPageScreen } from './settings-screens';
import { AccessDeniedState, TOURS, TourCard, accessVerdict, canConfirmIrreversible, newsFor, NEWS, shouldShowTour } from './help';
import type { SettingDef } from './settings-types';

const G = SETTINGS_GROUPS;
const pages = G.flatMap((g) => g.pages);

describe('settings registry (APX-D §3)', () => {
  it('has 8 groups and 71 pages with the counts from the map', () => {
    expect(G.map((g) => g.pages.length)).toEqual([8, 11, 12, 11, 9, 5, 9, 6]);
    expect(pages).toHaveLength(71);
  });
  it('has unique setting keys and every page has sections, an owner and a last change', () => {
    const keys = pages.flatMap((p) => allSettings(p).map((d) => d.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of pages) {
      expect(p.sections.length, p.id).toBeGreaterThan(0);
      expect(p.owner.length, p.id).toBeGreaterThan(0);
      expect(p.lastChange.at, p.id).toMatch(/^2026-\d\d-\d\dT\d\d:\d\d$/);
    }
  });
  it('links bespoke editors to a screen ID instead of rebuilding them', () => {
    const links = pages.flatMap((p) => allSettings(p)).filter((d) => d.kind === 'link');
    expect(links.length).toBeGreaterThan(10);
    for (const l of links) expect(l.linkScreenId, l.key).toMatch(/^[A-Z0-9]+-\d+/);
  });
});

describe('legal floors (law is a floor, D17)', () => {
  const maternity: SettingDef = { key: 'm', label: 'Maternity leave', kind: 'number', value: 182, unit: 'days', legal: { value: 182, statute: 'Maternity Benefit Act, 1961 s.5' } };
  const hours: SettingDef = { key: 'h', label: 'Weekly hours', kind: 'number', value: 48, unit: 'hours', legal: { value: 48, kind: 'max', statute: 'Factories Act, 1948 s.51' } };
  it('blocks values below a legal minimum and above a legal maximum', () => {
    expect(validateSetting(maternity, 120)).toMatch(/182 days or more/);
    expect(validateSetting(maternity, 200)).toBeNull();
    expect(validateSetting(hours, 54)).toMatch(/48 hours or less/);
    expect(validateSetting(hours, 45)).toBeNull();
  });
  it('shows the legal hint with the statute', () => {
    expect(legalHint(maternity)).toBe('Legal minimum: 182 days (Maternity Benefit Act, 1961 s.5)');
    expect(legalHint(hours)).toMatch(/^Legal maximum: 48 hours/);
  });
  it('applies to the real registry: maternity leave in 3.6', () => {
    const def = allSettings(findPage(G, '3.6').page).find((d) => d.key === 'leave.maternity_days')!;
    expect(validateSetting(def, 100)).not.toBeNull();
  });
});

describe('values, starter label and changes', () => {
  it('formats values for read-only view', () => {
    expect(formatValue({ key: 'a', label: 'A', kind: 'money', value: 15000 })).toBe('₹15,000');
    expect(formatValue({ key: 'b', label: 'B', kind: 'toggle', value: false })).toBe('Off');
    expect(formatValue({ key: 'c', label: 'C', kind: 'time', value: '21:30' })).toBe('9:30 pm');
    expect(formatValue({ key: 'd', label: 'D', kind: 'number', value: 30, unit: 'days' })).toBe('30 days');
  });
  it('shows "Starter default" only while the starter value is unchanged', () => {
    const d: SettingDef = { key: 's', label: 'S', kind: 'number', value: 3, starter: true };
    expect(showsStarter(d, 3)).toBe(true);
    expect(showsStarter(d, 4)).toBe(false);
  });
  it('detects changed keys against saved values', () => {
    const p = findPage(G, '3.3').page;
    const draft = initialDraft(p);
    expect(changedKeys(p, draft)).toEqual([]);
    draft['shift.max_daily_hours'] = 8;
    expect(changedKeys(p, draft)).toEqual(['shift.max_daily_hours']);
  });
  it('payroll and approval-policy pages need a second approver', () => {
    expect(needsSecondApprover(findPage(G, '4.3').page)).toBe(true);
    expect(needsSecondApprover(findPage(G, '2.4').page)).toBe(true);
    expect(needsSecondApprover(findPage(G, '1.1').page)).toBe(false);
  });
});

describe('settings search', () => {
  const index = buildIndex(G);
  it('finds settings by task words and synonyms', () => {
    expect(searchSettings(index, 'probation').length).toBeGreaterThan(0);
    expect(searchSettings(index, 'maternity').some((r) => r.pageId === '3.6')).toBe(true);
  });
  it('returns only pages the viewer may manage', () => {
    const r = searchSettings(index, 'leave', (id) => id === '3.6');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.pageId === '3.6')).toBe(true);
  });
  it('requires every word and returns nothing for nonsense', () => {
    expect(searchSettings(index, 'canteen menu')).toEqual([]);
    expect(searchSettings(index, '   ')).toEqual([]);
  });
  it('highlights matches case-insensitively', () => {
    expect(highlightParts('Probation length', 'prob')).toEqual([
      { text: 'Prob', hit: true },
      { text: 'ation length', hit: false },
    ]);
  });
});

describe('settings screens', () => {
  it('home search shows results and a clear action when nothing matches', () => {
    render(<SettingsHomeScreen groups={G} defaultQuery="canteen menu" />);
    expect(screen.getByText(/No settings match/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getAllByText('Organisation').length).toBeGreaterThan(0);
  });
  it('blocks saving below the legal minimum and lists the error', () => {
    render(<SettingsPageScreen groups={G} pageId="3.6" defaultDraft={{ 'leave.maternity_days': 120 }} />);
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(screen.getAllByText(/182 days or more/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Changes sent for approval')).toBeNull();
  });
  it('read-only viewers get no save bar and can request access', () => {
    render(<SettingsPageScreen groups={G} pageId="4.7" readOnly />);
    expect(screen.queryByRole('button', { name: /Save changes|Send for approval/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Request access' }));
    expect(screen.getByRole('button', { name: 'Access requested' })).toBeTruthy();
  });
});

describe('help and onboarding (APX-D §6)', () => {
  it('tours have at most 3 steps and show once per version after their event', () => {
    for (const t of TOURS) expect(t.steps.length).toBeLessThanOrEqual(3);
    const t = TOURS[0];
    expect(shouldShowTour(t, false, [])).toBe(false);
    expect(shouldShowTour(t, true, [])).toBe(true);
    expect(shouldShowTour(t, true, [{ tourId: t.id, version: t.version, status: 'completed' }])).toBe(false);
    expect(shouldShowTour(t, true, [{ tourId: t.id, version: t.version - 1, status: 'completed' }])).toBe(true);
    expect(shouldShowTour(t, true, [{ tourId: t.id, version: t.version, status: 'in-progress', step: 1 }])).toBe(true);
  });
  it('tour card steps through and can be skipped', () => {
    render(<TourCard tour={TOURS[1]} />);
    expect(screen.getByText('Your first approval · 1 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Your first approval · 2 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(screen.getByText(/Tour skipped/)).toBeTruthy();
  });
  it('restricted and missing records both read "not found"; others "denied"', () => {
    expect(accessVerdict({ exists: true, recordType: 'POSH case', mayKnowExists: true })).toBe('not-found');
    expect(accessVerdict({ exists: false, recordType: 'Leave request', mayKnowExists: true })).toBe('not-found');
    expect(accessVerdict({ exists: true, recordType: 'Salary history', mayKnowExists: true })).toBe('denied');
    expect(accessVerdict({ exists: true, recordType: 'Project', mayKnowExists: true, inPlan: false })).toBe('not-enabled');
  });
  it('request access needs a reason', () => {
    render(<AccessDeniedState recordType="salary history" ownerRole="Payroll Manager" defaultRequesting />);
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByText(/Say why you need access/)).toBeTruthy();
  });
  it('irreversible actions need the exact phrase, a reason when required, and maker ≠ checker', () => {
    const base = { phrase: 'KAVERI SEP 2026', typed: 'KAVERI SEP 2026', reason: '' };
    expect(canConfirmIrreversible(base)).toBe(true);
    expect(canConfirmIrreversible({ ...base, typed: 'kaveri sep 2026' })).toBe(false);
    expect(canConfirmIrreversible({ ...base, reasonRequired: true })).toBe(false);
    expect(canConfirmIrreversible({ ...base, sameAsMaker: true })).toBe(false);
  });
  it("what's new is targeted by role and product", () => {
    expect(newsFor(NEWS, 'Employee', ['Time']).map((n) => n.id)).toEqual(['n1']);
  });
});

describe('plain words (founder review 30 Sep 2026)', () => {
  it('removes internal codes but keeps real law citations', async () => {
    const { plainText } = await import('./settings-logic');
    expect(plainText('Changes need a second approver (P03 YX-WF-16). Audited (P08).')).toBe('Changes need a second approver. Audited.');
    expect(plainText('Statutory rates come from P07 and are read-only.')).toBe('Statutory rates come from the statutory rules and are read-only.');
    expect(plainText('Leave type editor (TIM-27)')).toBe('Leave type editor');
    expect(plainText('Enter 182 days or more (Maternity Benefit Act, 1961 s.5).')).toBe('Enter 182 days or more (Maternity Benefit Act, 1961 s.5).');
  });
});

describe('brand colour contrast', () => {
  it('passes dark colours, fails light ones, and rejects non-colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#1F6F5C', '#FFFFFF')!).toBeGreaterThan(4.5);
    expect(contrastRatio('#FFD54F', '#FFFFFF')!).toBeLessThan(4.5);
    expect(contrastRatio('green', '#FFFFFF')).toBeNull();
  });
});

describe('table rules', () => {
  it('flags a POSH committee that falls short of the law, per workplace', () => {
    const rows = [
      ['Hosur plant', 'A', 'Presiding officer'],
      ['Hosur plant', 'B', 'Member'],
      ['Hosur plant', 'C', 'Member'],
      ['Hosur plant', 'D', 'External member'],
      ['Bengaluru head office', 'E', 'Presiding officer'],
    ];
    expect(poshCheck(rows)).toEqual([
      { label: 'Hosur plant', ok: true, text: 'Meets the law' },
      { label: 'Bengaluru head office', ok: false, text: 'Needs 2 more members and an external member' },
    ]);
  });
  it('blocks values below the minimum, by pick-list order or by number', () => {
    expect(belowMinimum('Low', 'Medium', ['Low', 'Medium', 'High'])).toBe(true);
    expect(belowMinimum('High', 'Medium', ['Low', 'Medium', 'High'])).toBe(false);
    expect(belowMinimum('5 years', '8 years')).toBe(true);
    expect(belowMinimum('8 years', '—')).toBe(false);
  });
  it('shows auto-confirm days only when auto-confirm is on', () => {
    const { unmount } = render(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.5" />);
    expect(screen.queryByText('Auto-confirm after')).toBeNull();
    unmount();
    render(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.5" defaultDraft={{ 'probation.auto_confirm': true }} />);
    expect(screen.getAllByText('Auto-confirm after').length).toBeGreaterThan(0);
  });
});

describe('time and leave rules', () => {
  it('checks each holiday calendar against its state minimum', () => {
    expect(holidayCheck([['KA 2026', 'Karnataka', 'Bengaluru', '12', '3 of 8'], ['TN 2026', 'Tamil Nadu', 'Chennai', '8', '2 of 6']])).toEqual([
      { label: 'KA 2026', ok: true, text: '12 holidays, law needs 10' },
      { label: 'TN 2026', ok: false, text: 'Only 8 holidays, law needs 9' },
    ]);
  });
  it('blocks a half day longer than a full day, and visitor hours that end before they start', () => {
    const shifts = findPage(SETTINGS_GROUPS, '3.3').page;
    expect(validateDraft(shifts, { ...initialDraft(shifts), 'shift.half_day_hours': 9 })['shift.half_day_hours']).toMatch(/more than full day from/);
    const vis = findPage(SETTINGS_GROUPS, '3.12').page;
    expect(validateDraft(vis, { ...initialDraft(vis), 'vis.hours_to': '08:00' })['vis.hours_to']).toMatch(/later than visitors allowed from/);
  });
  it('labels YukthiX product rules as built-in, not law', () => {
    const def = allSettings(findPage(SETTINGS_GROUPS, '3.1').page).find((d) => d.key === 'attendance.status_basis')!;
    expect(def.builtIn).toBe(true);
    expect(def.law).toMatch(/^Suspended, long leave/);
  });
  it('shows location exceptions once, and choosing one switches the page to it', () => {
    render(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sales department: Assumed present' }));
    expect(screen.getByText("You're editing overrides for Sales department")).toBeTruthy();
  });
});

describe('payroll pages', () => {
  it('shows several legal values as one table, and blocks a smallest draw above the largest', () => {
    render(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.7" />);
    expect(screen.getByRole('table', { name: 'Values set by law' })).toBeTruthy();
    const ewa = findPage(SETTINGS_GROUPS, '4.10').page;
    expect(validateDraft(ewa, { ...initialDraft(ewa), 'ewa.min_draw': 20000 })['ewa.min_draw']).toMatch(/more than largest draw/);
  });
});

describe('documents and letters', () => {
  it('previews the next reference number and needs the running number', () => {
    expect(refExample('KFL/{type}/{yyyy}/{seq:4}')).toBe('KFL/APT/2026/0143');
    const def = allSettings(findPage(SETTINGS_GROUPS, '5.2').page).find((d) => d.key === 'letter.ref_format')!;
    expect(validateSetting(def, 'KFL/{type}/{yyyy}')).toMatch(/Add \{seq\}/);
    expect(validateSetting(def, 'KFL/{type}/{seq:3}')).toBeNull();
  });
});

describe('hiring and learning checks', () => {
  it('needs calibration shares to total 100 %, and flags a department over its training budget', () => {
    expect(shareTotalCheck([['A', '10 %'], ['B', '90 %']])[0]).toEqual({ label: 'Total', ok: true, text: 'Total 100 %' });
    expect(shareTotalCheck([['A', '10 %'], ['B', '80 %']])[0].ok).toBe(false);
    expect(budgetCheck([['Sales', '₹9,00,000', '₹4,50,000'], ['Quality', '₹1,00,000', '₹1,20,000']])).toEqual([
      { label: 'Sales', ok: true, text: '50 % used' },
      { label: 'Quality', ok: false, text: 'Over budget by ₹20,000' },
    ]);
  });
});

describe('integrations', () => {
  it('keeps paid add-ons usable, greys out unreleased items, and shows usage as a meter', () => {
    render(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.9" />);
    expect(screen.getByRole('checkbox', { name: /Use deepfake detection/ })).not.toBeDisabled();
    expect(screen.getByText('Add-on')).toBeTruthy();
    const ai = allSettings(findPage(SETTINGS_GROUPS, '7.6').page).find((d) => d.key === 'ai.credits_used')!;
    expect(formatValue(ai, 4380)).toBe('4,380 of 12,000 credits');
  });
});

describe('billing', () => {
  it('shows each usage meter against its allowance', () => {
    expect(usageCheck([['SMS', '1,240 (5 per employee)', '910', '₹0'], ['Storage', '50 GB', '45 GB', '₹0'], ['AI', '100', '120', '₹0']])).toEqual([
      { label: 'SMS', ok: true, text: '73 % used' },
      { label: 'Storage', ok: false, text: '90 % used, nearly at the allowance' },
      { label: 'AI', ok: false, text: '120 % used, over the allowance' },
    ]);
  });
});
