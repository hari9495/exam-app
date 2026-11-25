'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SETTINGS_GROUPS, SettingsPageScreen, historyOnPage, pendingOnPage, timeSettingsChanges, timeSettingsListChanges, timeSettingsOverrides, timeSettingsPage, type PendingSettingChange, type RegistryDef, type SettingsGroupDef, type TimeSettingsData } from '@yukthix/ui/hiring';
import { loadState, todayIst, useOrg, useOrgWrite, useYxPermissions } from './yx-org';
import { useYxNav } from './yx-shell';
import { groupSlug } from './yx-settings-home';
import { AUDIT_LOG, ME_SECURITY } from './yx-nav';
import { PAGE_SETTING_KEYS, useSettingsHistory } from './yx-settings-history';

// Settings S-2 and S-3 (answers 1323 to 1325): a drawn settings page with the company's settings from the registry
// (GET /org/settings), each marked Starter default until changed, with the legal limits from the country's rule set.
// Saving is PUT /org/settings per setting (audited); a value past the legal limit is refused by the page and the API,
// naming the Act. On the payroll pages a change waits for a second person while the company switch is on (1325): the
// page says so and lists what waits, with Approve and Reject (Withdraw for the person who asked).
type Overview = { registry: Record<string, RegistryDef>; limits: TimeSettingsData['limits']; pending?: PendingSettingChange[]; overrides: { key: string; scopeType: string; scopeId: string; validFrom: string | null; value: unknown; noLongerNeeded?: 'registered_factory' }[] };
type Named = { id: string; name: string; archivedAt?: string | null }[];
/** S-7 (answer 1484): the places a setting may have a value of its own, in words (an entity by its name). */
const PLACE: Record<string, (name: string) => string> = { legal_entity: (n) => n, location: (n) => `${n} (location)`, department: (n) => `${n} (department)`, employment_type: (n) => `${n} (employment type)`, grade: (n) => `Grade ${n}` };
type Page = SettingsGroupDef['pages'][number];

