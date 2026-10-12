'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PayRunScreen, type BankFileMade, type BankFileRow, type PayRun, type PayslipDetail, type RunPayslip, type RunPerson, type RunProgressData, type RunReadiness, type RunVariance } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { payState, usePay, usePayDownload, usePayRead, usePayWrite } from '../../../../../../lib/yx-pay';
import { usePeopleSearch } from '../../../../../../lib/yx-pay-5b';

// Payroll › one run (PAY-10.01, PAY-02 … PAY-11): checks, calculation, payslips, approval, bank file and publishing.
export default function YxPayRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const perms = useYxPermissions();
  const base = `/runs/${encodeURIComponent(id)}`;
  const run = usePay<PayRun & { publishedAt?: string | null }>(base);
  const calculating = run.data?.status === 'calculating';
  const people = usePay<RunPerson[]>(`${base}/people`);
  const readiness = usePay<RunReadiness>(`${base}/readiness`);
  const progress = usePay<RunProgressData>(calculating ? `${base}/progress` : null);
  const payslips = usePay<RunPayslip[]>(`${base}/payslips`);
  const variances = usePay<RunVariance[]>(`${base}/variances`);
  const bankFiles = usePay<BankFileRow[]>(run.data && ['approved', 'paid'].includes(run.data.status) ? `${base}/bank-files` : null);
  const read = usePayRead();
  const write = usePayWrite();
  const download = usePayDownload();
  const search = usePeopleSearch();
  // While it calculates, look again every two seconds.
  useEffect(() => {
    if (!calculating) return;
    const t = setInterval(() => void Promise.all([run.refetch(), progress.refetch()]), 2000);
    return () => clearInterval(t);
  }, [calculating]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PayRunScreen
      state={payState(run)}
      onRetry={() => void run.refetch()}
      run={run.data ?? null}
      people={people.data ?? []}
      readiness={readiness.data ?? null}
      progress={progress.data ?? null}
      payslips={payslips.data ?? null}
      variances={variances.data ?? null}
      bankFiles={bankFiles.data ?? null}
      published={Boolean(run.data?.publishedAt)}
      can={{
        prepare: perms.has('payroll.run.prepare'),
        approve: perms.has('payroll.run.approve'),
        bankGenerate: perms.has('payroll.bankfile.generate'),
        bankRelease: perms.has('payroll.bankfile.release'),
        publish: perms.has('payroll.payslip.publish'),
        offcycle: perms.has('payroll.offcycle.prepare'),
      }}
      onBack={() => router.push('/yx/payroll/runs')}
      onWaive={(vid, reason) => write(`${base}/validations/${encodeURIComponent(vid)}/waive`, { reason })}
      onCalculate={() => write(`${base}/calculate`)}
      onPayslip={(sid) => read<PayslipDetail>(`/payslips/${encodeURIComponent(sid)}`)}
      onAck={(vid, note) => write(`${base}/variances/${encodeURIComponent(vid)}/ack`, note ? { note } : {})}
      onSubmit={(selfApprovalReason) => write(`${base}/submit`, selfApprovalReason ? { selfApprovalReason } : {})}
      onDecide={(decision, reason, confirmation) => write(`${base}/decision`, { decision, ...(reason ? { reason } : {}), ...(decision === 'approve' ? { confirmation } : {}) })}
      onVoid={(reason) => write(`${base}/void`, { reason })}
      onGenerateBank={(debitAccount, reason) => write<BankFileMade>(`${base}/bank-files`, { debitAccount, ...(reason ? { reason } : {}) })}
      onReleaseBank={(bid, confirmation) => write(`/bank-files/${encodeURIComponent(bid)}/release`, { confirmation })}
      onDownload={async (fileId, name) => {
        const link = await write<{ path: string }>(`/files/${encodeURIComponent(fileId)}/link`);
        await download(link.path, name);
      }}
      onPublish={(confirmation) => write(`${base}/publish`, { confirmation })}
      onSearchPeople={(q) => search(q)}
      onAddItem={(item) => write(`${base}/items`, item)}
    />
  );
}
