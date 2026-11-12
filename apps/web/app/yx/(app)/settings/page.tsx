'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SETTINGS_GROUPS, SettingsHomeScreen, changeWords } from '@yukthix/ui/hiring';
import { useYxNav } from '../../../../lib/yx-shell';
import { settingsForViewer } from '../../../../lib/yx-settings-home';
import { PAGE_SETTING_KEYS, pageOfSetting, useSettingsHistory } from '../../../../lib/yx-settings-history';
import { useYxPermissions } from '../../../../lib/yx-org';
import { AUDIT_LOG } from '../../../../lib/yx-nav';

// Settings › All settings (S-1, answer 1322): the drawn home with search across every setting. Only the pages the viewer
// may open are listed; each leads to its live editor.
export default function YxSettingsHomePage() {
  const router = useRouter();
  const { nav, ready } = useYxNav();
  const s = useMemo(() => settingsForViewer(nav), [nav]);
  const perms = useYxPermissions();
  // Answer 1461: the last changes on the pages this person may open (the same source as each page's history).
  const open = useMemo(() => s.groups.flatMap((g) => g.pages.map((p) => p.id)), [s.groups]);
  const history = useSettingsHistory(open.flatMap((id) => PAGE_SETTING_KEYS[id] ?? []), 5);
  const pages = useMemo(() => new Map(SETTINGS_GROUPS.flatMap((g) => g.pages).map((p) => [p.id, p])), []);
  const recent = (history.data ?? []).flatMap((r) => {
    const pageId = pageOfSetting(r.key);
    if (!pageId || !open.includes(pageId)) return [];
    const w = changeWords(pages.get(pageId) ?? null, r);
    return [{ id: r.id, what: w.what, from: w.from, to: w.to, who: r.by, at: r.at, pageId }];
  });
  return (
    <SettingsHomeScreen
      groups={s.groups}
      state={!ready ? 'loading' : s.groups.length ? 'ready' : 'no-access'}
      live={{ pageHref: s.pageHref, groupHref: s.groupHref, onNavigate: (href) => router.push(href), recent, auditHref: perms.has('audit.view') ? AUDIT_LOG : undefined }}
    />
  );
}
