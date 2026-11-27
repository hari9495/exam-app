'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import { MobilePayTabScreen } from '@yukthix/ui/frame';
import type { MyPayslip } from '@yukthix/ui/pay';
import { payRows, usePhoneLanding } from '../../../../../lib/yx-phone';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { YxNavContext } from '../../../../../lib/yx-shell';

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// T2-H: the phone's Pay tab (the designed landing): the latest published payslip (the Payslips page's own call) and the
// person's pay pages in their menu. On a desk: Payslips.
export default function YxPayTabPage() {
  const router = useRouter();
  const phone = usePhoneLanding('/yx/me/payslips');
  const { nav } = useContext(YxNavContext);
  const slips = usePay<MyPayslip[]>(phone ? '/me/payslips' : null);
  if (!phone) return null;
  const latest = [...(slips.data ?? [])].sort((a, b) => b.month.localeCompare(a.month))[0];
  const state = payState(slips);
  return (
    <MobilePayTabScreen
      live={{
        state: state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready',
        onRetry: () => void slips.refetch(),
        latest: latest ? { month: monthLabel(latest.month), net: Number(latest.net), status: 'Published', href: '/yx/me/payslips' } : null,
        rows: payRows(nav),
        onNavigate: (href) => router.push(href),
      }}
    />
  );
}
