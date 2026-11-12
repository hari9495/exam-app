'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SETTINGS_GROUPS, SettingsPageScreen, historyOnPage, pendingOnPage, timeSettingsChanges, timeSettingsPage, type PendingSettingChange, type RegistryDef, type SettingsGroupDef, type TimeSettingsData } from '@yukthix/ui/hiring';
import { loadState, todayIst, useOrg, useOrgWrite, useYxPermissions } from './yx-org';
import { useYxNav } from './yx-shell';
import { groupSlug } from './yx-settings-home';
import { ME_SECURITY } from './yx-nav';
import { PAGE_SETTING_KEYS, useSettingsHistory } from './yx-settings-history';

// Settings S-2 and S-3 (answers 1323 to 1325): a drawn settings page with the company's settings from the registry
// (GET /org/settings), each marked Starter default until changed, with the legal limits from the country's rule set.
// Saving is PUT /org/settings per setting (audited); a value past the legal limit is refused by the page and the API,
// naming the Act. On the payroll pages a change waits for a second person while the company switch is on (1325): the
// page says so and lists what waits, with Approve and Reject (Withdraw for the person who asked).
type Overview = { registry: Record<string, RegistryDef>; limits: TimeSettingsData['limits']; pending?: PendingSettingChange[]; overrides: { key: string; scopeType: string; validFrom: string | null; value: unknown }[] };
type Page = SettingsGroupDef['pages'][number];

export function RegistrySettingsPage({ slug, pageIds, links, screens, canEdit, secondPerson }: {
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
}) {
  const router = useRouter();
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => pageIds.includes(p.id) && groupSlug(p.title) === slug);
  const perms = useYxPermissions();
  const { nav } = useYxNav();
  const settings = useOrg<Overview>('/settings');
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
    return { registry: d.registry, limits: d.limits ?? {}, company, elsewhere, canEdit: canEdit((k) => perms.has(k as never), design), canGuard: perms.has('access.role.manage'), lastChange: null };
  }, [settings.data, perms, design, canEdit]);
  const shown = useMemo(() => new Set(Object.entries(links).filter(([, href]) => mine.has(href)).map(([k]) => k)), [mine, links]);
  // Answer 1326: the page's last 20 changes (only its own settings that the registry knows).
  const keys = useMemo(() => (design && settings.data ? (PAGE_SETTING_KEYS[design.id] ?? []).filter((k) => settings.data!.registry[k]) : []), [design, settings.data]);
  const history = useSettingsHistory(keys);
  if (!design) return <SettingsPageScreen groups={SETTINGS_GROUPS} pageId={pageIds[0]!} state="no-access" />;
  const page = data ? timeSettingsPage(design, data, shown) : design;
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
        // The MFA floor is its own state (add a second factor), never "couldn't load" (walk of S-3).
        state: settings.isError && (settings.error as { code?: string }).code === 'MFA_REQUIRED' ? 'mfa' : loadState(settings),
        onSetUpMfa: () => router.push(ME_SECURITY),
        onRetry: () => void settings.refetch(),
        savedTitle: `${design.title} saved`,
        secondPerson: Boolean(switchOn),
        pending: waiting,
        onApprove: data?.canEdit ? async (id) => void (await write('POST', `/settings/requests/${encodeURIComponent(id)}/approve`, {})) : undefined,
        onReject: data?.canEdit ? async (id) => void (await write('POST', `/settings/requests/${encodeURIComponent(id)}/reject`, {})) : undefined,
        onSave: async (values) => {
          // A dated setting starts today (S-4); earlier days keep the old value.
          for (const c of timeSettingsChanges(values, data!)) await write('PUT', '/settings', { key: c.key, value: c.value, scopeType: 'tenant', ...(data!.registry[c.key]?.dated ? { validFrom: todayIst() } : {}) });
        },
        onOpenScreen: (screenId) => {
          const href = linkOf(screenId) ?? screens?.[screenId];
          if (href) router.push(href);
        },
      }}
    />
  );
}
