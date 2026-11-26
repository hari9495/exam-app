'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { PaymentsScreen, type BankFileRow, type Disbursement, type PayRun, type RunJournal, type RunPayslip } from '@yukthix/ui/pay';
import { apiFetch, apiFetchBlob } from '../../../../../../../lib/api-client';
import { useAuth } from '../../../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../../../lib/yx-org';
import { payState, saveBlob, usePay, usePayDownload, usePayWrite } from '../../../../../../../lib/yx-pay';
import { useApiWrite, useNames } from '../../../../../../../lib/yx-pay-5j';

// Payroll › one run › Payments (PAY-10.09, PAY-10 design): the bank's results, the cash and cheque register, the run's
// bank files and the journal export.
export default function YxPayRunPaymentsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const tab = useSearchParams().get('tab') === 'journal' ? 'journal' : undefined;
  const perms = useYxPermissions();
  const { accessToken } = useAuth();
  const base = `/runs/${encodeURIComponent(id)}`;
  const run = usePay<PayRun>(base);
  const payslips = usePay<RunPayslip[]>(`${base}/payslips`);
  const approved = !!run.data && ['approved', 'paid'].includes(run.data.status);
  const record = perms.has('payroll.payment.record');
  const journalOk = perms.has('payroll.journal.export');
  const disbursements = usePay<Disbursement[]>(record ? `${base}/disbursements` : null);
  const bankFiles = usePay<BankFileRow[]>(approved ? `${base}/bank-files` : null);
  // Enterprise E4 (O22): a reopened or voided run shows the reversing journal of what went to the books.
  const reversible = !!run.data && ['void', 'reopened'].includes(run.data.status);
  const journal = usePay<RunJournal>((approved || reversible) && journalOk ? `${base}/journal` : null);
  const write = usePayWrite();
  const upload = useApiWrite();
  const download = usePayDownload();
  const nameOf = useNames();
  return (
    <PaymentsScreen
      live={{
        view: 'run',
        tab,
        state: payState(run, payslips),
        onRetry: () => void Promise.all([run.refetch(), payslips.refetch()]),
        run: run.data ?? null,
        payslips: payslips.data ?? null,
        disbursements: disbursements.data ?? null,
        bankFiles: bankFiles.data ?? null,
        journal: journal.data ?? null,
        nameOf,
        can: { record, journal: journalOk, bankFile: perms.has('payroll.bankfile.generate') },
        onRepay: (payslipId, x) => write(`/payslips/${encodeURIComponent(payslipId)}/repay`, x),
        // A light audit record only: no cache to refresh.
        onShowPay: () => apiFetch(`/payroll${base}/pay-views`, { method: 'POST' }, accessToken ?? undefined),
        onBack: () => router.push(`/yx/payroll/runs/${encodeURIComponent(id)}`),
        onResults: (rows) => write(`${base}/payment-results`, { rows }),
        onUploadResults: (file) => {
          const form = new FormData();
          form.append('file', file);
          return upload<{ recorded: number }>(`/payroll${base}/payment-results/upload`, form);
        },
        onDisburse: (d) => write(`${base}/disbursements`, d),
        onDownloadBankFile: async (fileId, name) => {
          const link = await write<{ path: string }>(`/files/${encodeURIComponent(fileId)}/link`);
          await download(link.path, name);
        },
        onExportJournal: async (format) => {
          const { blob, filename } = await apiFetchBlob(`/payroll${base}/journal/export`, { method: 'POST', body: JSON.stringify({ format }) }, accessToken ?? undefined);
          saveBlob(blob, filename ?? `payroll-journal.${format === 'tally' ? 'xml' : 'csv'}`);
          await journal.refetch();
        },
      }}
    />
  );
}
