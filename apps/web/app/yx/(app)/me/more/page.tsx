'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import { MobileMoreScreen } from '@yukthix/ui/frame';
import { moreAreas, usePhoneLanding } from '../../../../../lib/yx-phone';
import { YxNavContext } from '../../../../../lib/yx-shell';

// T2-H: Me › More on a phone: the areas of the person's own menu with no tab of their own. On a desk the rail has them.
export default function YxMoreTabPage() {
  const router = useRouter();
  const phone = usePhoneLanding('/yx/home');
  const { nav } = useContext(YxNavContext);
  if (!phone) return null;
  return <MobileMoreScreen live={{ areas: moreAreas(nav), onNavigate: (href) => router.push(href) }} />;
}
