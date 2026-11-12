'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SettingsGroupScreen } from '@yukthix/ui/hiring';
import { useYxNav } from '../../../../../lib/yx-shell';
import { settingsForViewer } from '../../../../../lib/yx-settings-home';

// Settings › a group (S-1, answer 1322): the drawn group page with the pages the viewer may open, each leading to its
// live editor. An unknown group, or one with nothing the viewer may open, says no access.
export default function YxSettingsGroupPage() {
  const router = useRouter();
  const { group } = useParams<{ group: string }>();
  const { nav, ready } = useYxNav();
  const s = useMemo(() => settingsForViewer(nav), [nav]);
  return (
    <SettingsGroupScreen
      groups={s.groups}
      groupId={s.groupIdOf(group) ?? 0}
      state={ready ? 'ready' : 'loading'}
      live={{ pageHref: s.pageHref, groupHref: s.groupHref, onNavigate: (href) => router.push(href) }}
    />
  );
}
