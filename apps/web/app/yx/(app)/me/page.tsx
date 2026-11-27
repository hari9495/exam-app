'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@yukthix/ui';
import { MobileMeTabScreen } from '@yukthix/ui/frame';
import type { MyResignation } from '@yukthix/ui/lifecycle';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { useLife } from '../../../../lib/yx-lifecycle';
import { meGroups, navHref, usePhoneLanding } from '../../../../lib/yx-phone';
import { YxNavContext } from '../../../../lib/yx-shell';

// T2-H: the phone's Me tab (the designed landing): the person's own pages from their menu, grouped as designed, and their
// exit while serving notice (My exit's own call). On a desk: Profile.
export default function YxMeTabPage() {
  const router = useRouter();
  const { nav } = useContext(YxNavContext);
  const profile = navHref(nav, 'profile') ?? '/profile';
  const phone = usePhoneLanding(profile);
  const me = useCurrentUser();
  const exitHref = navHref(nav, 'resign');
  const resignation = useLife<MyResignation>(phone && exitHref ? '/lifecycle/me/resignation' : null);
  if (!phone) return null;
  const current = resignation.data?.current;
  const lastDay = current ? (current.approvedLwd ?? current.requestedLwd ?? current.standardLwd) : null;
  return (
    <MobileMeTabScreen
      live={{
        name: me.data?.name || me.data?.email || 'Your account',
        secondary: me.data?.email ?? '',
        ...(current && exitHref && lastDay ? { exit: { title: `Your exit · last day ${formatDate(new Date(`${lastDay}T00:00:00`))}`, href: exitHref } } : {}),
        groups: meGroups(nav),
        onNavigate: (href) => router.push(href),
      }}
    />
  );
}
