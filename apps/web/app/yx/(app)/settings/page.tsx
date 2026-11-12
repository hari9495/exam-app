'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsHomeScreen } from '@yukthix/ui/hiring';
import { useYxNav } from '../../../../lib/yx-shell';
import { settingsForViewer } from '../../../../lib/yx-settings-home';

// Settings › All settings (S-1, answer 1322): the drawn home with search across every setting. Only the pages the viewer
// may open are listed; each leads to its live editor.
export default function YxSettingsHomePage() {
  const router = useRouter();
  const { nav, ready } = useYxNav();
  const s = useMemo(() => settingsForViewer(nav), [nav]);
  return (
    <SettingsHomeScreen
      groups={s.groups}
      state={!ready ? 'loading' : s.groups.length ? 'ready' : 'no-access'}
      live={{ pageHref: s.pageHref, groupHref: s.groupHref, onNavigate: (href) => router.push(href) }}
    />
  );
}
