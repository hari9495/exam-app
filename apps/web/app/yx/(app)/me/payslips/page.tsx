'use client';

import { PayslipViewerScreen, type MyPayslip, type PayslipDetail, type PayslipQueryView } from '@yukthix/ui/pay';
import { payState, usePay, usePayBlob, usePayDownload, usePayRead, usePayWrite } from '../../../../../lib/yx-pay';

// Me › Payslips (PAY-21 with PAY-40 "Why is my pay different?"): published payslips, lines explained, PDF, a query.
export default function YxMyPayslipsPage() {
  const slips = usePay<MyPayslip[]>('/me/payslips');
  // Own queries (founder answer 16: withdrawn by the person, no reply needed); payroll staff get theirs on PAY-20.
  const queries = usePay<PayslipQueryView[]>('/queries');
  const read = usePayRead();
  const write = usePayWrite();
  const download = usePayDownload();
  const blob = usePayBlob();
  const viaLink = async (path: string) => (await read<{ path: string }>(path)).path;
  return (
    <PayslipViewerScreen
      live={{
        state: payState(slips),
        onRetry: () => void slips.refetch(),
        payslips: slips.data ?? null,
        onOpen: (id) => read<PayslipDetail>(`/payslips/${encodeURIComponent(id)}`),
        // The PDF route answers with a single-use 60-second link; the file is fetched from it.
        onPdf: async (id, month) => download(await viaLink(`/me/payslips/${encodeURIComponent(id)}/pdf`), `payslip-${month}.pdf`),
        // PAY-21 Document: the same PDF shown in the page.
        onPdfFile: async (id) => blob(await viaLink(`/me/payslips/${encodeURIComponent(id)}/pdf`)),
        // T2-B 65: the tax year's payslips as one zip, through the same kind of link.
        onDownloadYear: async (taxYear) => download(await viaLink(`/me/payslips/year/${encodeURIComponent(taxYear)}`), `payslips-${taxYear}.zip`),
        onQuery: (id, text, lineCode) => write(`/me/payslips/${encodeURIComponent(id)}/queries`, { text, ...(lineCode ? { lineCode } : {}) }),
        queries: queries.data ?? null,
        onWithdraw: (q) => write(`/queries/${encodeURIComponent(q.id)}`, { status: 'closed' }, 'PATCH'),
      }}
    />
  );
}
