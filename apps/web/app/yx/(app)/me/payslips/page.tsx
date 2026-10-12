'use client';

import { MyPayslipsScreen, type MyPayslip, type PayslipDetail } from '@yukthix/ui/pay';
import { payState, usePay, usePayDownload, usePayRead, usePayWrite } from '../../../../../lib/yx-pay';

// Me › Payslips (PAY-10.03, PAY-21; PAY-10.05 the pay-change explainer): published payslips, lines explained, PDF, a query.
export default function YxMyPayslipsPage() {
  const slips = usePay<MyPayslip[]>('/me/payslips');
  const read = usePayRead();
  const write = usePayWrite();
  const download = usePayDownload();
  return (
    <MyPayslipsScreen
      state={payState(slips)}
      onRetry={() => void slips.refetch()}
      payslips={slips.data ?? null}
      onOpen={(id) => read<PayslipDetail>(`/payslips/${encodeURIComponent(id)}`)}
      onPdf={(id, month) => download(`/payroll/me/payslips/${encodeURIComponent(id)}/pdf`, `payslip-${month}.pdf`)}
      onQuery={(id, text, lineCode) => write(`/me/payslips/${encodeURIComponent(id)}/queries`, { text, ...(lineCode ? { lineCode } : {}) })}
    />
  );
}