export function RegistrySettingsPage({ slug, pageIds, links, screens, canEdit, secondPerson, decorate, extra }: {
  slug: string;
  /** The drawn pages this route serves. */
  pageIds: readonly string[];
  /** Drawn editor links → the live page (shown when the viewer's menu has it). */
  links: Record<string, string>;
  /** The page's Related links (screen id → live page), e.g. Company rules where its other settings still are. */
  screens?: Record<string, string>;
  /** Whether the viewer may change this page, given their keys. */
  canEdit: (has: (key: string) => boolean, page: Page) => boolean;
  /** Answer 1325: the page's changes wait for a second person while the company switch is on. */
  secondPerson?: boolean;
  /** S-6 (answer 1330): adds what the page shows beside its settings (2.4: the approval policies). */
  decorate?: (page: Page) => Page;
  /** S-7: a block the page shows besides its settings (2.2: the Special data erasure report). */
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => pageIds.includes(p.id) && groupSlug(p.title) === slug);
  const perms = useYxPermissions();
  const { nav } = useYxNav();
  const settings = useOrg<Overview>('/settings');
  // S-7 (answer 1484): the records a value of its own can be set for ("Different for").
  const entities = useOrg<Named>('/legal-entities');
  const locations = useOrg<Named>('/locations');
  const types = useOrg<Named>('/masters/employment-types');
  const departments = useOrg<Named>('/masters/departments');
  const grades = useOrg<Named>('/masters/grades');
  const write = useOrgWrite();
  const mine = useMemo(() => new Set(nav.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.href)))), [nav]);
  const data = useMemo<TimeSettingsData | null>(() => {
    const d = settings.data;
    if (!d || !design) return null;
    const company: Record<string, string> = {};
    const elsewhere: Record<string, number> = {};
    // A dated setting (S-4) holds the company value in force today: the latest one from today or before.
    const today = todayIst();
    const since: Record<string, string> = {};
    for (const o of d.overrides)
      if (o.scopeType === 'tenant' && (!o.validFrom || (o.validFrom <= today && o.validFrom >= (since[o.key] ?? '')))) {
        company[o.key] = String(o.value);
        if (o.validFrom) since[o.key] = o.validFrom;
      } else if (o.scopeType !== 'tenant') elsewhere[o.key] = (elsewhere[o.key] ?? 0) + 1;
    // S-7 (answer 1484): each place's own value in force today (a dated one: the latest from today or before).
    const scopes = ([['legal_entity', entities.data], ['location', locations.data], ['department', departments.data], ['employment_type', types.data], ['grade', grades.data]] as const).flatMap(([type, rows]) =>
      (rows ?? []).filter((r) => !r.archivedAt).map((r) => ({ label: PLACE[type]!(r.name), type, id: r.id })),
    );
    const byScope: NonNullable<TimeSettingsData['byScope']> = {};
    for (const o of d.overrides) {
      if (o.scopeType === 'tenant' || (o.validFrom && o.validFrom > today)) continue;
      const place = scopes.find((s) => s.type === o.scopeType && s.id === o.scopeId);
      if (!place) continue;
      const list = (byScope[o.key] ??= []);
      const was = list.find((x) => x.scope === place.label);
      if (was && (was.validFrom ?? '') > (o.validFrom ?? '')) continue;
      if (was) list.splice(list.indexOf(was), 1);
      // Answer 1821: a location's own Factories Act value once the location is marked a registered factory.
      list.push({ scope: place.label, value: String(o.value), validFrom: o.validFrom, ...(o.noLongerNeeded === 'registered_factory' ? { note: 'No longer needed: the location is a registered factory' } : {}) });
    }
    return { registry: d.registry, limits: d.limits ?? {}, company, elsewhere, canEdit: canEdit((k) => perms.has(k as never), design), canGuard: perms.has('access.role.manage'), lastChange: null, scopes, byScope };
  }, [settings.data, perms, design, canEdit, entities.data, locations.data, departments.data, types.data, grades.data]);
  const shown = useMemo(() => new Set(Object.entries(links).filter(([, href]) => mine.has(href)).map(([k]) => k)), [mine, links]);
  // Answer 1326: the page's last 20 changes (only its own settings that the registry knows).
  const keys = useMemo(() => (design && settings.data ? (PAGE_SETTING_KEYS[design.id] ?? []).filter((k) => settings.data!.registry[k]) : []), [design, settings.data]);
  const history = useSettingsHistory(keys);
  if (!design) return <SettingsPageScreen groups={SETTINGS_GROUPS} pageId={pageIds[0]!} state="no-access" />;
  const built = data ? timeSettingsPage(design, data, shown) : design;
  const page = decorate && data ? decorate(built) : built;
  const linkOf = (screenId: string) => Object.entries(links).find(([k]) => design.sections.some((s) => s.settings.some((d) => d.key === k && d.linkScreenId === screenId)))?.[1];
  const waiting = secondPerson && settings.data ? pendingOnPage(page, settings.data.pending ?? []) : [];
  const past = history.data ? historyOnPage(page, history.data) : { lastChange: null, history: [] };
  const switchOn = secondPerson && (data?.company['payroll.settings.second_person'] ?? data?.registry['payroll.settings.second_person']?.default) === 'on';
  return (
    <SettingsPageScreen
      groups={SETTINGS_GROUPS}
      pageId={design.id}
      live={{
        page,
        canEdit: Boolean(data?.canEdit),
        lastChange: past.lastChange,
        history: past.history,
        auditHref: perms.has('audit.view') ? `${AUDIT_LOG}?area=settings` : undefined,
        // The MFA floor is its own state (add a second factor), never "couldn't load" (walk of S-3).
        state: settings.isError && (settings.error as { code?: string }).code === 'MFA_REQUIRED' ? 'mfa' : loadState(settings),
        onSetUpMfa: () => router.push(ME_SECURITY),
        onRetry: () => void settings.refetch(),
        savedTitle: `${design.title} saved`,
        extra,
        secondPerson: Boolean(switchOn),
        pending: waiting,
        onApprove: data?.canEdit ? async (id) => void (await write('POST', `/settings/requests/${encodeURIComponent(id)}/approve`, {})) : undefined,
        onReject: data?.canEdit ? async (id) => void (await write('POST', `/settings/requests/${encodeURIComponent(id)}/reject`, {})) : undefined,
        // S-7 (answer 1562): dated settings change from the day chosen (today by default).
        appliesFrom: design.sections.length && Object.values(data?.registry ?? {}).some((r) => r.dated) ? { today: todayIst() } : undefined,
        onSave: async (values, rows, overrides, appliesFrom) => {
          const from = appliesFrom && appliesFrom >= todayIst() ? appliesFrom : todayIst();
          for (const c of timeSettingsChanges(values, data!)) await write('PUT', '/settings', { key: c.key, value: c.value, scopeType: 'tenant', ...(data!.registry[c.key]?.dated ? { validFrom: from } : {}) });
          // Answer 2123: a comma-list setting edited as a table (e.g. 6.5's collections that need a second approver).
          for (const c of timeSettingsListChanges(rows, data!)) await write('PUT', '/settings', { key: c.key, value: c.value, scopeType: 'tenant' });
          // S-7 (answer 1484): values of their own for one place ("Different for").
          for (const o of timeSettingsOverrides(overrides ?? [], data!)) await write('PUT', '/settings', { key: o.key, value: o.value, scopeType: o.scopeType, scopeId: o.scopeId, ...(data!.registry[o.key]?.dated ? { validFrom: from } : {}) });
        },
        onOpenScreen: (screenId) => {
          const href = linkOf(screenId) ?? screens?.[screenId];
          if (href) router.push(href);
        },
      }}
    />
  );
}
