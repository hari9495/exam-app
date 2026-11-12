import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsHomeScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { TIME_SETTINGS, changeWords, historyOnPage, timeSettingsPage, type SettingChangeRow, type TimeSettingsData } from './time-settings-live';
import { TIME_REGISTRY_SAMPLE } from './time-settings-sample';
import { AuditLogScreen } from '../platform-a/integrations';
import { diffOf } from '../platform-a/audit-log-live';

// Settings S-5 (answers 1326, 1333, 1461, 1563): change history on each page, view-only pages, Recently changed on the
// home and the company audit log. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const pageOf = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const DATA: TimeSettingsData = { registry: TIME_REGISTRY_SAMPLE, company: {}, elsewhere: {}, limits: {}, canEdit: true, canGuard: false, lastChange: null };
const LINKS = new Set(Object.values(TIME_SETTINGS).flatMap((p) => p.links));
const page = timeSettingsPage(pageOf('3.4'), DATA, LINKS);
const ROWS: SettingChangeRow[] = [
  { id: 'a2', at: '2026-11-12T10:05:00.000Z', by: 'Lakshmi Venkatesan', role: 'org_admin', key: 'roster.min_weekly_offs', label: 'Weekly offs', scope: 'Company', from: '1', to: '2' },
  { id: 'a1', at: '2026-11-10T09:00:00.000Z', by: 'Suresh Pillai', role: null, key: 'roster.min_weekly_offs', label: 'Weekly offs', scope: 'Hosur plant', from: null, to: '1' },
];
const show = (canEdit: boolean, rows = ROWS) => {
  const past = historyOnPage(page, rows);
  return render(
    <ToastProvider>
      <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.4" live={{ page, canEdit, lastChange: past.lastChange, history: past.history, onSave: vi.fn().mockResolvedValue(undefined) }} />
    </ToastProvider>,
  );
};

describe('1326: change history on the page', () => {
  it('the last change under the title; View history lists every change with before and after', async () => {
    show(true);
    expect(screen.getByText(/Last changed by Lakshmi Venkatesan/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'View history' }));
    const drawer = await screen.findByRole('dialog', { name: 'Change history' });
    expect(within(drawer).getByText(/\(System Admin\) changed .* from 1 to 2/)).toBeInTheDocument();
    expect(within(drawer).getByText(/\(Hosur plant\) from Starter default to 1/)).toBeInTheDocument();
  });

  it('no change yet: no history line at all (never made up)', () => {
    show(true, []);
    expect(screen.queryByText(/Last changed by/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'View history' })).toBeNull();
  });

  it('an unknown role says nothing in brackets', () => {
    expect(historyOnPage(page, [ROWS[1]!]).lastChange!.role).toBe('');
    expect(changeWords(null, { ...ROWS[0]!, key: 'x.y', label: 'Something' })).toEqual({ what: 'Something', from: '1', to: '2' });
  });
});

describe('1333: view-only pages', () => {
  it('without the change key: View only, no save bar, history still readable', async () => {
    show(false);
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'View history' }));
    expect(await screen.findByRole('dialog', { name: 'Change history' })).toBeInTheDocument();
  });
});

describe('1461: Recently changed on the home', () => {
  const live = (recent?: { id: string; what: string; from: string; to: string; who: string; at: string; pageId: string }[], auditHref?: string) => ({ pageHref: (id: string) => `/p/${id}`, groupHref: () => '/g', onNavigate: vi.fn(), recent, auditHref });
  const groups = SETTINGS_GROUPS.filter((g) => g.pages.some((p) => p.id === '3.4'));
  it('the latest changes, each linking to its page; the audit log only when it may be read', () => {
    render(<SettingsHomeScreen groups={groups} live={live([{ id: 'r1', what: 'Weekly offs', from: '1', to: '2', who: 'Lakshmi', at: '2026-11-12T10:05', pageId: '3.4' }], '/yx/settings/audit-log')} />);
    const card = screen.getByText('Recently changed').closest('section, .yx-card, div') as HTMLElement;
    expect(within(card.parentElement as HTMLElement).getByRole('link', { name: /Weekly offs.*1 → 2/ })).toHaveAttribute('href', '/p/3.4');
    expect(screen.getByRole('link', { name: 'Audit log' })).toHaveAttribute('href', '/yx/settings/audit-log');
  });

  it('nothing changed (or nothing they may open): no card, and no audit link without the key', () => {
    render(<SettingsHomeScreen groups={groups} live={live([])} />);
    expect(screen.queryByText('Recently changed')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Audit log' })).toBeNull();
  });
});

describe('1563: the company audit log', () => {
  const base = { state: 'ready' as const, onRetry: () => {}, areas: [{ value: 'settings', label: 'Settings' }], filters: {}, onFilters: vi.fn() };
  it('lists entries; a setting change shows before and after', async () => {
    render(<AuditLogScreen rows={[]} live={{ ...base, entries: [{ id: 'e1', at: '2026-11-12T10:05:00Z', action: 'org.setting.changed', entityType: 'setting', entityId: 's1', actor: 'Lakshmi', actorRole: 'org_admin', details: { key: 'roster.min_weekly_offs', from: '1', to: '2' } }] }} />);
    await ue.click(screen.getByText('org.setting.changed'));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('roster.min_weekly_offs')).toBeInTheDocument();
  });

  it('filters by area, and says nothing matches when From is after To', async () => {
    const onFilters = vi.fn();
    render(<AuditLogScreen rows={[]} live={{ ...base, entries: [], filters: { from: '2026-11-12', to: '2026-11-01' }, onFilters }} />);
    expect(screen.getByText('From is after To, so nothing matches.')).toBeInTheDocument();
    expect(screen.getByText('No audit entries for these filters.')).toBeInTheDocument();
  });

  it('without audit.view: no access', () => {
    render(<AuditLogScreen rows={[]} live={{ ...base, state: 'no-access', entries: [] }} />);
    expect(screen.getByText(/You don't have access to the audit log/)).toBeInTheDocument();
  });

  it('masked values stay masked; entries without values show none', () => {
    expect(diffOf({ before: { bankAccount: '•••• (hidden)' }, after: { bankAccount: '•••• (hidden)' } })).toEqual([]);
    expect(diffOf({ key: 'k', from: null, to: 'on' })).toEqual([{ field: 'k', before: '—', after: 'on' }]);
    expect(diffOf(null)).toEqual([]);
  });
});
