'use client';

import { PayslipViewerScreen, type MyPayslip, type PayslipDetail, type PayslipQueryView } from '@yukthix/ui/pay';
import { payState, usePay, usePayDownload, usePayRead, usePayWrite } from '../../../../../lib/yx-pay';

// Me › Payslips (PAY-21 with PAY-40 "Why is my pay different?"): published payslips, lines explained, PDF, a query.
export default function YxMyPayslipsPage() {
  const slips = usePay<MyPayslip[]>('/me/payslips');
  // Own queries (founder answer 16: withdrawn by the person, no reply needed); payroll staff get theirs on PAY-20.
  const queries = usePay<PayslipQueryView[]>('/queries');
  const read = usePayRead();
  const write = usePayWrite();
  const download = usePayDownload();
  return (
    <PayslipViewerScreen
      live={{
        state: payState(slips),
        onRetry: () => void slips.refetch(),
        payslips: slips.data ?? null,
        onOpen: (id) => read<PayslipDetail>(`/payslips/${encodeURIComponent(id)}`),
        onPdf: (id, month) => download(`/payroll/me/payslips/${encodeURIComponent(id)}/pdf`, `payslip-${month}.pdf`),
        onQuery: (id, text, lineCode) => write(`/me/payslips/${encodeURIComponent(id)}/queries`, { text, ...(lineCode ? { lineCode } : {}) }),
        queries: queries.data ?? null,
        onWithdraw: (q) => write(`/queries/${encodeURIComponent(q.id)}`, { status: 'closed' }, 'PATCH'),
      }}
    />
  );
}
