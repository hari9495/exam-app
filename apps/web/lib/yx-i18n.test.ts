import en from '../messages/en.json';
import hi from '../messages/hi.json';
import { bellText, messagesFor, navLabel } from './yx-i18n';
import type { NotificationView } from './types';
import { buildNav, type NavInput } from './yx-nav';

// T2-G 84b (answer 2743): the web's Hindi words with next-intl. Guard: every Hindi key exists in English.
type Tree = { [k: string]: string | Tree };
const keys = (t: Tree, at = ''): string[] => Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [`${at}${k}`] : keys(v, `${at}${k}.`)));

describe('web messages', () => {
  it('every Hindi key exists in English; no Hindi word is empty', () => {
    const known = new Set(keys(en as Tree));
    expect(keys(hi as Tree).filter((k) => !known.has(k))).toEqual([]);
    expect(Object.values((hi as { nav: Record<string, string> }).nav).filter((v) => !v.trim())).toEqual([]);
  });

  it('every translated link exists in the menu with that English label', () => {
    const base: NavInput = { has: () => true, role: 'org_admin', support: false, employee: true, manager: true, history: true, clearance: true, tasks: true, firstDays: true };
    const labels = new Map(buildNav(base).flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => [l.id, l.label] as const))));
    const missing = Object.entries((en as { nav: Record<string, string> }).nav).filter(([id, label]) => labels.has(id) && labels.get(id) !== label);
    expect(missing).toEqual([]);
  });

  it('a Hindi reader gets the self-service links in Hindi and the rest as built; English readers get English', () => {
    expect(navLabel('hi')('my-leave', 'My leave')).toBe('मेरी छुट्टी');
    expect(navLabel('hi')('my-payslips', 'Payslips')).toBe('वेतन पर्चियाँ');
    // Admin pages stay English; a reused id with other words keeps them.
    expect(navLabel('hi')('pay-runs', 'Payroll home')).toBe('Payroll home');
    expect(navLabel('hi')('my-leave', 'Leave of my team')).toBe('Leave of my team');
    expect(navLabel('en')('my-leave', 'My leave')).toBe('My leave');
  });

  it('the provider gets the kit words under "kit", English where Hindi has none', () => {
    const m = messagesFor('hi') as { kit: { myLanguage: { title: string } }; nav: Record<string, string> };
    expect(m.kit.myLanguage.title).toBe('भाषा');
    expect(Object.keys(m.nav).sort()).toEqual(Object.keys((en as { nav: object }).nav).sort());
  });
});

describe('the bell in the reader language', () => {
  const n = (type: string, over: Partial<NotificationView> = {}): NotificationView => ({ id: 'n1', type, actorUserId: null, actorName: null, entityType: 'x', entityId: 'e', contextText: null, linkPath: '/x', readAt: null, createdAt: '2026-11-28T09:00:00Z', ...over }) as NotificationView;
  it('approvals and self-service kinds read in Hindi for a Hindi reader', () => {
    expect(bellText('hi')(n('approval.approved', { contextText: 'Leave 3 Dec' }))).toBe('आपका अनुरोध मंज़ूर हो गया: Leave 3 Dec');
    expect(bellText('hi')(n('workflow.approval.needed'))).toBe('एक अनुरोध को आपकी मंज़ूरी चाहिए');
    expect(bellText('hi')(n('leave.reminder', { contextText: '3 Dec' }))).toBe('आपकी छुट्टी के बारे में एक याद: 3 Dec');
  });
  it('negative: English readers and kinds not in Hindi keep the English line', () => {
    expect(bellText('en')(n('approval.approved'))).toBe('Your submission was approved');
    expect(bellText('hi')(n('helpdesk.backlog.alert', { contextText: 'IT desk' }))).toBe('IT desk');
  });
});
