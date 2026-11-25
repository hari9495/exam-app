import { describe, expect, it } from 'vitest';
import { SETTINGS_GROUPS } from './settings-groups';
import { MORE_SETTINGS, PAY_SETTINGS, PEOPLE_SETTINGS, TIME_SETTINGS, timeSettingsPage, type RegistryDef, type TimeSettingsData } from './time-settings-live';
import { allSettings } from './settings-logic';

// Settings S-8 (answer 1323): 4.8 Expenses & travel and 6.3 Performance show the company choices that had no screen.
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const keysOf = (id: string) => MORE_SETTINGS[id]!.settings.map((s) => s.key);
const def = (values: string[], d: string): RegistryDef => ({ label: 'x', scopes: ['tenant'], dated: false, values, default: d }) as RegistryDef;
const data = (registry: Record<string, RegistryDef>, company: Record<string, string> = {}): TimeSettingsData => ({ registry, company, elsewhere: {}, limits: {}, canEdit: true, canGuard: false, lastChange: null });

describe('S-8: Expenses & travel (4.8) and Performance (6.3)', () => {
  it('the 14 expense and 18 performance choices each sit once on their page, and nowhere else', () => {
    expect(keysOf('4.8')).toHaveLength(14);
    expect(keysOf('4.8').every((k) => k.startsWith('expense.'))).toBe(true);
    expect(keysOf('6.3')).toHaveLength(18);
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
    expect(keysOf('5.4')).toEqual(['notify.email.enabled', 'notify.email.default_cadence', 'notify.digest.time']);
    const reg = { 'notify.email.enabled': def(['on', 'off'], 'on'), 'notify.digest.time': def(['06:00', '07:00', '18:00'], '07:00') };
    const page = timeSettingsPage(pageOf('5.4'), data(reg), new Set(['ntf.templates']));
    const keys = allSettings(page).map((d) => d.key);
    expect(keys).toEqual(['notify.email.enabled', 'ntf.templates', 'notify.digest.time']);
    // Negative: the drawn quiet hours, WhatsApp and field-staff samples never show (those channels are not built).
    expect(keys.some((k) => k.startsWith('ntf.quiet') || k.startsWith('ntf.whatsapp') || k === 'ntf.field_staff')).toBe(false);
  });
});
