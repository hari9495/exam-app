import { describe, expect, it } from 'vitest';
import { SETTINGS_GROUPS } from './settings-groups';
import { MORE_SETTINGS, PAY_SETTINGS, PEOPLE_SETTINGS, TIME_SETTINGS, timeSettingsListChanges, timeSettingsPage, type RegistryDef, type TimeSettingsData } from './time-settings-live';
import { LIST_CHECKS } from './settings-logic';
import { allSettings } from './settings-logic';

// Settings S-8 (answer 1323): 4.8 Expenses & travel and 6.3 Performance show the company choices that had no screen.
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const keysOf = (id: string) => MORE_SETTINGS[id]!.settings.map((s) => s.key);
const def = (values: string[], d: string): RegistryDef => ({ label: 'x', scopes: ['tenant'], dated: false, values, default: d }) as RegistryDef;
const data = (registry: Record<string, RegistryDef>, company: Record<string, string> = {}): TimeSettingsData => ({ registry, company, elsewhere: {}, limits: {}, canEdit: true, canGuard: false, lastChange: null });

describe('S-8: Expenses & travel (4.8) and Performance (6.3)', () => {
  it('the 16 expense and 18 performance choices each sit once on their page, and nowhere else', () => {
    expect(keysOf('4.8')).toHaveLength(16); // T2-B item 67 added the advances switch and the advance limit
    expect(keysOf('4.8').every((k) => k.startsWith('expense.'))).toBe(true);
    expect(keysOf('6.3')).toHaveLength(22); // batch F item 30: perf.goal.stale_days; T2-C item 72: the company guide (3)
    expect(keysOf('6.3').every((k) => k.startsWith('perf.'))).toBe(true);
    const all = [TIME_SETTINGS, PAY_SETTINGS, PEOPLE_SETTINGS, MORE_SETTINGS].flatMap((g) => Object.values(g).flatMap((p) => p.settings.map((s) => s.key)));
    expect(new Set(all).size).toBe(all.length);
  });

  it('a field shows the starter value; a changed one is not marked starter; the policy matrix link stays when it opens', () => {
    const reg = { 'expense.finance_audit': def(['off', 'flagged_only', 'all'], 'flagged_only'), 'expense.gst.capture': def(['off', 'on'], 'off') };
    const page = timeSettingsPage(pageOf('4.8'), data(reg, { 'expense.gst.capture': 'on' }), new Set(['exp.policy_matrix_editor']));
    const f = (k: string) => allSettings(page).find((d) => d.key === k)!;
    expect(f('expense.finance_audit')).toMatchObject({ kind: 'select', value: 'flagged_only', starter: true });
    expect(f('expense.gst.capture')).toMatchObject({ kind: 'toggle', value: true, starter: false });
    expect(f('exp.policy_matrix_editor')).toMatchObject({ kind: 'link' });
  });

  it('negative: a drawn sample field never shows live; a link the viewer cannot open is left out', () => {
    const reg = { 'perf.goal.approval': def(['manager', 'none'], 'manager') };
    const page = timeSettingsPage(pageOf('6.3'), data(reg), new Set());
    const keys = allSettings(page).map((d) => d.key);
    expect(keys).toEqual(['perf.goal.approval']);
    expect(keys).not.toContain('perf.scale');
    expect(keys).not.toContain('perf.templates');
  });

  it('5.4 Notifications: the email switch and the digest time, with the link to the wording editor', () => {
    // T2-E 51 (answer 2874): plus the six Home reminder kinds, each a company switch.
    expect(keysOf('5.4')).toEqual(['notify.email.enabled', 'notify.email.default_cadence', 'notify.digest.time', 'home.reminders.tax_declarations', 'home.reminders.tax_proofs', 'home.reminders.tax_regime', 'home.reminders.review', 'home.reminders.survey', 'home.reminders.sent_back']);
    const reg = { 'notify.email.enabled': def(['on', 'off'], 'on'), 'notify.digest.time': def(['06:00', '07:00', '18:00'], '07:00') };
    const page = timeSettingsPage(pageOf('5.4'), data(reg), new Set(['ntf.templates']));
    const keys = allSettings(page).map((d) => d.key);
    expect(keys).toEqual(['notify.email.enabled', 'ntf.templates', 'notify.digest.time']);
    // Negative: the drawn quiet hours, WhatsApp and field-staff samples never show (those channels are not built).
    expect(keys.some((k) => k.startsWith('ntf.quiet') || k.startsWith('ntf.whatsapp') || k === 'ntf.field_staff')).toBe(false);
  });

  it('T2-C item 72 (answer 2845): the company guide is off by default and shows as the drawn Rating / Guide share table', () => {
    const shares = { label: 'x', scopes: ['tenant'], dated: false, values: [], text: { maxLength: 400 }, default: 'Outstanding:10,Meets:90' } as unknown as RegistryDef;
    const reg = { 'perf.calibration.default_guide': def(['off', 'on'], 'off'), 'perf.calibration.guide_shares': shares, 'perf.calibration.guide_tolerance': def(['5', '10'], '10') };
    const d = data(reg);
    const page = timeSettingsPage(pageOf('6.3'), d, new Set());
    const f = (k: string) => allSettings(page).find((x) => x.key === k)!;
    expect(f('perf.calibration.default_guide')).toMatchObject({ kind: 'toggle', value: false, starter: true });
    expect(f('perf.calibration.guide_shares')).toMatchObject({ kind: 'list', columns: ['Rating', 'Guide share'], rows: [['Outstanding', '10 %'], ['Meets', '90 %']] });
    expect(page.sections.find((s) => s.settings.some((x) => x.key === 'perf.calibration.guide_shares'))!.title).toBe('360° and calibration');
    // Saved back as rating:share pairs; a comma or colon in a name cannot break the list.
    expect(timeSettingsListChanges({ 'perf.calibration.guide_shares': [['Outstanding', '15 %'], ['Meets: core', '85'], ['', '']] }, d)).toEqual([{ key: 'perf.calibration.guide_shares', value: 'Outstanding:15,Meets core:85' }]);
    // Negative: shares that do not add up to 100 are flagged under the table (the API refuses them too).
    expect(LIST_CHECKS['perf.calibration.guide_shares']([['Outstanding', '15 %'], ['Meets', '80 %']])[0]).toMatchObject({ ok: false, text: 'Total 95 %, must be 100 %' });
    // The one-column lists keep working as before.
    const coll = { ...shares, default: '' } as RegistryDef;
    expect(timeSettingsListChanges({ 'asmt.bank.second_approver_collections': [['Maths'], ['Maths'], ['Hindi, 2']] }, data({ 'asmt.bank.second_approver_collections': coll }))).toEqual([{ key: 'asmt.bank.second_approver_collections', value: 'Maths,Hindi 2' }]);
  });
});
