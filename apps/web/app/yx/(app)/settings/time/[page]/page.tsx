'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SETTINGS_GROUPS, SettingsPageScreen, TIME_SETTINGS, timeSettingsChanges, timeSettingsPage, type RegistryDef, type TimeSettingsData } from '@yukthix/ui/hiring';
import { loadState, useOrg, useOrgWrite, useYxPermissions } from '../../../../../../lib/yx-org';
import { useYxNav } from '../../../../../../lib/yx-shell';
import { LEAVE_SETTINGS_PAGES } from '../../../../../../lib/yx-nav';
import { groupSlug } from '../../../../../../lib/yx-settings-home';

// Settings › Time & Leave pages (S-2, answers 1323 and 1324): the drawn page with the company's settings from the
// registry (GET /org/settings), each marked Starter default until HR changes it, and the legal limits from the country's
// rule set. Saving is PUT /org/settings per setting (org.settings.manage, the guard key on guarded ones; audited); a value
// past the legal limit is refused by the page and the API, naming the Act. The drawn links open the live editors.
const PAGES = SETTINGS_GROUPS.flatMap((g) => g.pages).filter((p) => TIME_SETTINGS[p.id]);
/** Drawn editor links → the live page (shown when the viewer's menu has it). */
const LINKS: Record<string, string> = {
  'checkin.geofence': '/yx/time/setup/locations',
  'checkin.devices': '/yx/time/setup/devices',
  'shift.editor': '/yx/time/shifts-setup',
  'roster.editor': '/yx/time/roster',
  'leave.type_editor': '/yx/time/setup',
  'leave.year_end_wizard': '/yx/time/setup/year-end',
  'holiday.calendar_editor': '/yx/time/setup/holidays',
  'holiday.feed': '/yx/time/setup/holiday-feeds',
};
type Overview = { registry: Record<string, RegistryDef>; limits: TimeSettingsData['limits']; overrides: { key: string; scopeType: string; validFrom: string | null; value: unknown }[] };

export default function YxTimeSettingsPage() {
  const router = useRouter();
  const { page: slug } = useParams<{ page: string }>();
  const design = PAGES.find((p) => groupSlug(p.title) === slug);
  const perms = useYxPermissions();
  const { nav } = useYxNav();
  const settings = useOrg<Overview>('/settings');
  const write = useOrgWrite();
  const mine = useMemo(() => new Set(nav.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.href)))), [nav]);
  const data = useMemo<TimeSettingsData | null>(() => {
    const d = settings.data;
    if (!d) return null;
    const company: Record<string, string> = {};
    const elsewhere: Record<string, number> = {};
    for (const o of d.overrides)
      if (o.scopeType === 'tenant' && !o.validFrom) company[o.key] = String(o.value);
      else if (o.scopeType !== 'tenant') elsewhere[o.key] = (elsewhere[o.key] ?? 0) + 1;
    return { registry: d.registry, limits: d.limits ?? {}, company, elsewhere, canEdit: perms.has('org.settings.manage') || (perms.has('leave.settings.manage') && LEAVE_SETTINGS_PAGES.includes(design?.id ?? '')), canGuard: perms.has('access.role.manage'), lastChange: null };
  }, [settings.data, perms, design]);
  const links = useMemo(() => new Set(Object.entries(LINKS).filter(([, href]) => mine.has(href)).map(([k]) => k)), [mine]);
  if (!design) return <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.1" state="no-access" />;
  const page = data ? timeSettingsPage(design, data, links) : design;
  const linkOf = (screenId: string) => Object.entries(LINKS).find(([k]) => design.sections.some((s) => s.settings.some((d) => d.key === k && d.linkScreenId === screenId)))?.[1];
  return (
    <SettingsPageScreen
      groups={SETTINGS_GROUPS}
      pageId={design.id}
      live={{
        page,
        canEdit: Boolean(data?.canEdit),
        lastChange: null,
        state: loadState(settings),
        onRetry: () => void settings.refetch(),
        savedTitle: `${design.title} saved`,
        onSave: async (values) => {
          for (const c of timeSettingsChanges(values, data!)) await write('PUT', '/settings', { key: c.key, value: c.value, scopeType: 'tenant' });
        },
        onOpenScreen: (screenId) => {
          const href = linkOf(screenId);
          if (href) router.push(href);
        },
      }}
    />
  );
}
