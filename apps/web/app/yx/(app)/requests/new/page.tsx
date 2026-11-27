'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import { MobileRequestTypePickerScreen } from '@yukthix/ui/frame';
import { pickerRows, usePhoneLanding } from '../../../../../lib/yx-phone';
import { YxNavContext } from '../../../../../lib/yx-shell';

// T2-H: Requests › New request on a phone: the types "+ New" offers the person (the same pages), plus loans and
// resignation from their menu. On a desk "+ New" in the top bar does this, so the address moves on to My requests.
export default function YxNewRequestPage() {
  const router = useRouter();
  const phone = usePhoneLanding('/yx/me/requests');
  const { nav } = useContext(YxNavContext);
  if (!phone) return null;
  return <MobileRequestTypePickerScreen live={{ rows: pickerRows(nav), onNavigate: (href) => router.push(href) }} />;
}
